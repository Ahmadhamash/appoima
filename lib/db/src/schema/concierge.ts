import { pgTable, serial, integer, text, jsonb, timestamp, unique, foreignKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinicsTable } from './clinics';
import { usersTable } from './users';
/** Manager-only durable draft. Contains no audio, file bytes, API keys, or initial passwords. */
export const managerOnboardingTable = pgTable('manager_onboarding', {
  id: serial('id').primaryKey(),
  clinicId: integer('clinic_id').notNull().references(() => clinicsTable.id),
  userId: integer('user_id').notNull(),
  stage: text('stage').notNull().default('name'),
  preferredName: text('preferred_name'),
  language: text('language').notNull().default('ar'),
  consentVersion: text('consent_version'),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  revision: integer('revision').notNull().default(0),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
  budget: jsonb('budget').$type<Record<string, unknown>>().notNull().default({}),
  busyId: text('busy_id'),
  busyUntil: timestamp('busy_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('manager_onboarding_clinic_user_unique').on(t.clinicId, t.userId),
  foreignKey({ name: 'manager_onboarding_user_clinic_fk', columns: [t.clinicId, t.userId], foreignColumns: [usersTable.clinicId, usersTable.id] }).onDelete('cascade'),
  index('manager_onboarding_updated_idx').on(t.updatedAt),
  check('manager_onboarding_stage_check', sql`${t.stage} in ('name','choice','conversation','complete','manual')`),
  check('manager_onboarding_language_check', sql`${t.language} in ('ar','en')`),
  check('manager_onboarding_revision_check', sql`${t.revision} >= 0`),
]);
export type ManagerOnboarding = typeof managerOnboardingTable.$inferSelect;
