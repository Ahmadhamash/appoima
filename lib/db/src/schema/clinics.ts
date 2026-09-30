import { pgTable, serial, text, timestamp, pgEnum, integer, jsonb, unique } from "drizzle-orm/pg-core";

export const languageEnum = pgEnum("language", ["en", "ar"]);
export const clinicStatusEnum = pgEnum("clinic_status", ["active", "inactive"]);

export const clinicsTable = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameLang: languageEnum("name_lang").notNull().default("en"),
  status: clinicStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Clinic = typeof clinicsTable.$inferSelect;

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type TimeRange = { open: string; close: string };
/** Empty day = closed. Multiple non-overlapping ranges support split shifts. */
export type WeeklyHours = Record<WeekDay, TimeRange[]>;
/** Also accepts the Phase 1 JSON representation during a rolling upgrade. */
export type OpeningHours = Record<WeekDay, TimeRange[] | TimeRange | null>;
export const EMPTY_WEEK: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
export type StaffTimeOff = { startsAt: string; endsAt: string; note: string };

export const branchesTable = pgTable("branches", {
  address: text("address"),
  mapUrl: text("map_url"),
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .notNull()
    .references(() => clinicsTable.id),
  name: text("name").notNull(),
  nameLang: languageEnum("name_lang").notNull().default("en"),
  timeZone: text("time_zone").notNull().default("Asia/Amman"),
  openingHours: jsonb("opening_hours").$type<OpeningHours>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("branches_clinic_id_unique").on(t.clinicId, t.id)]);

export type Branch = typeof branchesTable.$inferSelect;
