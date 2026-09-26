import { pgTable, serial, text, timestamp, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

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

export type OpeningHours = Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  { open: string; close: string } | null
>;

export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .notNull()
    .references(() => clinicsTable.id),
  name: text("name").notNull(),
  nameLang: languageEnum("name_lang").notNull().default("en"),
  timeZone: text("time_zone").notNull().default("Asia/Amman"),
  openingHours: jsonb("opening_hours").$type<OpeningHours>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Branch = typeof branchesTable.$inferSelect;
