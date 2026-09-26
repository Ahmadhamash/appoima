/** Scheduling decisions are pure; persistence and authorization enforcement remain server-side. */
export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];
export const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_service', 'cancelled'],
  in_service: ['completed'], completed: [], cancelled: [], no_show: [],
};
export type ScheduleActor = { id: number; clinicId: number | null; role: string; permissions: readonly string[] };
export type OwnedAppointment = { clinicId: number; employeeId: number; status: AppointmentStatus };
export function isProvider(actor: ScheduleActor): boolean { return actor.role === 'doctor' || actor.role === 'service_provider'; }
export function canReadAll(actor: ScheduleActor): boolean {
  return actor.clinicId !== null && actor.role !== 'platform_owner' && (actor.permissions.includes('appointments.read') || actor.permissions.includes('appointments.manage'));
}
export function canSchedule(actor: ScheduleActor): boolean {
  return actor.clinicId !== null && actor.role !== 'platform_owner' && actor.permissions.includes('appointments.manage');
}
export function canAccessScheduling(actor: ScheduleActor): boolean { return canReadAll(actor) || (actor.clinicId !== null && isProvider(actor)); }
export function canReadAppointment(actor: ScheduleActor, a: OwnedAppointment): boolean {
  return actor.clinicId === a.clinicId && (canReadAll(actor) || (isProvider(actor) && actor.id === a.employeeId));
}
export function canWriteNotes(actor: ScheduleActor, a: OwnedAppointment): boolean {
  return canReadAppointment(actor, a) && (canSchedule(actor) || (isProvider(actor) && a.employeeId === actor.id));
}
export function canReschedule(actor: ScheduleActor, a: OwnedAppointment): boolean {
  return canReadAppointment(actor, a) && canSchedule(actor) && (a.status === 'pending' || a.status === 'confirmed');
}
export function allowedTransitions(actor: ScheduleActor, a: OwnedAppointment): AppointmentStatus[] {
  if (!canReadAppointment(actor, a)) return [];
  return TRANSITIONS[a.status].filter((to) => canSchedule(actor) || (isProvider(actor) && a.employeeId === actor.id && (to === 'in_service' || to === 'completed')));
}
/** Every status except cancelled retains its historical reservation. Adjacent slots are legal. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function shiftDate(value: string, days: number): string {
  const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
/** Stable hashing input: object-key order cannot change the meaning of a retried command. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
