import { sql } from 'drizzle-orm';
import { pgTable, serial, integer, text, numeric, boolean, timestamp, jsonb, primaryKey, unique, foreignKey, check } from 'drizzle-orm/pg-core';
import { clinicsTable, branchesTable } from './clinics';
import { usersTable } from './users';
import { servicesTable, roomsTable } from './setup';
import { inventoryItemsTable } from './operations';
import { appointmentsTable } from './scheduling';

export const equipmentAssetsTable = pgTable('equipment_assets', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull().references(() => clinicsTable.id),
  branchId: integer('branch_id').notNull(), roomId: integer('room_id'), name: text('name').notNull(),
  equipmentType: text('equipment_type').notNull().default(''),
  purchaseCost: numeric('purchase_cost', { precision: 12, scale: 3 }).notNull(),
  residualValue: numeric('residual_value', { precision: 12, scale: 3 }).notNull().default('0'),
  lifetimeUses: integer('lifetime_uses').notNull(),
  maintenancePerUse: numeric('maintenance_per_use', { precision: 12, scale: 3 }).notNull().default('0'),
  operatingHourlyCost: numeric('operating_hourly_cost', { precision: 12, scale: 3 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
}, t => [
  unique('equipment_assets_context_unique').on(t.clinicId, t.branchId, t.id),
  foreignKey({ columns: [t.clinicId, t.branchId], foreignColumns: [branchesTable.clinicId, branchesTable.id] }),
  foreignKey({ columns: [t.clinicId, t.branchId, t.roomId], foreignColumns: [roomsTable.clinicId, roomsTable.branchId, roomsTable.id] }),
  check('equipment_assets_cost_check', sql`${t.purchaseCost} >= 0 AND ${t.residualValue} >= 0 AND ${t.residualValue} <= ${t.purchaseCost} AND ${t.lifetimeUses} > 0 AND ${t.maintenancePerUse} >= 0 AND ${t.operatingHourlyCost} >= 0 AND ${t.purchaseCost} <> 'NaN'::numeric AND ${t.residualValue} <> 'NaN'::numeric AND ${t.maintenancePerUse} <> 'NaN'::numeric AND ${t.operatingHourlyCost} <> 'NaN'::numeric`),
]);
export const equipmentOperatorsTable = pgTable('equipment_operators', {
  clinicId: integer('clinic_id').notNull(), branchId: integer('branch_id').notNull(), equipmentId: integer('equipment_id').notNull(), employeeId: integer('employee_id').notNull(),
}, t => [
  primaryKey({ columns: [t.equipmentId, t.employeeId] }),
  foreignKey({ columns: [t.clinicId, t.branchId, t.equipmentId], foreignColumns: [equipmentAssetsTable.clinicId, equipmentAssetsTable.branchId, equipmentAssetsTable.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.clinicId, t.employeeId], foreignColumns: [usersTable.clinicId, usersTable.id] }),
]);
export const employeeCostsTable = pgTable('employee_costs', {
  clinicId: integer('clinic_id').notNull(), employeeId: integer('employee_id').notNull(), hourlyCost: numeric('hourly_cost', { precision: 12, scale: 3 }).notNull(),
}, t => [primaryKey({ columns: [t.clinicId, t.employeeId] }), foreignKey({ columns: [t.clinicId, t.employeeId], foreignColumns: [usersTable.clinicId, usersTable.id] }), check('employee_costs_nonnegative', sql`${t.hourlyCost} >= 0`)]);
export const roomCostsTable = pgTable('room_costs', {
  clinicId: integer('clinic_id').notNull(), roomId: integer('room_id').notNull(), hourlyCost: numeric('hourly_cost', { precision: 12, scale: 3 }).notNull(),
}, t => [primaryKey({ columns: [t.clinicId, t.roomId] }), foreignKey({ columns: [t.clinicId, t.roomId], foreignColumns: [roomsTable.clinicId, roomsTable.id] }), check('room_costs_nonnegative', sql`${t.hourlyCost} >= 0`)]);
export const serviceCostProfilesTable = pgTable('service_cost_profiles', {
  clinicId: integer('clinic_id').notNull(), serviceId: integer('service_id').notNull(), branchId: integer('branch_id').notNull(),
  overhead: numeric('overhead', { precision: 12, scale: 3 }).notNull().default('0'),
}, t => [
  primaryKey({ columns: [t.clinicId, t.serviceId, t.branchId] }),
  foreignKey({ columns: [t.clinicId, t.serviceId], foreignColumns: [servicesTable.clinicId, servicesTable.id] }),
  foreignKey({ columns: [t.clinicId, t.branchId], foreignColumns: [branchesTable.clinicId, branchesTable.id] }),
  check('service_cost_profiles_nonnegative', sql`${t.overhead} >= 0`),
]);
export const serviceMaterialCostsTable = pgTable('service_material_costs', {
  clinicId: integer('clinic_id').notNull(), serviceId: integer('service_id').notNull(), branchId: integer('branch_id').notNull(), itemId: integer('item_id').notNull(), quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
}, t => [
  primaryKey({ columns: [t.clinicId, t.serviceId, t.branchId, t.itemId] }),
  foreignKey({ columns: [t.clinicId, t.serviceId, t.branchId], foreignColumns: [serviceCostProfilesTable.clinicId, serviceCostProfilesTable.serviceId, serviceCostProfilesTable.branchId] }).onDelete('cascade'),
  foreignKey({ columns: [t.clinicId, t.branchId, t.itemId], foreignColumns: [inventoryItemsTable.clinicId, inventoryItemsTable.branchId, inventoryItemsTable.id] }),
  check('service_material_costs_positive', sql`${t.quantity} > 0`),
]);
export const serviceEquipmentCostsTable = pgTable('service_equipment_costs', {
  clinicId: integer('clinic_id').notNull(), serviceId: integer('service_id').notNull(), branchId: integer('branch_id').notNull(), equipmentId: integer('equipment_id').notNull(), uses: integer('uses').notNull(), minutes: integer('minutes').notNull(),
}, t => [
  primaryKey({ columns: [t.clinicId, t.serviceId, t.branchId, t.equipmentId] }),
  foreignKey({ columns: [t.clinicId, t.serviceId, t.branchId], foreignColumns: [serviceCostProfilesTable.clinicId, serviceCostProfilesTable.serviceId, serviceCostProfilesTable.branchId] }).onDelete('cascade'),
  foreignKey({ columns: [t.clinicId, t.branchId, t.equipmentId], foreignColumns: [equipmentAssetsTable.clinicId, equipmentAssetsTable.branchId, equipmentAssetsTable.id] }),
  check('service_equipment_costs_positive', sql`${t.uses} > 0 AND ${t.minutes} >= 0`),
]);
export const appointmentCostSnapshotsTable = pgTable('appointment_cost_snapshots', {
  id: serial('id').primaryKey(), clinicId: integer('clinic_id').notNull(), appointmentId: integer('appointment_id').notNull(),
  createdBy: integer('created_by').notNull(), requestHash: text('request_hash').notNull(), breakdown: jsonb('breakdown').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('appointment_cost_snapshot_unique').on(t.clinicId, t.appointmentId),
  foreignKey({ columns: [t.clinicId, t.appointmentId], foreignColumns: [appointmentsTable.clinicId, appointmentsTable.id] }),
  foreignKey({ columns: [t.clinicId, t.createdBy], foreignColumns: [usersTable.clinicId, usersTable.id] }),
]);
