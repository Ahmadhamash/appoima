import { activeBranch, activeEmployee, employeeAtBranch } from './branch-scope';
import { and, eq, ilike, or, inArray, sql, asc, isNull } from "drizzle-orm";
import {
  db, usersTable, branchesTable, servicesTable, roomsTable, customersTable,
  serviceEmployeesTable, roomServicesTable, type User,
} from "@workspace/db";
import { forbidden, notFound, conflict, badRequest } from "../lib/errors";
import { hasPermission, ROLE_PRESETS, ALL_PERMISSIONS, type Permission } from "../domain/permissions";
import { normalizeWeek, withinGrantCeiling, compatibleBranch, branchListPage } from "../domain/setup-rules";
import { roomHasEquipment } from "../domain/equipment";
import type { BranchInput, ServiceInput, ServiceBatchInput, RoomInput, CustomerInput, EmployeeInput, NewEmployeeInput, PageInput, EmployeePageInput, BranchPageInput } from "../domain/setup-validation";
import { employeeSchema } from "../domain/setup-validation";
import { createStaffAccount, hashPassword } from "./auth";
import { recordAudit } from "./audit";
import { validateStaffSchedules } from './staff-schedules';
import { staffWorksAt,staffScheduleIssue } from '../domain/staff-branches';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type SetupResource = "branches" | "services" | "rooms" | "employees" | "customers";
export const resourceArea = { branches: "settings", services: "services", rooms: "rooms", employees: "employees", customers: "customers" } as const;
function clinicOf(user: User): number { if (!user.clinicId || user.role === "platform_owner") throw forbidden("no_clinic"); return user.clinicId; }
function ensure(user: User, permission: Permission) { clinicOf(user); if (!hasPermission(user, permission)) throw forbidden(); }
const employeePublic = {
  id: usersTable.id, clinicId: usersTable.clinicId, branchId: usersTable.branchId,
  name: usersTable.name, nameLang: usersTable.nameLang, email: usersTable.email,
  phone: usersTable.phone, jobTitle: usersTable.jobTitle, role: usersTable.role,
  isActive: usersTable.isActive, mustChangePassword: usersTable.mustChangePassword,
  branchSchedules: usersTable.branchSchedules,
  workingHours: usersTable.workingHours, breaks: usersTable.breaks, timeOff: usersTable.timeOff,
};
const customerPublic = {
  id: customersTable.id, clinicId: customersTable.clinicId, branchId: customersTable.branchId,
  name: customersTable.name, nameLang: customersTable.nameLang,
  phone: customersTable.phone, email: customersTable.email, notes: customersTable.notes,
};
const pageResult = <T>(items: T[], total: number, page: PageInput) => ({ items, total, page: page.page, pageSize: page.pageSize });

/** One short setup write per clinic at a time; relationship validation and audit commit together. */
async function write<T>(actor: User, permission: Permission, work: (tx: Tx, clinicId: number, freshActor: User) => Promise<T>): Promise<T> {
  ensure(actor, permission);
  const clinicId = clinicOf(actor);
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7140002, ${clinicId})`);
      const [fresh] = await tx.select().from(usersTable).where(and(eq(usersTable.id, actor.id), and(eq(usersTable.clinicId, clinicId), activeEmployee())));
      if (!fresh || !fresh.isActive || fresh.mustChangePassword) throw forbidden();
      ensure(fresh, permission);
      return work(tx, clinicId, fresh);
    });
  } catch (err) {
    const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const code = e.code ?? e.cause?.code;
    if (code === "23505") throw conflict((e.constraint ?? e.cause?.constraint) === "users_email_unique" ? "email_taken" : "duplicate_record");
    if (code === "23503") throw badRequest("invalid_reference");
    throw err;
  }
}
async function branchExists(tx: Tx, clinicId: number, id: number | null) {
  if (id === null) return;
  const [branch] = await tx.select({ id: branchesTable.id }).from(branchesTable).where(and(and(eq(branchesTable.clinicId, clinicId), activeBranch(branchesTable.id)), eq(branchesTable.id, id)));
  if (!branch) throw notFound("record_not_found");
}
async function validateServices(tx: Tx, clinicId: number, ids: number[], branchId: number | null,branchIds?:number[]) {
  if (!ids.length) return;
  const rows = await tx.select({ id: servicesTable.id, branchId: servicesTable.branchId }).from(servicesTable).where(and(and(eq(servicesTable.clinicId, clinicId), and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))), inArray(servicesTable.id, ids)));
  if (rows.length !== ids.length) throw notFound("record_not_found");
  if (rows.some((s) => branchIds&&s.branchId!==null?!branchIds.includes(s.branchId):!compatibleBranch(s.branchId, branchId))) throw badRequest("branch_mismatch");
}
async function validateEmployees(tx: Tx, clinicId: number, ids: number[], branchId: number | null, providersOnly = false) {
  if (!ids.length) return;
  const rows = await tx.select({ id: usersTable.id, branchId: usersTable.branchId, branchSchedules:usersTable.branchSchedules,role: usersTable.role }).from(usersTable).where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), inArray(usersTable.id, ids)));
  if (rows.length !== ids.length) throw notFound("record_not_found");
  if (rows.some((u) => branchId!==null&&!staffWorksAt(u,branchId))) throw badRequest("branch_mismatch");
  if (providersOnly && rows.some((u) => !['doctor', 'service_provider'].includes(u.role))) throw badRequest("employee_not_eligible");
}
const audit = (tx: Tx, actor: User, action: string, entityType: string, entityId: number, details?: Record<string, unknown>) =>
  recordAudit({ clinicId: actor.clinicId, actorUserId: actor.id, action, entityType, entityId, details }, tx);

export async function listBranches(actor: User, p: BranchPageInput) {
  ensure(actor, "settings.read");
  const rows = await db.select().from(branchesTable).where(and(eq(branchesTable.clinicId, clinicOf(actor)), activeBranch(branchesTable.id))).orderBy(asc(branchesTable.name), asc(branchesTable.id));
  return branchListPage(rows.map(r=>({...r,openingHours:normalizeWeek(r.openingHours)})),p);
}
export async function getBranch(actor: User, id: number) {
  ensure(actor, "settings.read");
  const [row] = await db.select().from(branchesTable).where(and(and(eq(branchesTable.clinicId, clinicOf(actor)), activeBranch(branchesTable.id)), eq(branchesTable.id, id)));
  if (!row) throw notFound("record_not_found");
  return { ...row, openingHours: normalizeWeek(row.openingHours) };
}
export async function saveBranch(actor: User, input: BranchInput, id?: number) {
  return write(actor, "settings.manage", async (tx, clinicId, fresh) => {
    if(id){const branches=await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),activeBranch(branchesTable.id)));const original=branches.find(b=>b.id===id);if(!original)throw notFound('record_not_found');if(original.timeZone!==input.timeZone){const staff=await tx.select().from(usersTable).where(and(eq(usersTable.clinicId,clinicId),activeEmployee()));for(const employee of staff){const schedules=employee.branchSchedules.filter(s=>branches.some(b=>b.id===s.branchId));if(schedules.some(s=>s.branchId===id)&&schedules.length>1){const issue=staffScheduleIssue(schedules,branches.map(b=>b.id===id?{...b,timeZone:input.timeZone}:b));if(issue)throw badRequest(issue);}}}}
    const [row] = id
      ? await tx.update(branchesTable).set(input).where(and(eq(branchesTable.id, id), and(eq(branchesTable.clinicId, clinicId), activeBranch(branchesTable.id)))).returning()
      : await tx.insert(branchesTable).values({ ...input, clinicId }).returning();
    if (!row) throw notFound("record_not_found");
    await audit(tx, fresh, id ? "branch.updated" : "branch.created", "branch", row.id);
    return { id: row.id };
  });
}

export async function listServices(actor: User, p: PageInput) {
  ensure(actor, "services.read");
  const clinicId = clinicOf(actor);
  const condition = and(and(eq(servicesTable.clinicId, clinicId), and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))), p.search ? ilike(servicesTable.name, `%${p.search}%`) : undefined);
  const rows = await db.select().from(servicesTable).where(condition).orderBy(asc(servicesTable.name), asc(servicesTable.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(servicesTable).where(condition);
  const links = rows.length ? await db.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), inArray(serviceEmployeesTable.serviceId, rows.map((r) => r.id)))) : [];
  return pageResult(rows.map((r) => ({ ...r, employeeIds: links.filter((l) => l.serviceId === r.id).map((l) => l.employeeId), actualConsumptionAvailable: true })), count!.total, p);
}
export async function getService(actor: User, id: number) {
  ensure(actor, "services.read");
  const clinicId = clinicOf(actor);
  const [row] = await db.select().from(servicesTable).where(and(and(eq(servicesTable.clinicId, clinicId), and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))), eq(servicesTable.id, id)));
  if (!row) throw notFound("record_not_found");
  const links = await db.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.serviceId, id)));
  return { ...row, employeeIds: links.map((l) => l.employeeId), actualConsumptionAvailable: true };
}
export async function saveService(actor: User, input: ServiceInput, id?: number) {
  return write(actor, "services.manage", (tx, clinicId, fresh) => saveServiceInTx(tx, clinicId, fresh, input, id));
}
export async function saveServiceInTx(tx: Tx, clinicId: number, fresh: User, input: ServiceInput, id?: number) {
    const { employeeIds, ...fields } = input;
    await branchExists(tx, clinicId, fields.branchId);
    await validateEmployees(tx, clinicId, employeeIds, fields.branchId, true);
    if (id) {
      const linked = await tx.select({ branchId: roomsTable.branchId }).from(roomServicesTable).innerJoin(roomsTable, and(eq(roomsTable.id, roomServicesTable.roomId), and(eq(roomsTable.clinicId, clinicId), activeBranch(roomsTable.branchId)))).where(and(eq(roomServicesTable.clinicId, clinicId), eq(roomServicesTable.serviceId, id)));
      if (linked.some((r) => !compatibleBranch(fields.branchId, r.branchId))) throw badRequest("branch_mismatch");
    }
    const [row] = id
      ? await tx.update(servicesTable).set(fields).where(and(eq(servicesTable.id, id), and(eq(servicesTable.clinicId, clinicId), and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))))).returning()
      : await tx.insert(servicesTable).values({ ...fields, clinicId }).returning();
    if (!row) throw notFound("record_not_found");
    await tx.delete(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.serviceId, row.id)));
    if (employeeIds.length) await tx.insert(serviceEmployeesTable).values(employeeIds.map((employeeId) => ({ clinicId, employeeId, serviceId: row.id })));
    await audit(tx, fresh, id ? "service.updated" : "service.created", "service", row.id);
    return { id: row.id };
}

/** Remove the catalog entry without breaking appointment, billing or inventory history. */
export async function deleteService(actor: User, id: number) {
  return write(actor, 'services.manage', async (tx, clinicId, fresh) => {
    const [row] = await tx.select().from(servicesTable).where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.id, id), activeBranch(servicesTable.branchId)));
    if (!row) throw notFound('record_not_found');
    if (row.deletedAt) return { id, deletedAt: row.deletedAt.toISOString() };
    const deletedAt = new Date();
    await tx.update(servicesTable).set({ deletedAt, isActive: false }).where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.id, id)));
    await tx.delete(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.serviceId, id)));
    await tx.delete(roomServicesTable).where(and(eq(roomServicesTable.clinicId, clinicId), eq(roomServicesTable.serviceId, id)));
    await audit(tx, fresh, 'service.deleted', 'service', id, { recordsPreserved: true });
    return { id, deletedAt: deletedAt.toISOString() };
  });
}

export async function saveServicesBatch(actor: User, input: ServiceBatchInput) {
  return write(actor, "services.manage", async (tx, clinicId, fresh) => {
    const ids: number[] = [];
    for (const service of input.services) {
      const { employeeIds, ...fields } = service;
      await branchExists(tx, clinicId, fields.branchId);
      await validateEmployees(tx, clinicId, employeeIds, fields.branchId, true);
      const [row] = await tx.insert(servicesTable).values({ ...fields, clinicId }).returning({ id: servicesTable.id });
      if (!row) throw badRequest("record_not_found");
      if (employeeIds.length) await tx.insert(serviceEmployeesTable).values(employeeIds.map(employeeId => ({ clinicId, employeeId, serviceId: row.id })));
      await audit(tx, fresh, "service.created", "service", row.id);
      ids.push(row.id);
    }
    return { ids };
  });
}

export async function listRooms(actor: User, p: PageInput) {
  ensure(actor, "rooms.read");
  const clinicId = clinicOf(actor);
  const condition = and(and(eq(roomsTable.clinicId, clinicId), activeBranch(roomsTable.branchId)), p.search ? ilike(roomsTable.name, `%${p.search}%`) : undefined);
  const rows = await db.select().from(roomsTable).where(condition).orderBy(asc(roomsTable.name), asc(roomsTable.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(roomsTable).where(condition);
  const links = rows.length ? await db.select().from(roomServicesTable).where(and(eq(roomServicesTable.clinicId, clinicId), inArray(roomServicesTable.roomId, rows.map((r) => r.id)))) : [];
  return pageResult(rows.map((r) => ({ ...r, serviceIds: links.filter((l) => l.roomId === r.id).map((l) => l.serviceId) })), count!.total, p);
}
export async function getRoom(actor: User, id: number) {
  ensure(actor, "rooms.read");
  const clinicId = clinicOf(actor);
  const [row] = await db.select().from(roomsTable).where(and(and(eq(roomsTable.clinicId, clinicId), activeBranch(roomsTable.branchId)), eq(roomsTable.id, id)));
  if (!row) throw notFound("record_not_found");
  const links = await db.select().from(roomServicesTable).where(and(eq(roomServicesTable.clinicId, clinicId), eq(roomServicesTable.roomId, id)));
  return { ...row, serviceIds: links.map((l) => l.serviceId) };
}
export async function saveRoom(actor: User, input: RoomInput, id?: number) {
  return write(actor, "rooms.manage", async (tx, clinicId, fresh) => {
    const { serviceIds, ...fields } = input;
    const [existingRoom] = id ? await tx.select({extra:roomsTable.extra}).from(roomsTable).where(and(eq(roomsTable.id,id),and(eq(roomsTable.clinicId,clinicId), activeBranch(roomsTable.branchId)))) : [];
    const roomFields = { ...fields, extra: { ...existingRoom?.extra, ...fields.extra, openingHours: null, breaks: null } };
    await branchExists(tx, clinicId, fields.branchId);
    await validateServices(tx, clinicId, serviceIds, fields.branchId);
    if (serviceIds.length) {
      const services = await tx.select({requiredEquipment:servicesTable.requiredEquipment}).from(servicesTable).where(and(and(eq(servicesTable.clinicId,clinicId), and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))),inArray(servicesTable.id,serviceIds)));
      if (services.some(service=>!roomHasEquipment(service.requiredEquipment,roomFields.extra['equipment']))) throw badRequest('room_missing_equipment');
    }
    if(input.extra?.employeeIds)await validateEmployees(tx,clinicId,input.extra.employeeIds,fields.branchId);
    const [row] = id
      ? await tx.update(roomsTable).set(roomFields).where(and(eq(roomsTable.id, id), and(eq(roomsTable.clinicId, clinicId), activeBranch(roomsTable.branchId)))).returning()
      : await tx.insert(roomsTable).values({ ...roomFields, clinicId }).returning();
    if (!row) throw notFound("record_not_found");
    await tx.delete(roomServicesTable).where(and(eq(roomServicesTable.clinicId, clinicId), eq(roomServicesTable.roomId, row.id)));
    if (serviceIds.length) await tx.insert(roomServicesTable).values(serviceIds.map((serviceId) => ({ clinicId, serviceId, roomId: row.id })));
    await audit(tx, fresh, id ? "room.updated" : "room.created", "room", row.id);
    return { id: row.id };
  });
}

export async function listCustomers(actor: User, p: PageInput) {
  ensure(actor, "customers.read");
  const pattern = `%${p.search}%`;
  const condition = and(and(eq(customersTable.clinicId, clinicOf(actor)), activeBranch(customersTable.branchId)), p.search ? or(ilike(customersTable.name, pattern), ilike(customersTable.phone, pattern), ilike(customersTable.email, pattern)) : undefined);
  // List responses deliberately exclude all notes, including for managers.
  const rows = await db.select({ id: customersTable.id, name: customersTable.name, nameLang: customersTable.nameLang, phone: customersTable.phone, email: customersTable.email, branchId: customersTable.branchId }).from(customersTable).where(condition).orderBy(asc(customersTable.name), asc(customersTable.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(customersTable).where(condition);
  return pageResult(rows, count!.total, p);
}
export async function getCustomer(actor: User, id: number) {
  ensure(actor, "customers.read");
  const sensitive = hasPermission(actor, "customers.manage");
  const [row] = await db.select({ ...customerPublic, ...(sensitive ? { sensitiveNotes: customersTable.sensitiveNotes } : {}) }).from(customersTable).where(and(and(eq(customersTable.clinicId, clinicOf(actor)), activeBranch(customersTable.branchId)), eq(customersTable.id, id)));
  if (!row) throw notFound("record_not_found");
  if (sensitive) await recordAudit({ clinicId: actor.clinicId, actorUserId: actor.id, action: "customer.sensitive_notes_read", entityType: "customer", entityId: id });
  return { ...row, historyAvailable: hasPermission(actor, "appointments.read") || actor.role === "doctor" || actor.role === "service_provider" };
}
export async function saveCustomer(actor: User, input: CustomerInput, id?: number) {
  return write(actor, "customers.manage", async (tx, clinicId, fresh) => {
    await branchExists(tx, clinicId, input.branchId);
    const [row] = id
      ? await tx.update(customersTable).set(input).where(and(eq(customersTable.id, id), and(eq(customersTable.clinicId, clinicId), activeBranch(customersTable.branchId)))).returning({ id: customersTable.id })
      : await tx.insert(customersTable).values({ ...input, clinicId }).returning({ id: customersTable.id });
    if (!row) throw notFound("record_not_found");
    await audit(tx, fresh, id ? "customer.updated" : "customer.created", "customer", row.id, { sensitiveNotesChanged: input.sensitiveNotes !== undefined });
    return row;
  });
}

function guardTarget(actor: User, target: User, requestedPermissions?: string[]) {
  if (target.role === "platform_owner" || !withinGrantCeiling(actor.permissions, target.permissions)) throw forbidden("permission_escalation");
  if (requestedPermissions && !withinGrantCeiling(actor.permissions, requestedPermissions)) throw forbidden("permission_escalation");
}
async function targetEmployee(tx: Tx, clinicId: number, id: number) {
  const [row] = await tx.select().from(usersTable).where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), eq(usersTable.id, id)));
  if (!row) throw notFound("record_not_found");
  return row;
}
async function replaceEmployeeServices(tx: Tx, clinicId: number, id: number, serviceIds: number[]) {
  await tx.delete(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.employeeId, id),sql`exists(select 1 from services where services.id=${serviceEmployeesTable.serviceId} and ${and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))})`));
  if (serviceIds.length) await tx.insert(serviceEmployeesTable).values(serviceIds.map((serviceId) => ({ clinicId, serviceId, employeeId: id })));
}
export async function listEmployees(actor: User, p: EmployeePageInput) {
  ensure(actor, "employees.read");
  const clinicId = clinicOf(actor), pattern = `%${p.search}%`;
  const condition = and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), p.search ? or(ilike(usersTable.name, pattern), ilike(usersTable.jobTitle, pattern), ilike(usersTable.email, pattern), ilike(usersTable.phone, pattern)) : undefined, p.role ? eq(usersTable.role, p.role) : undefined, p.branchId ? employeeAtBranch(p.branchId) : undefined, p.status ? eq(usersTable.isActive, p.status === 'active') : undefined);
  const rows = await db.select({ id: usersTable.id, name: usersTable.name, nameLang: usersTable.nameLang, branchId: usersTable.branchId, branchSchedules: usersTable.branchSchedules, email: usersTable.email, phone: usersTable.phone, role: usersTable.role, jobTitle: usersTable.jobTitle, isActive: usersTable.isActive, workingHours: usersTable.workingHours }).from(usersTable).where(condition).orderBy(asc(usersTable.name), asc(usersTable.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(usersTable).where(condition);
  const links = rows.length ? await db.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), inArray(serviceEmployeesTable.employeeId, rows.map(row => row.id)),sql`exists(select 1 from services where services.id=${serviceEmployeesTable.serviceId} and ${and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))})`)) : [];
  const activeIds=new Set((await db.select({id:branchesTable.id}).from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),activeBranch(branchesTable.id)))).map(b=>b.id));
  for(const row of rows)row.branchSchedules=row.branchSchedules.filter(s=>activeIds.has(s.branchId));
  const all = await db.select({role:usersTable.role,isActive:usersTable.isActive}).from(usersTable).where(and(eq(usersTable.clinicId,clinicId), activeEmployee()));
  return { ...pageResult(rows.map(row => ({...row,workingHours:normalizeWeek(row.workingHours),serviceIds:links.filter(link=>link.employeeId===row.id).map(link=>link.serviceId)})), count!.total, p), summary:{total:all.length,active:all.filter(row=>row.isActive).length,doctors:all.filter(row=>row.role==='doctor').length,roles:Object.fromEntries(['manager','secretary','doctor','service_provider','other_staff'].map(role=>[role,all.filter(row=>row.role===role).length]))} };
}
export async function getEmployee(actor: User, id: number) {
  ensure(actor, "employees.read");
  const clinicId = clinicOf(actor), manager = hasPermission(actor, "employees.manage");
  const [row] = await db.select({ ...employeePublic, ...(manager ? { permissions: usersTable.permissions } : {}) }).from(usersTable).where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), eq(usersTable.id, id)));
  if (!row) throw notFound("record_not_found");
  const links = await db.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId, clinicId), eq(serviceEmployeesTable.employeeId, id),sql`exists(select 1 from services where services.id=${serviceEmployeesTable.serviceId} and ${and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt))})`));
  const activeIds=new Set((await db.select({id:branchesTable.id}).from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),activeBranch(branchesTable.id)))).map(b=>b.id));
  row.branchSchedules=row.branchSchedules.filter(s=>activeIds.has(s.branchId));
  const permissions = row.permissions ?? [];
  return { ...row, workingHours: normalizeWeek(row.workingHours), breaks: normalizeWeek(row.breaks), serviceIds: links.map((l) => l.serviceId), canEditAccess: manager && withinGrantCeiling(actor.permissions, permissions) && actor.id !== id };
}
export async function addEmployee(actor: User, input: NewEmployeeInput) {
  return write(actor, "employees.manage", async (tx, clinicId, fresh) => {
    if(input.branchSchedules){await validateStaffSchedules(tx,clinicId,input.branchSchedules);input={...input,branchId:input.branchSchedules.length===1?input.branchSchedules[0]!.branchId:null,workingHours:input.branchSchedules[0]!.workingHours,breaks:input.branchSchedules[0]!.breaks};}
    if (!withinGrantCeiling(fresh.permissions, input.permissions)) throw forbidden("permission_escalation");
    await branchExists(tx, clinicId, input.branchId);
    await validateServices(tx, clinicId, input.serviceIds, input.branchId,input.branchSchedules?.map(s=>s.branchId));
    const { initialPassword, ...fields } = input;
    const branches = input.workingHours === undefined ? await tx.select({openingHours:branchesTable.openingHours}).from(branchesTable).where(and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),input.branchId === null ? undefined : eq(branchesTable.id,input.branchId))).limit(2) : [];
    const resolved = employeeSchema.parse({...fields,workingHours:input.workingHours ?? normalizeWeek(branches.length === 1 ? branches[0]!.openingHours : null)});
    const user = await createStaffAccount({ ...resolved, initialPassword, clinicId, actorUserId: fresh.id }, tx);
    await tx.update(usersTable).set({ branchSchedules:resolved.branchSchedules??(resolved.branchId===null?[]:[{branchId:resolved.branchId,workingHours:resolved.workingHours,breaks:resolved.breaks}]),workingHours: resolved.workingHours, breaks: resolved.breaks, timeOff: resolved.timeOff, isActive: resolved.isActive }).where(and(eq(usersTable.id, user.id), and(eq(usersTable.clinicId, clinicId), activeEmployee())));
    await replaceEmployeeServices(tx, clinicId, user.id, input.serviceIds);
    return { id: user.id }; // Password and hash are never returned.
  });
}
export async function saveEmployee(actor: User, input: EmployeeInput, id: number) {
  return write(actor, "employees.manage", async (tx, clinicId, fresh) => {
    const target = await targetEmployee(tx, clinicId, id);
    guardTarget(fresh, target, input.permissions);
    // Account management is delegated to another authorized manager for self changes.
    if (id === fresh.id) throw forbidden("cannot_edit_self");
    const activeBranches=await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),activeBranch(branchesTable.id)));
    const currentSchedules=target.branchSchedules.filter(s=>activeBranches.some(b=>b.id===s.branchId));
    const branchSchedules=input.branchSchedules??(currentSchedules.length<=1&&input.branchId!==null?[{branchId:input.branchId,workingHours:input.workingHours,breaks:input.breaks}]:currentSchedules);
    if(input.branchSchedules){await validateStaffSchedules(tx,clinicId,input.branchSchedules);input={...input,branchId:input.branchSchedules.length===1?input.branchSchedules[0]!.branchId:null,workingHours:input.branchSchedules[0]!.workingHours,breaks:input.branchSchedules[0]!.breaks};}
    await branchExists(tx, clinicId, input.branchId);
    await validateServices(tx, clinicId, input.serviceIds, input.branchId,branchSchedules.length?branchSchedules.map(s=>s.branchId):undefined);
    const { serviceIds, ...fields } = input;
    const archivedAssignments=target.branchSchedules.filter(s=>!branchSchedules.some(candidate=>candidate.branchId===s.branchId));
    const archived=archivedAssignments.length?await tx.select().from(branchesTable).where(inArray(branchesTable.id,archivedAssignments.map(s=>s.branchId))):[];
    fields.branchSchedules=[...branchSchedules,...archivedAssignments.filter(s=>archived.some(b=>b.id===s.branchId&&b.archivedAt))];
    await tx.update(usersTable).set(fields).where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), eq(usersTable.id, id)));
    await replaceEmployeeServices(tx, clinicId, id, serviceIds);
    if (!fields.isActive) await tx.execute(sql`delete from "session" where sess->>'userId' = ${String(id)}`);
    await audit(tx, fresh, "user.updated", "user", id, { role: fields.role, permissions: fields.permissions, isActive: fields.isActive });
    return { id };
  });
}
export async function resetEmployeePassword(actor: User, id: number, initialPassword: string) {
  return write(actor, "employees.manage", async (tx, clinicId, fresh) => {
    const target = await targetEmployee(tx, clinicId, id);
    guardTarget(fresh, target);
    if (id === fresh.id) throw forbidden("cannot_edit_self");
    await tx.update(usersTable).set({ passwordHash: await hashPassword(initialPassword), mustChangePassword: true }).where(and(eq(usersTable.id, id), and(eq(usersTable.clinicId, clinicId), activeEmployee())));
    // Existing sessions must not be allowed to set a new password after a manager reset.
    await tx.execute(sql`delete from "session" where sess->>'userId' = ${String(id)}`);
    await audit(tx, fresh, "user.initial_password_reset", "user", id);
    return { id, mustChangePassword: true };
  });
}
export async function setEmployeeActive(actor: User, id: number, isActive: boolean) {
  return write(actor, "employees.manage", async (tx, clinicId, fresh) => {
    const target = await targetEmployee(tx, clinicId, id);
    guardTarget(fresh, target);
    if (id === fresh.id) throw forbidden("cannot_edit_self");
    await tx.update(usersTable).set({ isActive }).where(and(eq(usersTable.id, id), and(eq(usersTable.clinicId, clinicId), activeEmployee())));
    if (!isActive) await tx.execute(sql`delete from "session" where sess->>'userId' = ${String(id)}`);
    await audit(tx, fresh, "user.active_changed", "user", id, { isActive });
    return { id, isActive };
  });
}

/** Purpose-limited labels for form selections, not a bypass to private resource details. */
export async function serviceCategories(actor: User) {
  ensure(actor, 'services.read');
  const rows = await db.selectDistinct({name:servicesTable.category}).from(servicesTable).where(and(eq(servicesTable.clinicId,clinicOf(actor)),and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt)))).orderBy(asc(servicesTable.category));
  const unique = new Map<string,string>();
  for(const row of rows){const name=row.name.trim().replace(/\s+/g,' ');if(name&&!unique.has(name.normalize('NFKC').toLocaleLowerCase()))unique.set(name.normalize('NFKC').toLocaleLowerCase(),name);}
  return [...unique.values()];
}

export async function setupOptions(actor: User, resource: SetupResource) {
  ensure(actor, `${resourceArea[resource]}.read`);
  const clinicId = clinicOf(actor);
  const branches = await db.select({ id: branchesTable.id, name: branchesTable.name, nameLang: branchesTable.nameLang, timeZone: branchesTable.timeZone, openingHours: branchesTable.openingHours }).from(branchesTable).where(and(eq(branchesTable.clinicId, clinicId), activeBranch(branchesTable.id))).orderBy(asc(branchesTable.name));
  const services = ["rooms", "employees"].includes(resource) ? await db.select({ id: servicesTable.id, name: servicesTable.name, nameLang: servicesTable.nameLang, branchId: servicesTable.branchId, isActive: servicesTable.isActive, definition: servicesTable.definition, requiredEquipment: servicesTable.requiredEquipment }).from(servicesTable).where(and(eq(servicesTable.clinicId, clinicId), and(activeBranch(servicesTable.branchId), isNull(servicesTable.deletedAt)))).orderBy(asc(servicesTable.name)) : [];
  const employees = resource === "services" ? await db.select({ id: usersTable.id, name: usersTable.name, nameLang: usersTable.nameLang, branchId: usersTable.branchId, branchSchedules: usersTable.branchSchedules, isActive: usersTable.isActive }).from(usersTable).where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), inArray(usersTable.role, ['doctor', 'service_provider']))).orderBy(asc(usersTable.name)) : [];
  const canManageStaff = resource === "employees" && hasPermission(actor, "employees.manage");
  return { branches, services, employees, categories:resource==='services'?await serviceCategories(actor):[],
    timeZones: resource === "branches" ? [...new Set(["Asia/Amman", "UTC", ...(Intl as unknown as {supportedValuesOf(k: string): string[]}).supportedValuesOf("timeZone")])] : [],
    currencies: resource === "services" ? (Intl as unknown as {supportedValuesOf(k: string): string[]}).supportedValuesOf("currency") : [],
    grantablePermissions: canManageStaff ? ALL_PERMISSIONS.filter((p) => hasPermission(actor, p)) : [],
    rolePresets: canManageStaff ? Object.fromEntries(Object.entries(ROLE_PRESETS).map(([role, permissions]) => [role, permissions.filter((p) => hasPermission(actor, p))])) : {},
  };
}
