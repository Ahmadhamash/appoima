import { activeRoom, activeBranch, activeEmployee } from './branch-scope';
import { and, eq, ne, lt, gte, inArray, or, sql } from 'drizzle-orm';
import { branchesTable, servicesTable, usersTable, roomsTable, roomBlocksTable, roomServicesTable, serviceEmployeesTable, appointmentsTable, type User, type Appointment } from '@workspace/db';
import { computeSlots, branchDate } from '../domain/scheduling-time';
import { roomHasEquipment } from '../domain/equipment';
import { normalizeWeek, type Day } from '../domain/setup-rules';
import type { AvailabilityInput } from '../domain/scheduling-validation';
import { badRequest, conflict, notFound } from '../lib/errors';
import { operatingClinic, type OperationsTx as Tx } from './operations-context';
import { staffWorksAt, staffScheduleAt } from '../domain/staff-branches';
type Executor=Pick<Tx,'select'|'insert'|'update'|'execute'>;
export async function slotContext(tx: Executor, actor: User, input: AvailabilityInput, existing?: Appointment) {
  const clinicId = operatingClinic(actor);
  const [branch] = await tx.select().from(branchesTable).where(and(eq(branchesTable.id, input.branchId), and(eq(branchesTable.clinicId, clinicId), activeBranch(branchesTable.id))));
  const [service] = await tx.select().from(servicesTable).where(and(eq(servicesTable.id, input.serviceId), and(eq(servicesTable.clinicId, clinicId), activeBranch(servicesTable.branchId))));
  const [employee] = await tx.select().from(usersTable).where(and(eq(usersTable.id, input.employeeId), and(eq(usersTable.clinicId, clinicId), activeEmployee())));
  if (!branch || !service || !employee) throw notFound('record_not_found');
  if (!service.isActive || !employee.isActive || !['doctor', 'service_provider'].includes(employee.role)) throw badRequest('booking_unavailable');
  if ((service.branchId !== null && service.branchId !== branch.id) || !staffWorksAt(employee,branch.id)) throw badRequest('branch_mismatch');
  const schedule=staffScheduleAt(employee,branch.id);
  const [assigned] = await tx.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.serviceId, service.id), eq(serviceEmployeesTable.employeeId, employee.id)));
  if (!assigned) throw badRequest('employee_not_eligible');
  const linkedRooms = await tx.select({id: roomsTable.id,extra:roomsTable.extra}).from(roomsTable)
    .innerJoin(roomServicesTable, and(eq(roomServicesTable.roomId, roomsTable.id), eq(roomServicesTable.clinicId, clinicId)))
    .where(and(and(eq(roomsTable.clinicId, clinicId), activeRoom()), eq(roomsTable.branchId, branch.id), eq(roomsTable.status, 'available'), eq(roomServicesTable.serviceId, service.id)));
  const compatible = linkedRooms.filter(room => roomHasEquipment(service.requiredEquipment, room.extra['equipment']));
  // Broad UTC envelope handles every supported UTC offset; room conflicts and employee conflicts
  // across OTHER branches are both included. Only this explicitly authorized reschedule is excluded.
  const base = Date.parse(`${input.date}T00:00:00Z`);
  const busy = await tx.select({startsAt: appointmentsTable.startsAt, endsAt: appointmentsTable.endsAt, employeeId: appointmentsTable.employeeId, roomId: appointmentsTable.roomId}).from(appointmentsTable)
    .where(and(eq(appointmentsTable.clinicId, clinicId), ne(appointmentsTable.status, 'cancelled'), existing ? ne(appointmentsTable.id, existing.id) : undefined,
      lt(appointmentsTable.startsAt, new Date(base + 48 * 3600000)), gte(appointmentsTable.endsAt, new Date(base - 24 * 3600000)),
      or(eq(appointmentsTable.employeeId, employee.id), compatible.length ? inArray(appointmentsTable.roomId, compatible.map((v) => v.id)) : undefined)));
  const blocks=compatible.length?await tx.select({startsAt:roomBlocksTable.startsAt,endsAt:roomBlocksTable.endsAt,roomId:roomBlocksTable.roomId}).from(roomBlocksTable)
    .where(and(and(eq(roomBlocksTable.clinicId,clinicId), activeBranch(roomBlocksTable.branchId)),inArray(roomBlocksTable.roomId,compatible.map(room=>room.id)),lt(roomBlocksTable.startsAt,new Date(base+48*3600000)),gte(roomBlocksTable.endsAt,new Date(base-24*3600000)))):[];
  const durationMinutes = existing?.durationMinutes ?? service.durationMinutes;
  const requiresRoom = service.requiresRoom || service.requiredEquipment.length > 0;
  const day = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as Day[])[new Date(`${input.date}T12:00:00Z`).getUTCDay()]!;
  const availabilityReason = !normalizeWeek(branch.openingHours)[day].length ? 'branch_closed'
    : !normalizeWeek(schedule.workingHours)[day].length ? 'provider_off'
    : requiresRoom && !compatible.length ? 'room_unavailable' : 'no_free_time';
  const slots = computeSlots({date: input.date, timeZone: branch.timeZone, branchHours: branch.openingHours,
    workingHours: schedule.workingHours, breaks: schedule.breaks, timeOff: employee.timeOff, durationMinutes,
    employeeId: employee.id, requiresRoom, roomIds: compatible.map((v) => v.id), busy:[...busy,...blocks.map(block=>({...block,employeeId:0}))],
    now: Date.now()});
  return {branch, service, employee, durationMinutes, requiresRoom, availabilityReason, slots};
}
export async function selectedSlot(tx: Tx, actor: User, input: {branchId: number; serviceId: number; employeeId: number; startsAt: string}, existing?: Appointment) {
  const [branch] = await tx.select().from(branchesTable).where(and(eq(branchesTable.id, input.branchId), and(eq(branchesTable.clinicId, operatingClinic(actor)), activeBranch(branchesTable.id))));
  if (!branch) throw notFound('record_not_found');
  const context = await slotContext(tx, actor, {...input, date: branchDate(input.startsAt, branch.timeZone)}, existing);
  const selected = context.slots.find((slot) => Date.parse(slot.startsAt) === Date.parse(input.startsAt));
  if (!selected) throw conflict('slot_taken');
  return {...context, selected};
}
