import { and, eq, ne, lt, gte, inArray, or, sql } from 'drizzle-orm';
import { branchesTable, servicesTable, usersTable, roomsTable, roomServicesTable, serviceEmployeesTable, appointmentsTable, type User, type Appointment } from '@workspace/db';
import { computeSlots, branchDate } from '../domain/scheduling-time';
import type { AvailabilityInput } from '../domain/scheduling-validation';
import { badRequest, conflict, notFound } from '../lib/errors';
import { operatingClinic, type OperationsTx as Tx } from './operations-context';
type Executor=Pick<Tx,'select'|'insert'|'update'|'execute'>;
export async function slotContext(tx: Executor, actor: User, input: AvailabilityInput, existing?: Appointment) {
  const clinicId = operatingClinic(actor);
  const [branch] = await tx.select().from(branchesTable).where(and(eq(branchesTable.id, input.branchId), eq(branchesTable.clinicId, clinicId)));
  const [service] = await tx.select().from(servicesTable).where(and(eq(servicesTable.id, input.serviceId), eq(servicesTable.clinicId, clinicId)));
  const [employee] = await tx.select().from(usersTable).where(and(eq(usersTable.id, input.employeeId), eq(usersTable.clinicId, clinicId)));
  if (!branch || !service || !employee) throw notFound('record_not_found');
  if (!service.isActive || !employee.isActive || employee.role === 'platform_owner') throw badRequest('booking_unavailable');
  if ((service.branchId !== null && service.branchId !== branch.id) || (employee.branchId !== null && employee.branchId !== branch.id)) throw badRequest('branch_mismatch');
  const [assigned] = await tx.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.serviceId, service.id), eq(serviceEmployeesTable.employeeId, employee.id)));
  if (!assigned) throw badRequest('employee_not_eligible');
  const compatible = await tx.select({id: roomsTable.id}).from(roomsTable)
    .innerJoin(roomServicesTable, and(eq(roomServicesTable.roomId, roomsTable.id), eq(roomServicesTable.clinicId, clinicId)))
    .where(and(eq(roomsTable.clinicId, clinicId), eq(roomsTable.branchId, branch.id), eq(roomsTable.status, 'available'), eq(roomServicesTable.serviceId, service.id)));
  // Broad UTC envelope handles every supported UTC offset; room conflicts and employee conflicts
  // across OTHER branches are both included. Only this explicitly authorized reschedule is excluded.
  const base = Date.parse(`${input.date}T00:00:00Z`);
  const busy = await tx.select({startsAt: appointmentsTable.startsAt, endsAt: appointmentsTable.endsAt, employeeId: appointmentsTable.employeeId, roomId: appointmentsTable.roomId}).from(appointmentsTable)
    .where(and(eq(appointmentsTable.clinicId, clinicId), ne(appointmentsTable.status, 'cancelled'), existing ? ne(appointmentsTable.id, existing.id) : undefined,
      lt(appointmentsTable.startsAt, new Date(base + 48 * 3600000)), gte(appointmentsTable.endsAt, new Date(base - 24 * 3600000)),
      or(eq(appointmentsTable.employeeId, employee.id), compatible.length ? inArray(appointmentsTable.roomId, compatible.map((v) => v.id)) : undefined)));
  const durationMinutes = existing?.durationMinutes ?? service.durationMinutes;
  const requiresRoom = existing?.requiresRoom ?? service.requiresRoom;
  const slots = computeSlots({date: input.date, timeZone: branch.timeZone, branchHours: branch.openingHours,
    workingHours: employee.workingHours, breaks: employee.breaks, timeOff: employee.timeOff, durationMinutes,
    employeeId: employee.id, requiresRoom, roomIds: compatible.map((v) => v.id), busy, now: Date.now()});
  return {branch, service, employee, durationMinutes, requiresRoom, slots};
}
export async function selectedSlot(tx: Tx, actor: User, input: {branchId: number; serviceId: number; employeeId: number; startsAt: string}, existing?: Appointment) {
  const [branch] = await tx.select().from(branchesTable).where(and(eq(branchesTable.id, input.branchId), eq(branchesTable.clinicId, operatingClinic(actor))));
  if (!branch) throw notFound('record_not_found');
  const context = await slotContext(tx, actor, {...input, date: branchDate(input.startsAt, branch.timeZone)}, existing);
  const selected = context.slots.find((slot) => Date.parse(slot.startsAt) === Date.parse(input.startsAt));
  if (!selected) throw conflict('slot_taken');
  return {...context, selected};
}
