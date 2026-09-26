import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  integer,
  boolean,
  jsonb,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { clinicsTable, branchesTable, languageEnum, EMPTY_WEEK, type WeeklyHours, type StaffTimeOff } from "./clinics";

export const USER_ROLES = [
  "platform_owner",
  "manager",
  "secretary",
  "doctor",
  "service_provider",
  "other_staff",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    // null for the JorMall platform owner; every clinic user belongs to exactly one clinic.
    clinicId: integer("clinic_id").references(() => clinicsTable.id),
    branchId: integer("branch_id").references(() => branchesTable.id),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    nameLang: languageEnum("name_lang").notNull().default("en"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    role: userRoleEnum("role").notNull(),
    // Explicit permission keys, e.g. "appointments.manage". Presets come from the role.
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    workingHours: jsonb("working_hours").$type<WeeklyHours>().notNull().default(EMPTY_WEEK),
    breaks: jsonb("breaks").$type<WeeklyHours>().notNull().default(EMPTY_WEEK),
    timeOff: jsonb("time_off").$type<StaffTimeOff[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("users_clinic_idx").on(t.clinicId),
    unique("users_clinic_id_unique").on(t.clinicId, t.id),
    foreignKey({ name: "users_branch_clinic_fk", columns: [t.clinicId, t.branchId], foreignColumns: [branchesTable.clinicId, branchesTable.id] }),
  ],
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
