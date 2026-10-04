import { sql } from 'drizzle-orm';
import { pgTable, serial, integer, text, numeric, jsonb, date, timestamp, boolean, unique, foreignKey, index, check } from 'drizzle-orm/pg-core';
import { clinicsTable } from './clinics';
import { usersTable } from './users';
import { customersTable } from './setup';
import { appointmentsTable } from './scheduling';
import { patientPackagesTable } from './packages';

export type OfferEligibility = { customerType: 'all' | 'new' | 'existing'; minimumSpend: string; maxPerPatient: number | null; conditions: string };
export type PromotionSnapshot = { id: number; name: string; kind: 'percent' | 'amount' | 'price'; value: string; originalPrice: string; price: string; startsOn: string; endsOn: string; eligibility: OfferEligibility };
export const promotionalOffersTable = pgTable('promotional_offers', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull().references(() => clinicsTable.id),
  name: text('name').notNull(), serviceIds: jsonb('service_ids').$type<number[]>().notNull().default([]),
  packageIds: jsonb('package_ids').$type<number[]>().notNull().default([]),
  kind: text('kind').$type<'percent' | 'amount' | 'price'>().notNull(), value: numeric('value', { precision: 12, scale: 3 }).notNull(),
  startsOn: date('starts_on').notNull(), endsOn: date('ends_on').notNull(),
  eligibility: jsonb('eligibility').$type<OfferEligibility>().notNull(), isActive: boolean('is_active').notNull().default(true),
  createdBy: integer('created_by').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('promotional_offers_clinic_id_unique').on(t.clinicId, t.id),
  foreignKey({ columns: [t.clinicId, t.createdBy], foreignColumns: [usersTable.clinicId, usersTable.id] }),
  check('promotional_offers_period_check', sql`${t.endsOn} >= ${t.startsOn}`),
  check('promotional_offers_value_check', sql`${t.kind} IN ('percent','amount','price') AND ${t.value} >= 0 AND ${t.value} <> 'NaN'::numeric AND (${t.kind} <> 'percent' OR ${t.value} <= 100)`),
]);
export const packageNotificationsTable = pgTable('package_notifications', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), packageId: integer('package_id').notNull(),
  customerId: integer('customer_id').notNull(), appointmentId: integer('appointment_id').notNull(),
  event: text('event').$type<'final_check_in' | 'final_completed'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('package_notifications_clinic_id_unique').on(t.clinicId, t.id),
  unique('package_notifications_event_unique').on(t.clinicId, t.appointmentId, t.event),
  index('package_notifications_clinic_idx').on(t.clinicId, t.id),
  foreignKey({ columns: [t.clinicId, t.customerId, t.packageId], foreignColumns: [patientPackagesTable.clinicId, patientPackagesTable.customerId, patientPackagesTable.id] }),
  foreignKey({ columns: [t.clinicId, t.appointmentId], foreignColumns: [appointmentsTable.clinicId, appointmentsTable.id] }),
  foreignKey({ columns: [t.clinicId, t.customerId], foreignColumns: [customersTable.clinicId, customersTable.id] }),
  check('package_notifications_event_check', sql`${t.event} IN ('final_check_in','final_completed')`),
]);
export const packageNotificationReadsTable = pgTable('package_notification_reads', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), notificationId: integer('notification_id').notNull(), userId: integer('user_id').notNull(),
}, t => [unique('package_notification_reads_user_unique').on(t.clinicId, t.notificationId, t.userId),
  foreignKey({ columns: [t.clinicId, t.notificationId], foreignColumns: [packageNotificationsTable.clinicId, packageNotificationsTable.id] }),
  foreignKey({ columns: [t.clinicId, t.userId], foreignColumns: [usersTable.clinicId, usersTable.id] }),
]);
