import { consumptionPayloadSchema } from './operations-validation';
import { z } from 'zod';
import { APPOINTMENT_STATUSES, validDate } from './scheduling-rules';
const id = z.number().int().positive();
const queryId = z.coerce.number().int().positive().optional();
const date = z.string().refine(validDate, 'invalid_date');
const instant = z.string().datetime({ offset: true });
const key = z.string().uuid();
const notes = z.string().max(5000);
const lang = z.enum(['en', 'ar']);
export const bookingSchema = z.object({ branchId: id, customerId: id, serviceId: id, employeeId: id, startsAt: instant, notes: notes.default(''), notesLang: lang.default('en'), intakeAnswers: z.record(z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()])).refine(v=>Object.keys(v).length<=12,'service_intake_invalid').default({}), idempotencyKey: key }).strict();
export const availabilitySchema = z.object({ branchId: z.coerce.number().int().positive(), serviceId: z.coerce.number().int().positive(), employeeId: z.coerce.number().int().positive(), date, excludeAppointmentId: queryId }).strict();
export const calendarSchema = z.object({
  branchId: queryId, employeeId: queryId, serviceId: queryId, customerId: queryId,
  date: date.optional(), through: date.optional(), status: z.enum(APPOINTMENT_STATUSES).optional(),
  mine: z.enum(['true', 'false']).optional(), page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict().refine((v) => !v.through || (v.date && v.through >= v.date && Date.parse(v.through) - Date.parse(v.date) <= 31 * 86400000), 'invalid_date_range');
export const catalogSchema = z.object({ branchId: queryId, serviceId: queryId }).strict();
export const transitionSchema = z.object({ status: z.enum(APPOINTMENT_STATUSES), expectedVersion: id, reason: z.string().trim().max(1000).default(''), notes: notes.optional(), notesLang: lang.optional(), consumption: consumptionPayloadSchema.optional(), idempotencyKey: key }).strict().refine((v) => !v.consumption || v.status === 'completed', 'consumption_requires_completed').refine((v) => !['cancelled','no_show'].includes(v.status) || v.reason.length > 0, 'reason_required').refine((v) => v.notes === undefined || v.notesLang !== undefined, 'notes_language_required');
export const rescheduleSchema = z.object({ employeeId: id, startsAt: instant, expectedVersion: id, reason: z.string().trim().min(1).max(1000), idempotencyKey: key }).strict();
export const appointmentNotesSchema = z.object({ notes, notesLang: lang, expectedVersion: id, idempotencyKey: key }).strict();
export const bookingCustomerSchema = z.object({ name: z.string().trim().min(1).max(120), nameLang: lang, branchId: id.nullable().default(null), phone: z.string().trim().max(50).nullable().default(null), email: z.union([z.string().trim().email().max(200), z.literal(''), z.null()]).default(null), idempotencyKey: key }).strict().refine((v) => Boolean(v.phone || v.email), 'contact_required');
export type BookingInput = z.infer<typeof bookingSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type CalendarInput = z.infer<typeof calendarSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type AppointmentNotesInput = z.infer<typeof appointmentNotesSchema>;
export type BookingCustomerInput = z.infer<typeof bookingCustomerSchema>;
