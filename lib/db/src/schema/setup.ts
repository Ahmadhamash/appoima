import type { ServiceDefinition } from "@workspace/service-definition";
import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, boolean, jsonb, timestamp, numeric, pgEnum, index, unique, foreignKey, primaryKey, check } from "drizzle-orm/pg-core";
import { clinicsTable, branchesTable, languageEnum } from "./clinics";
import { usersTable } from "./users";

export const SERVICE_CATEGORIES = ["Hair", "Nails", "Skin", "Laser", "Massage", "Makeup", "Other"] as const;
export const serviceCategoryEnum = pgEnum("service_category", SERVICE_CATEGORIES);
export const roomStatusEnum = pgEnum("room_status", ["available", "maintenance"]);

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id),
  // null = offered clinic-wide; otherwise the service is restricted to one branch.
  branchId: integer("branch_id"),
  name: text("name").notNull(),
  nameLang: languageEnum("name_lang").notNull().default("en"),
  durationMinutes: integer("duration_minutes").notNull(),
  price: numeric("price", { precision: 12, scale: 3 }).notNull(),
  currency: text("currency").notNull().default("JOD"),
  category: text("category").notNull(),
  definition: jsonb("definition").$type<ServiceDefinition | null>(),
  requiredEquipment: jsonb("required_equipment").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  requiresRoom: boolean("requires_room").notNull().default(false),
  followUpEnabled: boolean("follow_up_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("services_clinic_idx").on(t.clinicId),
  unique("services_clinic_id_unique").on(t.clinicId, t.id),
  foreignKey({ name: "services_branch_clinic_fk", columns: [t.clinicId, t.branchId], foreignColumns: [branchesTable.clinicId, branchesTable.id] }),
  check("services_duration_check", sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 1440`),
  check("services_price_check", sql`${t.price} >= 0`),
  check("services_category_label_check", sql`char_length(btrim(${t.category})) between 1 and 80`),
]);

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id),
  branchId: integer("branch_id").notNull(),
  name: text("name").notNull(),
  nameLang: languageEnum("name_lang").notNull().default("en"),
  capacity: integer("capacity").notNull().default(1),
  status: roomStatusEnum("status").notNull().default("available"),
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rooms_clinic_idx").on(t.clinicId),
  unique("rooms_clinic_id_unique").on(t.clinicId, t.id),
  unique("rooms_clinic_branch_id_unique").on(t.clinicId, t.branchId, t.id),
  foreignKey({ name: "rooms_branch_clinic_fk", columns: [t.clinicId, t.branchId], foreignColumns: [branchesTable.clinicId, branchesTable.id] }),
  check("rooms_capacity_check", sql`${t.capacity} > 0 AND ${t.capacity} <= 1000`),
]);

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id),
  branchId: integer("branch_id"),
  name: text("name").notNull(),
  nameLang: languageEnum("name_lang").notNull().default("en"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes").notNull().default(""),
  sensitiveNotes: text("sensitive_notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customers_clinic_name_idx").on(t.clinicId, t.name),
  unique("customers_clinic_id_unique").on(t.clinicId, t.id),
  foreignKey({ name: "customers_branch_clinic_fk", columns: [t.clinicId, t.branchId], foreignColumns: [branchesTable.clinicId, branchesTable.id] }),
  check("customers_contact_check", sql`nullif(trim(${t.phone}), '') IS NOT NULL OR nullif(trim(${t.email}), '') IS NOT NULL`),
]);

export const serviceEmployeesTable = pgTable("service_employees", {
  clinicId: integer("clinic_id").notNull(),
  serviceId: integer("service_id").notNull(),
  employeeId: integer("employee_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.serviceId, t.employeeId] }),
  foreignKey({ name: "service_employees_service_clinic_fk", columns: [t.clinicId, t.serviceId], foreignColumns: [servicesTable.clinicId, servicesTable.id] }).onDelete("cascade"),
  foreignKey({ name: "service_employees_user_clinic_fk", columns: [t.clinicId, t.employeeId], foreignColumns: [usersTable.clinicId, usersTable.id] }).onDelete("cascade"),
  index("service_employees_employee_idx").on(t.clinicId, t.employeeId),
]);

export const roomServicesTable = pgTable("room_services", {
  clinicId: integer("clinic_id").notNull(),
  roomId: integer("room_id").notNull(),
  serviceId: integer("service_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.roomId, t.serviceId] }),
  foreignKey({ name: "room_services_room_clinic_fk", columns: [t.clinicId, t.roomId], foreignColumns: [roomsTable.clinicId, roomsTable.id] }).onDelete("cascade"),
  foreignKey({ name: "room_services_service_clinic_fk", columns: [t.clinicId, t.serviceId], foreignColumns: [servicesTable.clinicId, servicesTable.id] }).onDelete("cascade"),
]);
export type Service = typeof servicesTable.$inferSelect;
export type Room = typeof roomsTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;
