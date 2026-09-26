import { intakeSnapshot, ServiceDefinitionError } from '@workspace/service-definition';
import { mapOperationsError } from './operations-context';
import { canRecordConsumption } from '../domain/operations-rules';
import { offerNextReplacement } from './waiting-list';
import { recordConsumptionInTx } from './inventory';
import { slotContext, selectedSlot } from './scheduling-slots';
import { recordAppointmentHistory as history } from './scheduling-history';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, ne, gte, lt, inArray, or, sql } from 'drizzle-orm';
import {
  db, usersTable, clinicsTable, branchesTable, servicesTable, roomsTable, customersTable,
  serviceEmployeesTable, roomServicesTable, appointmentsTable, appointmentStatusHistoryTable,
  schedulingCommandsTable, type User, type Appointment,
} from '@workspace/db';
import { hasPermission } from '../domain/permissions';
import {
  allowedTransitions, canAccessScheduling, canReadAll, canReadAppointment, canReschedule,
  canSchedule, canWriteNotes, isProvider, canonicalJson,
} from '../domain/scheduling-rules';
import { branchDate, computeSlots } from '../domain/scheduling-time';
import type { BookingInput, AvailabilityInput, CalendarInput, TransitionInput, RescheduleInput, AppointmentNotesInput, BookingCustomerInput } from '../domain/scheduling-validation';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { recordAudit } from './audit';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<Tx, 'select' | 'insert' | 'update' | 'execute'>;
export function scheduleClinic(actor: User): number {
  if (!actor.clinicId || actor.role === 'platform_owner' || !canAccessScheduling(actor)) throw forbidden();
  return actor.clinicId;
}
function requireScheduler(actor: User) { scheduleClinic(actor); if (!canSchedule(actor)) throw forbidden(); }
const snapshot = (a: Appointment) => ({ startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), employeeId: a.employeeId, roomId: a.roomId });
function mapDatabaseError(error: unknown): never {
  const e = error as {code?: string; cause?: {code?: string}};
  const code = e.code ?? e.cause?.code;
  if (code === '23P01') throw conflict('slot_taken');
  if (code === '23503') throw badRequest('invalid_reference');
  if (code === '40001' || code === '40P01') throw conflict('scheduling_retry');
  mapOperationsError(error);
}
async function freshActor(tx: Executor, actor: User): Promise<User> {
  const clinicId = scheduleClinic(actor);
  const [fresh] = await tx.select({user: usersTable, clinicStatus: clinicsTable.status}).from(usersTable)
    .innerJoin(clinicsTable, eq(clinicsTable.id, usersTable.clinicId))
    .where(and(eq(usersTable.id, actor.id), eq(usersTable.clinicId, clinicId)));
  if (!fresh || !fresh.user.isActive || fresh.user.mustChangePassword || fresh.clinicStatus !== 'active') throw forbidden();
  scheduleClinic(fresh.user); return fresh.user;
}
async function findAppointment(tx: Executor, actor: User, id: number): Promise<Appointment> {
  const [a] = await tx.select().from(appointmentsTable).where(and(eq(appointmentsTable.clinicId, scheduleClinic(actor)), eq(appointmentsTable.id, id)));
  // Uniform 404 avoids revealing the existence of another employee's/clinic's appointment.
  if (!a || !canReadAppointment(actor, a)) throw notFound('appointment_not_found');
  return a;
}
/** Lock order matches setup writes: clinic lock -> re-read actor -> command -> appointment.
 * Commands and their results commit together. A retry must have exactly the same payload.
 * Returning only a record id (rather than a stored PHI response) avoids stale privilege leaks.
 */
async function command<T extends {idempotencyKey: string}>(actor: User, operation: string, input: T,
  authorize: (tx: Tx, fresh: User) => Promise<void>, work: (tx: Tx, fresh: User) => Promise<number>) {
  const clinicId = scheduleClinic(actor), {idempotencyKey, ...payload} = input;
  const requestHash = createHash('sha256').update(canonicalJson({operation, payload})).digest('hex');
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7140002, ${clinicId})`);
      const fresh = await freshActor(tx, actor);
      await authorize(tx, fresh);
      const [existing] = await tx.select().from(schedulingCommandsTable).where(and(eq(schedulingCommandsTable.clinicId, clinicId), eq(schedulingCommandsTable.actorId, fresh.id), eq(schedulingCommandsTable.key, idempotencyKey)));
      if (existing) {
        if (existing.requestHash !== requestHash || existing.operation !== operation) throw conflict('idempotency_mismatch');
        return {id: existing.resultId, replayed: true};
      }
      const id = await work(tx, fresh);
      await tx.insert(schedulingCommandsTable).values({clinicId, actorId: fresh.id, key: idempotencyKey, requestHash, operation, resultId: id});
      return {id, replayed: false};
    });
  } catch (error) { mapDatabaseError(error); }
}

export async function availability(actor: User, input: AvailabilityInput) {
  requireScheduler(actor);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(7140002, ${scheduleClinic(actor)})`);
    const fresh = await freshActor(tx, actor); requireScheduler(fresh);
    const existing = input.excludeAppointmentId ? await findAppointment(tx, fresh, input.excludeAppointmentId) : undefined;
    if (existing && (!canReschedule(fresh, existing) || existing.branchId !== input.branchId || existing.serviceId !== input.serviceId)) throw badRequest('invalid_reschedule');
    const result = await slotContext(tx, fresh, input, existing);
    return {date: input.date, timeZone: result.branch.timeZone, durationMinutes: result.durationMinutes, slots: result.slots,
      roomRequired: result.requiresRoom, stepMinutes: 15};
  });
}
export async function createAppointment(actor: User, input: BookingInput) {
  return command(actor, 'book', input, async (_tx, fresh) => requireScheduler(fresh), async (tx, fresh) => {
    const clinicId = scheduleClinic(fresh);
    const [customer] = await tx.select({id: customersTable.id}).from(customersTable).where(and(eq(customersTable.clinicId, clinicId), eq(customersTable.id, input.customerId)));
    if (!customer) throw notFound('record_not_found');
    const context = await selectedSlot(tx, fresh, input);
    const [service]=await tx.select({definition:servicesTable.definition}).from(servicesTable).where(and(eq(servicesTable.clinicId,clinicId),eq(servicesTable.id,input.serviceId)));
    if(!service)throw notFound('record_not_found');
    let serviceIntake;
    try{serviceIntake=intakeSnapshot(service.definition,input.intakeAnswers??{});}catch(e){if(e instanceof ServiceDefinitionError)throw badRequest('service_intake_invalid');throw e;}
    const [a] = await tx.insert(appointmentsTable).values({clinicId, branchId: input.branchId, customerId: input.customerId,
      serviceId: input.serviceId, employeeId: input.employeeId, roomId: context.selected.roomId,
      startsAt: new Date(context.selected.startsAt), endsAt: new Date(context.selected.endsAt),
      durationMinutes: context.durationMinutes, requiresRoom: context.requiresRoom, status: 'pending',
      notes: input.notes, notesLang: input.notesLang, serviceIntake, createdBy: fresh.id}).returning();
    await history(tx, fresh, 'created', null, a!); return a!.id;
  });
}
export async function transitionAppointment(actor: User, id: number, input: TransitionInput) {
  const authorize = async (tx: Tx, fresh: User) => {
    const a = await findAppointment(tx, fresh, id);
    if (input.consumption && !canRecordConsumption(fresh, a)) throw forbidden();
    if (!canSchedule(fresh) && !(isProvider(fresh) && a.employeeId === fresh.id && ['in_service','completed'].includes(input.status))) throw forbidden();
  };
  return command(actor, `status:${id}`, input, authorize, async (tx, fresh) => {
    const before = await findAppointment(tx, fresh, id);
    if (before.version !== input.expectedVersion) throw conflict('appointment_changed');
    if (!allowedTransitions(fresh, before).includes(input.status)) throw conflict('invalid_transition');
    if (input.status === 'no_show' && before.startsAt.getTime() > Date.now()) throw badRequest('too_early_no_show');
    if (input.notes !== undefined && !canWriteNotes(fresh, before)) throw forbidden();
    const [after] = await tx.update(appointmentsTable).set({status: input.status, version: before.version + 1, updatedAt: new Date(),
      ...(input.notes !== undefined ? {notes: input.notes, notesLang: input.notesLang!} : {})})
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.clinicId, scheduleClinic(fresh)), eq(appointmentsTable.version, before.version))).returning();
    if (!after) throw conflict('appointment_changed');
    await history(tx, fresh, 'status_changed', before, after, input.reason);
    if (after.status === 'cancelled') await offerNextReplacement(tx, fresh, after);
    if (input.consumption) await recordConsumptionInTx(tx, fresh, after, input.consumption);
    return id;
  });
}
export async function rescheduleAppointment(actor: User, id: number, input: RescheduleInput) {
  return command(actor, `reschedule:${id}`, input, async (tx, fresh) => { requireScheduler(fresh); await findAppointment(tx, fresh, id); }, async (tx, fresh) => {
    const before = await findAppointment(tx, fresh, id);
    if (before.version !== input.expectedVersion) throw conflict('appointment_changed');
    if (!canReschedule(fresh, before)) throw conflict('invalid_reschedule');
    const context = await selectedSlot(tx, fresh, {branchId: before.branchId, serviceId: before.serviceId, employeeId: input.employeeId, startsAt: input.startsAt}, before);
    if (before.employeeId === input.employeeId && before.startsAt.getTime() === Date.parse(context.selected.startsAt) && before.roomId === context.selected.roomId) throw badRequest('reschedule_unchanged');
    const [after] = await tx.update(appointmentsTable).set({employeeId: input.employeeId, roomId: context.selected.roomId,
      startsAt: new Date(context.selected.startsAt), endsAt: new Date(context.selected.endsAt),
      status: 'pending', version: before.version + 1, updatedAt: new Date()})
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.clinicId, scheduleClinic(fresh)), eq(appointmentsTable.version, before.version))).returning();
    if (!after) throw conflict('appointment_changed');
    await history(tx, fresh, 'rescheduled', before, after, input.reason); return id;
  });
}
export async function saveAppointmentNotes(actor: User, id: number, input: AppointmentNotesInput) {
  return command(actor, `notes:${id}`, input, async (tx, fresh) => {if (!canWriteNotes(fresh, await findAppointment(tx, fresh, id))) throw forbidden();}, async (tx, fresh) => {
    const before = await findAppointment(tx, fresh, id);
    if (before.version !== input.expectedVersion) throw conflict('appointment_changed');
    const [after] = await tx.update(appointmentsTable).set({notes: input.notes, notesLang: input.notesLang, version: before.version + 1, updatedAt: new Date()})
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.clinicId, scheduleClinic(fresh)), eq(appointmentsTable.version, before.version))).returning();
    if (!after) throw conflict('appointment_changed');
    await history(tx, fresh, 'notes_updated', before, after); return id;
  });
}
export async function createBookingCustomer(actor: User, input: BookingCustomerInput) {
  return command(actor, 'booking_customer', input, async (_tx, fresh) => { requireScheduler(fresh); if (!hasPermission(fresh, 'customers.manage')) throw forbidden(); }, async (tx, fresh) => {
    const clinicId = scheduleClinic(fresh);
    if (input.branchId !== null) {
      const [branch] = await tx.select({id: branchesTable.id}).from(branchesTable).where(and(eq(branchesTable.id, input.branchId), eq(branchesTable.clinicId, clinicId)));
      if (!branch) throw notFound('record_not_found');
    }
    const [customer] = await tx.insert(customersTable).values({clinicId, branchId: input.branchId, name: input.name, nameLang: input.nameLang,
      phone: input.phone || null, email: input.email ? input.email.toLowerCase() : null}).returning({id: customersTable.id});
    await recordAudit({clinicId, actorUserId: fresh.id, action: 'customer.created', entityType: 'customer', entityId: customer!.id}, tx);
    return customer!.id;
  });
}

/** Purpose-limited booking/display metadata; never expose login, permission, leave or private notes. */
export async function schedulingCatalog(actor: User, input: {branchId?: number; serviceId?: number}) {
  const clinicId = scheduleClinic(actor);
  const branches = await db.select({id: branchesTable.id, name: branchesTable.name, nameLang: branchesTable.nameLang, timeZone: branchesTable.timeZone}).from(branchesTable).where(eq(branchesTable.clinicId, clinicId)).orderBy(asc(branchesTable.name));
  if (input.branchId && !branches.some((b) => b.id === input.branchId)) throw notFound('record_not_found');
  const serviceRows = await db.select({id: servicesTable.id, name: servicesTable.name, nameLang: servicesTable.nameLang, branchId: servicesTable.branchId,
    durationMinutes: servicesTable.durationMinutes, price: servicesTable.price, currency: servicesTable.currency, requiresRoom: servicesTable.requiresRoom, definition:servicesTable.definition})
    .from(servicesTable).where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.isActive, true),
      input.branchId ? or(eq(servicesTable.branchId, input.branchId), sql`${servicesTable.branchId} is null`) : undefined)).orderBy(asc(servicesTable.name));
  if (input.serviceId && !serviceRows.some((s) => s.id === input.serviceId)) throw notFound('record_not_found');
  const links = input.serviceId ? await db.select({employeeId: serviceEmployeesTable.employeeId}).from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.serviceId, input.serviceId))) : [];
  const employees = await db.select({id: usersTable.id, name: usersTable.name, nameLang: usersTable.nameLang, branchId: usersTable.branchId})
    .from(usersTable).where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.isActive, true),
      canReadAll(actor) ? undefined : eq(usersTable.id, actor.id),
      input.branchId ? or(eq(usersTable.branchId, input.branchId), sql`${usersTable.branchId} is null`) : undefined,
      input.serviceId ? (links.length ? inArray(usersTable.id, links.map((v) => v.employeeId)) : sql`false`) : undefined)).orderBy(asc(usersTable.name));
  return {branches, services: serviceRows, employees, canBook: canSchedule(actor), canReadAll: canReadAll(actor),
    canSearchCustomers: hasPermission(actor, 'customers.read'), canAddCustomer: hasPermission(actor, 'customers.manage')};
}
const listSelection = {
  id: appointmentsTable.id, branchId: appointmentsTable.branchId, clinicId: appointmentsTable.clinicId,
  customerId: appointmentsTable.customerId, serviceId: appointmentsTable.serviceId, employeeId: appointmentsTable.employeeId,
  roomId: appointmentsTable.roomId, startsAt: appointmentsTable.startsAt, endsAt: appointmentsTable.endsAt,
  status: appointmentsTable.status, version: appointmentsTable.version, durationMinutes: appointmentsTable.durationMinutes,
  customer: {id: customersTable.id, name: customersTable.name, nameLang: customersTable.nameLang},
  employee: {id: usersTable.id, name: usersTable.name, nameLang: usersTable.nameLang},
  service: {id: servicesTable.id, name: servicesTable.name, nameLang: servicesTable.nameLang},
  branch: {id: branchesTable.id, name: branchesTable.name, nameLang: branchesTable.nameLang, timeZone: branchesTable.timeZone},
};
function joinedAppointments(executor: Pick<typeof db, 'select'> = db) {
  return executor.select(listSelection).from(appointmentsTable)
    .innerJoin(branchesTable, and(eq(branchesTable.id, appointmentsTable.branchId), eq(branchesTable.clinicId, appointmentsTable.clinicId)))
    .innerJoin(customersTable, and(eq(customersTable.id, appointmentsTable.customerId), eq(customersTable.clinicId, appointmentsTable.clinicId)))
    .innerJoin(usersTable, and(eq(usersTable.id, appointmentsTable.employeeId), eq(usersTable.clinicId, appointmentsTable.clinicId)))
    .innerJoin(servicesTable, and(eq(servicesTable.id, appointmentsTable.serviceId), eq(servicesTable.clinicId, appointmentsTable.clinicId)));
}
export async function listAppointments(actor: User, input: CalendarInput) {
  const clinicId = scheduleClinic(actor), ownOnly = !canReadAll(actor) || input.mine === 'true';
  if (ownOnly && input.employeeId && input.employeeId !== actor.id) throw forbidden();
  const localDay = sql`(${appointmentsTable.startsAt} AT TIME ZONE ${branchesTable.timeZone})::date`;
  const condition = and(eq(appointmentsTable.clinicId, clinicId), ownOnly ? eq(appointmentsTable.employeeId, actor.id) : undefined,
    input.employeeId ? eq(appointmentsTable.employeeId, input.employeeId) : undefined,
    input.branchId ? eq(appointmentsTable.branchId, input.branchId) : undefined,
    input.serviceId ? eq(appointmentsTable.serviceId, input.serviceId) : undefined,
    input.customerId ? eq(appointmentsTable.customerId, input.customerId) : undefined,
    input.status ? eq(appointmentsTable.status, input.status) : undefined,
    input.date ? (input.through ? sql`${localDay} between ${input.date}::date and ${input.through}::date` : sql`${localDay} = ${input.date}::date`) : undefined);
  const rows = await joinedAppointments().where(condition).orderBy(input.date ? asc(appointmentsTable.startsAt) : desc(appointmentsTable.startsAt), asc(appointmentsTable.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
  const [count] = await db.select({total: sql<number>`count(*)::int`}).from(appointmentsTable).innerJoin(branchesTable, and(eq(branchesTable.id, appointmentsTable.branchId), eq(branchesTable.clinicId, clinicId))).where(condition);
  return {items: rows.map((a) => ({...a, nextActions: allowedTransitions(actor, a).filter((to) => to !== 'no_show' || a.startsAt.getTime() <= Date.now()), canReschedule: canReschedule(actor, a)})),
    total: count!.total, page: input.page, pageSize: input.pageSize, ownOnly};
}
export async function getAppointment(actor: User, id: number) {
  const clinicId = scheduleClinic(actor);
  return db.transaction(async (tx) => {
  // Hold the same clinic lock as reassignment/setup while permission checks and PHI reads run.
  await tx.execute(sql`select pg_advisory_xact_lock_shared(7140002, ${clinicId})`);
  actor = await freshActor(tx, actor);
  const a = await findAppointment(tx, actor, id);
  const [row] = await joinedAppointments(tx).where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.clinicId, scheduleClinic(actor))));
  if (!row) throw notFound('appointment_not_found');
  let customerDetails: {phone: string|null; email: string|null; notes: string; sensitiveNotes?: string} | undefined;
  if (hasPermission(actor, 'customers.read')) {
    const [customer] = await tx.select({phone: customersTable.phone, email: customersTable.email, notes: customersTable.notes,
      ...(hasPermission(actor, 'customers.manage') ? {sensitiveNotes: customersTable.sensitiveNotes} : {})}).from(customersTable).where(and(eq(customersTable.clinicId, a.clinicId), eq(customersTable.id, a.customerId)));
    customerDetails = customer;
    if (hasPermission(actor, 'customers.manage')) await recordAudit({clinicId: a.clinicId, actorUserId: actor.id, action: 'customer.sensitive_notes_read', entityType: 'customer', entityId: a.customerId}, tx);
  }
  const [room] = a.roomId ? await tx.select({id: roomsTable.id, name: roomsTable.name, nameLang: roomsTable.nameLang}).from(roomsTable).where(and(eq(roomsTable.clinicId, a.clinicId), eq(roomsTable.id, a.roomId))) : [];
  const events = await tx.select({id: appointmentStatusHistoryTable.id, event: appointmentStatusHistoryTable.event, fromStatus: appointmentStatusHistoryTable.fromStatus,
    toStatus: appointmentStatusHistoryTable.toStatus, at: appointmentStatusHistoryTable.at, reason: appointmentStatusHistoryTable.reason,
    before: appointmentStatusHistoryTable.before, after: appointmentStatusHistoryTable.after,
    actor: {id: usersTable.id, name: usersTable.name, nameLang: usersTable.nameLang}}).from(appointmentStatusHistoryTable)
    .innerJoin(usersTable, and(eq(usersTable.id, appointmentStatusHistoryTable.actorId), eq(usersTable.clinicId, a.clinicId)))
    .where(and(eq(appointmentStatusHistoryTable.clinicId, a.clinicId), eq(appointmentStatusHistoryTable.appointmentId, id))).orderBy(asc(appointmentStatusHistoryTable.id));
  return {...row, requiresRoom: a.requiresRoom, room: room ?? null, customerDetails,
    ...(canWriteNotes(actor, a) ? {notes: a.notes, notesLang: a.notesLang, serviceIntake:a.serviceIntake} : {}),
    // General read access does not imply access to provider/operational notes or free-text reasons.
    history: events.map((e) => canWriteNotes(actor, a) ? e : {...e, reason: ''}),
    canEditNotes: canWriteNotes(actor, a), canReschedule: canReschedule(actor, a),
    nextActions: allowedTransitions(actor, a).filter((to) => to !== 'no_show' || a.startsAt.getTime() <= Date.now())};
  });
}
export async function customerAppointments(actor: User, customerId: number, input: CalendarInput) {
  scheduleClinic(actor);
  if (!hasPermission(actor, 'customers.read')) throw forbidden();
  const [customer] = await db.select({id: customersTable.id}).from(customersTable).where(and(eq(customersTable.clinicId, actor.clinicId!), eq(customersTable.id, customerId)));
  if (!customer) throw notFound('record_not_found');
  return listAppointments(actor, {...input, customerId});
}
export async function schedulingHome(actor: User, branchId?:number) {
  const clinicId = scheduleClinic(actor), mine = isProvider(actor);
  const localStart = sql`(${appointmentsTable.startsAt} AT TIME ZONE ${branchesTable.timeZone})::date`;
  const today = sql`(now() AT TIME ZONE ${branchesTable.timeZone})::date`;
  const scoped = and(eq(appointmentsTable.clinicId, clinicId), branchId?eq(appointmentsTable.branchId,branchId):undefined, (mine || !canReadAll(actor)) ? eq(appointmentsTable.employeeId, actor.id) : undefined);
  const todayRows = await joinedAppointments().where(and(scoped, sql`${localStart} = ${today}`)).orderBy(asc(appointmentsTable.startsAt)).limit(20);
  const [total] = await db.select({total: sql<number>`count(*)::int`}).from(appointmentsTable).innerJoin(branchesTable, eq(branchesTable.id, appointmentsTable.branchId)).where(and(scoped, sql`${localStart} = ${today}`));
  const [next] = await joinedAppointments().where(and(scoped, inArray(appointmentsTable.status, ['pending','confirmed','checked_in','in_service']), or(inArray(appointmentsTable.status, ['checked_in','in_service']), gte(appointmentsTable.endsAt, new Date()))))
    .orderBy(asc(appointmentsTable.startsAt), asc(appointmentsTable.id)).limit(1);
  return {items: todayRows.map((a)=>({...a,nextActions:allowedTransitions(actor,a).filter((to)=>to!=='no_show'||a.startsAt.getTime()<=Date.now()),canReschedule:canReschedule(actor,a)})), total: total!.total, next: next ?? null, ownOnly: mine || !canReadAll(actor)};
}

/** Refuse to advertise a functioning booking service on a push-managed DB without its guards. */
export async function verifySchedulingGuards() {
  const result = await db.execute(sql`
    select c.conname, c.contype, c.convalidated, pg_get_constraintdef(c.oid) as definition, i.indisvalid
    from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    left join pg_index i on i.indexrelid = c.conindid
    where n.nspname = 'public' and t.relname = 'appointments'
      and c.conname in ('appointments_employee_no_overlap', 'appointments_room_no_overlap')`);
  const rows = result.rows as {conname: string; contype: string; convalidated: boolean; definition: string; indisvalid: boolean}[];
  if (rows.length !== 2 || rows.some((row) => row.contype !== 'x' || !row.convalidated || !row.indisvalid || !row.definition.includes('tstzrange') || !row.definition.includes('cancelled'))) {
    throw new Error('Scheduling database guards are missing or invalid. Apply versioned migrations or run the DB push wrapper before starting the API.');
  }
}

/** Month counts use an aggregate query, never a truncated page of appointment records. */
export async function calendarCounts(actor: User, input: CalendarInput) {
  const clinicId = scheduleClinic(actor), ownOnly = !canReadAll(actor) || input.mine === 'true';
  if (!input.date || !input.through) throw badRequest('invalid_date_range');
  if (ownOnly && input.employeeId && input.employeeId !== actor.id) throw forbidden();
  const day = sql`(${appointmentsTable.startsAt} AT TIME ZONE ${branchesTable.timeZone})::date`;
  const condition = and(eq(appointmentsTable.clinicId, clinicId), ownOnly ? eq(appointmentsTable.employeeId, actor.id) : undefined,
    input.employeeId ? eq(appointmentsTable.employeeId, input.employeeId) : undefined,
    input.branchId ? eq(appointmentsTable.branchId, input.branchId) : undefined,
    input.serviceId ? eq(appointmentsTable.serviceId, input.serviceId) : undefined,
    input.customerId ? eq(appointmentsTable.customerId, input.customerId) : undefined,
    input.status ? eq(appointmentsTable.status, input.status) : undefined,
    sql`${day} between ${input.date}::date and ${input.through}::date`);
  const rows = await db.select({date: sql<string>`to_char(${day}, 'YYYY-MM-DD')`, count: sql<number>`count(*)::int`}).from(appointmentsTable)
    .innerJoin(branchesTable, and(eq(branchesTable.id, appointmentsTable.branchId), eq(branchesTable.clinicId, clinicId)))
    .where(condition).groupBy(day).orderBy(day);
  return {days: rows, ownOnly};
}
