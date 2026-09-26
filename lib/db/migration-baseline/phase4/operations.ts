import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, serial, integer, text, timestamp, numeric, index, unique, uniqueIndex, foreignKey, check } from 'drizzle-orm/pg-core';
import { branchesTable, languageEnum } from './clinics';
import { usersTable } from './users';
import { customersTable, servicesTable, roomsTable } from './setup';
import { appointmentsTable } from './scheduling';
export const waitingStatusEnum = pgEnum('waiting_status', ['waiting','offered','booked','declined','expired']);
export const waitingOfferStatusEnum = pgEnum('waiting_offer_status', ['offered','booked','declined','unavailable','expired']);
export const inventoryMovementKindEnum = pgEnum('inventory_movement_kind', ['receipt','adjustment','consumption']);
export const inventoryUnitEnum = pgEnum('inventory_unit', ['piece','pair','box','ml','l','g','kg']);
export const waitingEntriesTable = pgTable('waiting_list_entries', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), branchId: integer('branch_id').notNull(),
  customerId: integer('customer_id').notNull(), serviceId: integer('service_id').notNull(), preferredEmployeeId: integer('preferred_employee_id'),
  windowStart: timestamp('window_start',{withTimezone:true}).notNull(), windowEnd: timestamp('window_end',{withTimezone:true}).notNull(),
  note: text('note').notNull().default(''), noteLang: languageEnum('note_lang').notNull().default('en'),
  status: waitingStatusEnum('status').notNull().default('waiting'), version: integer('version').notNull().default(1),
  createdBy: integer('created_by').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
}, t => [
  unique('waiting_entries_clinic_id_unique').on(t.clinicId,t.id),
  index('waiting_entries_queue_idx').on(t.clinicId,t.branchId,t.serviceId,t.status,t.createdAt,t.id),
  foreignKey({name:'waiting_entries_branch_fk',columns:[t.clinicId,t.branchId],foreignColumns:[branchesTable.clinicId,branchesTable.id]}),
  foreignKey({name:'waiting_entries_customer_fk',columns:[t.clinicId,t.customerId],foreignColumns:[customersTable.clinicId,customersTable.id]}),
  foreignKey({name:'waiting_entries_service_fk',columns:[t.clinicId,t.serviceId],foreignColumns:[servicesTable.clinicId,servicesTable.id]}),
  foreignKey({name:'waiting_entries_employee_fk',columns:[t.clinicId,t.preferredEmployeeId],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  foreignKey({name:'waiting_entries_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  check('waiting_entries_window_check',sql`${t.windowEnd} > ${t.windowStart}`),
  check('waiting_entries_version_check',sql`${t.version} > 0`),
]);
export const waitingOffersTable = pgTable('waiting_list_offers', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), entryId: integer('entry_id').notNull(),
  cancelledAppointmentId: integer('cancelled_appointment_id').notNull(), cancellationVersion: integer('cancellation_version').notNull(),
  entryVersion: integer('entry_version').notNull(), status: waitingOfferStatusEnum('status').notNull().default('offered'),
  startsAt: timestamp('starts_at',{withTimezone:true}).notNull(), endsAt: timestamp('ends_at',{withTimezone:true}).notNull(),
  employeeId: integer('employee_id').notNull(), replacementAppointmentId: integer('replacement_appointment_id'),
  createdBy: integer('created_by').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  decidedAt: timestamp('decided_at',{withTimezone:true}),
}, t => [
  unique('waiting_offers_clinic_id_unique').on(t.clinicId,t.id),
  uniqueIndex('waiting_offers_one_active_entry').on(t.clinicId,t.entryId).where(sql`${t.status} = 'offered'`),
  uniqueIndex('waiting_offers_one_replacement').on(t.clinicId,t.cancelledAppointmentId).where(sql`${t.status} in ('offered','booked')`),
  index('waiting_offers_history_idx').on(t.clinicId,t.cancelledAppointmentId,t.id),
  foreignKey({name:'waiting_offers_entry_fk',columns:[t.clinicId,t.entryId],foreignColumns:[waitingEntriesTable.clinicId,waitingEntriesTable.id]}),
  foreignKey({name:'waiting_offers_cancelled_fk',columns:[t.clinicId,t.cancelledAppointmentId],foreignColumns:[appointmentsTable.clinicId,appointmentsTable.id]}),
  foreignKey({name:'waiting_offers_replacement_fk',columns:[t.clinicId,t.replacementAppointmentId],foreignColumns:[appointmentsTable.clinicId,appointmentsTable.id]}),
  foreignKey({name:'waiting_offers_employee_fk',columns:[t.clinicId,t.employeeId],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  foreignKey({name:'waiting_offers_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  check('waiting_offers_time_check',sql`${t.endsAt} > ${t.startsAt}`),
  check('waiting_offers_booked_check',sql`(${t.status} = 'booked') = (${t.replacementAppointmentId} is not null)`),
]);
export const inventoryItemsTable = pgTable('inventory_items', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), branchId: integer('branch_id').notNull(),
  name: text('name').notNull(), nameLang: languageEnum('name_lang').notNull().default('en'), unit: inventoryUnitEnum('unit').notNull(),
  createdBy: integer('created_by').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t => [
  unique('inventory_items_clinic_id_unique').on(t.clinicId,t.id),
  unique('inventory_items_branch_unit_unique').on(t.clinicId,t.branchId,t.id,t.unit),
  index('inventory_items_branch_idx').on(t.clinicId,t.branchId,t.name),
  foreignKey({name:'inventory_items_branch_fk',columns:[t.clinicId,t.branchId],foreignColumns:[branchesTable.clinicId,branchesTable.id]}),
  foreignKey({name:'inventory_items_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
]);
export const inventoryConsumptionsTable = pgTable('inventory_consumptions', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), branchId: integer('branch_id').notNull(),
  appointmentId: integer('appointment_id').notNull(), serviceId: integer('service_id').notNull(), actorId: integer('actor_id').notNull(),
  payloadHash: text('payload_hash').notNull(), lineCount: integer('line_count').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, t => [
  unique('inventory_consumptions_appointment_unique').on(t.clinicId,t.appointmentId),
  unique('inventory_consumptions_context_unique').on(t.clinicId,t.branchId,t.id,t.appointmentId,t.serviceId),
  foreignKey({name:'inventory_consumptions_branch_fk',columns:[t.clinicId,t.branchId],foreignColumns:[branchesTable.clinicId,branchesTable.id]}),
  foreignKey({name:'inventory_consumptions_appointment_fk',columns:[t.clinicId,t.appointmentId],foreignColumns:[appointmentsTable.clinicId,appointmentsTable.id]}),
  foreignKey({name:'inventory_consumptions_service_fk',columns:[t.clinicId,t.serviceId],foreignColumns:[servicesTable.clinicId,servicesTable.id]}),
  foreignKey({name:'inventory_consumptions_actor_fk',columns:[t.clinicId,t.actorId],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  check('inventory_consumptions_lines_check',sql`${t.lineCount} between 0 and 100`),
]);
export const inventoryMovementsTable = pgTable('inventory_movements', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), branchId: integer('branch_id').notNull(), itemId: integer('item_id').notNull(),
  unit: inventoryUnitEnum('unit').notNull(), kind: inventoryMovementKindEnum('kind').notNull(), quantity: numeric('quantity',{precision:16,scale:3}).notNull(),
  actorId: integer('actor_id').notNull(), reason: text('reason').notNull().default(''), reasonLang: languageEnum('reason_lang').notNull().default('en'),
  consumptionId: integer('consumption_id'), appointmentId: integer('appointment_id'), serviceId: integer('service_id'),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, t => [
  index('inventory_movements_item_idx').on(t.clinicId,t.itemId,t.id),
  index('inventory_movements_service_idx').on(t.clinicId,t.serviceId,t.itemId),
  unique('inventory_movements_consumption_item_unique').on(t.consumptionId,t.itemId),
  foreignKey({name:'inventory_movements_item_unit_fk',columns:[t.clinicId,t.branchId,t.itemId,t.unit],foreignColumns:[inventoryItemsTable.clinicId,inventoryItemsTable.branchId,inventoryItemsTable.id,inventoryItemsTable.unit]}),
  foreignKey({name:'inventory_movements_actor_fk',columns:[t.clinicId,t.actorId],foreignColumns:[usersTable.clinicId,usersTable.id]}),
  foreignKey({name:'inventory_movements_consumption_fk',columns:[t.clinicId,t.branchId,t.consumptionId,t.appointmentId,t.serviceId],foreignColumns:[inventoryConsumptionsTable.clinicId,inventoryConsumptionsTable.branchId,inventoryConsumptionsTable.id,inventoryConsumptionsTable.appointmentId,inventoryConsumptionsTable.serviceId]}),
  check('inventory_movements_kind_check',sql`(${t.kind} = 'receipt' AND ${t.quantity} > 0 OR ${t.kind} = 'adjustment' AND ${t.quantity} <> 0 OR ${t.kind} = 'consumption' AND ${t.quantity} < 0) AND ${t.quantity} <> 'NaN'::numeric`),
  check('inventory_movements_context_check',sql`(${t.kind} = 'consumption' AND ${t.consumptionId} is not null AND ${t.appointmentId} is not null AND ${t.serviceId} is not null) OR (${t.kind} <> 'consumption' AND ${t.consumptionId} is null AND ${t.appointmentId} is null AND ${t.serviceId} is null)`),
  check('inventory_movements_reason_check',sql`${t.kind} <> 'adjustment' OR length(trim(${t.reason})) > 0`),
]);
export type WaitingEntry = typeof waitingEntriesTable.$inferSelect;
export type WaitingOffer = typeof waitingOffersTable.$inferSelect;
