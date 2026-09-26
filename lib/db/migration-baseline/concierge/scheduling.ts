import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, serial, integer, text, timestamp, boolean, jsonb, index, unique, foreignKey, check } from 'drizzle-orm/pg-core';
import { clinicsTable, branchesTable, languageEnum } from './clinics';
import { usersTable } from './users';
import { customersTable, servicesTable, roomsTable } from './setup';
export const appointmentStatusEnum = pgEnum('appointment_status', ['pending','confirmed','checked_in','in_service','completed','cancelled','no_show']);
export const appointmentEventEnum = pgEnum('appointment_event', ['created','status_changed','rescheduled','notes_updated']);
export const appointmentsTable = pgTable('appointments', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull().references(() => clinicsTable.id),
  branchId: integer('branch_id').notNull(), customerId: integer('customer_id').notNull(),
  serviceId: integer('service_id').notNull(), employeeId: integer('employee_id').notNull(), roomId: integer('room_id'),
  startsAt: timestamp('starts_at', {withTimezone:true}).notNull(), endsAt: timestamp('ends_at', {withTimezone:true}).notNull(),
  // Snapshot operational requirements so later catalog edits cannot rewrite existing bookings.
  durationMinutes: integer('duration_minutes').notNull(), requiresRoom: boolean('requires_room').notNull(),
  status: appointmentStatusEnum('status').notNull().default('pending'), notes: text('notes').notNull().default(''),
  notesLang: languageEnum('notes_lang').notNull().default('en'), createdBy: integer('created_by').notNull(),
  version: integer('version').notNull().default(1), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
}, (t) => [
  unique('appointments_clinic_id_unique').on(t.clinicId, t.id),
  index('appointments_clinic_start_idx').on(t.clinicId, t.startsAt),
  index('appointments_customer_start_idx').on(t.clinicId, t.customerId, t.startsAt),
  index('appointments_employee_start_idx').on(t.clinicId, t.employeeId, t.startsAt),
  foreignKey({name:'appointments_branch_clinic_fk',columns:[t.clinicId,t.branchId],foreignColumns:[branchesTable.clinicId,branchesTable.id]}),
  foreignKey({name:'appointments_customer_clinic_fk',columns:[t.clinicId,t.customerId],foreignColumns:[customersTable.clinicId,customersTable.id]}),
  foreignKey({name:'appointments_service_clinic_fk',columns:[t.clinicId,t.serviceId],foreignColumns:[servicesTable.clinicId,servicesTable.id]}),
  foreignKey({name:'appointments_employee_clinic_fk',columns:[t.clinicId,t.employeeId],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  foreignKey({name:'appointments_creator_clinic_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  foreignKey({name:'appointments_room_branch_fk',columns:[t.clinicId,t.branchId,t.roomId],foreignColumns:[roomsTable.clinicId,roomsTable.branchId,roomsTable.id]}),
  check('appointments_time_check',sql`${t.endsAt} > ${t.startsAt} AND ${t.endsAt} = ${t.startsAt} + ${t.durationMinutes} * interval '1 minute'`),
  check('appointments_duration_check',sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 1440`),
  check('appointments_room_required_check',sql`NOT ${t.requiresRoom} OR ${t.roomId} IS NOT NULL`),
  check('appointments_version_check',sql`${t.version} > 0`),
  // PostgreSQL EXCLUDE constraints are installed by versioned SQL and the dev push wrapper.
]);
export type AppointmentSnapshot = { startsAt: string; endsAt: string; employeeId: number; roomId: number | null };
export const appointmentStatusHistoryTable = pgTable('appointment_status_history', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), appointmentId: integer('appointment_id').notNull(),
  event: appointmentEventEnum('event').notNull(), fromStatus: appointmentStatusEnum('from_status'), toStatus: appointmentStatusEnum('to_status').notNull(),
  actorId: integer('actor_id').notNull(), at: timestamp('at',{withTimezone:true}).notNull().defaultNow(),
  reason: text('reason').notNull().default(''), before: jsonb('before').$type<AppointmentSnapshot | null>(),
  after: jsonb('after').$type<AppointmentSnapshot>().notNull(),
}, (t) => [
  index('appointment_history_appointment_idx').on(t.clinicId,t.appointmentId,t.id),
  foreignKey({name:'appointment_history_appointment_clinic_fk',columns:[t.clinicId,t.appointmentId],foreignColumns:[appointmentsTable.clinicId,appointmentsTable.id]}).onDelete('cascade'),
  foreignKey({name:'appointment_history_actor_clinic_fk',columns:[t.clinicId,t.actorId],foreignColumns:[usersTable.clinicId,usersTable.id]}),
]);
export const schedulingCommandsTable = pgTable('scheduling_commands', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), actorId: integer('actor_id').notNull(),
  key: text('key').notNull(), requestHash: text('request_hash').notNull(), operation: text('operation').notNull(),
  resultId: integer('result_id').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, (t) => [
  unique('scheduling_commands_actor_key_unique').on(t.clinicId,t.actorId,t.key),
  foreignKey({name:'scheduling_commands_actor_clinic_fk',columns:[t.clinicId,t.actorId],foreignColumns:[usersTable.clinicId,usersTable.id]}).onDelete('cascade'),
]);
export type Appointment = typeof appointmentsTable.$inferSelect;
