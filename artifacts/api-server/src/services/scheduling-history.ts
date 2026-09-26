import { appointmentStatusHistoryTable, type Appointment, type User } from '@workspace/db';
import { recordAudit } from './audit';
import type { OperationsTx as Tx } from './operations-context';
const snapshot=(a:Appointment)=>({startsAt:a.startsAt.toISOString(),endsAt:a.endsAt.toISOString(),employeeId:a.employeeId,roomId:a.roomId});
export async function recordAppointmentHistory(tx: Tx, actor: User, event: 'created'|'status_changed'|'rescheduled'|'notes_updated', before: Appointment | null, after: Appointment, reason = '') {
  await tx.insert(appointmentStatusHistoryTable).values({clinicId: after.clinicId, appointmentId: after.id, event, fromStatus: before?.status ?? null, toStatus: after.status, actorId: actor.id, reason, before: before ? snapshot(before) : null, after: snapshot(after)});
  await recordAudit({clinicId: after.clinicId, actorUserId: actor.id, action: `appointment.${event}`, entityType: 'appointment', entityId: after.id,
    details: {from: before?.status ?? null, to: after.status, version: after.version, before: before ? snapshot(before) : null, after: snapshot(after), reasonRecorded: Boolean(reason)}}, tx);
}
