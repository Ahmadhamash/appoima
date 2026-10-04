import { activeRoom, activeBranch, activeEmployee } from './branch-scope';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, sql, isNull } from 'drizzle-orm';
import { branchesTable, usersTable, servicesTable, roomsTable, serviceEmployeesTable, roomServicesTable, inventoryItemsTable, inventoryProductsTable, inventoryMovementsTable, inventoryConsumptionsTable, appointmentsTable, equipmentAssetsTable, equipmentOperatorsTable, employeeCostsTable, roomCostsTable, serviceCostProfilesTable, serviceMaterialCostsTable, serviceEquipmentCostsTable, appointmentCostSnapshotsTable, type User } from '@workspace/db';
import { hasPermission } from '../domain/permissions';
import { roomHasEquipment } from '../domain/equipment';
import { canonicalJson } from '../domain/scheduling-rules';
import { decimal, milli, materialCost, timeCost, equipmentCost, type EquipmentInput, type ProfileInput, type QuoteInput, type ActualInput } from '../domain/costing';
import {paymentSummary} from '../domain/patient-billing';
import {plannedProductSelections,resolveProductCharges} from './patient-billing';
import type {AppointmentProductCharge} from '@workspace/db';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { operatingClinic, withOperations, type OperationsTx } from './operations-context';
import { recordAudit } from './audit';

function authorize(user: User, write = false) {
  // Salary and clinic overhead are manager-only; inventory access alone is insufficient.
  if (user.role !== 'manager' || !['inventory', 'services', 'employees', 'rooms', 'settings'].every(area => hasPermission(user, `${area}.${write ? 'manage' : 'read'}` as 'settings.read'))) throw forbidden();
}
async function catalogInTx(tx: OperationsTx, clinicId: number, includeDeleted = false) {
  const branches = await tx.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable).where(and(eq(branchesTable.clinicId, clinicId), activeBranch(branchesTable.id))).orderBy(asc(branchesTable.id));
  const services = await tx.select({ id: servicesTable.id, name: servicesTable.name, branchId: servicesTable.branchId, durationMinutes: servicesTable.durationMinutes, price: servicesTable.price, currency: servicesTable.currency, requiresRoom: servicesTable.requiresRoom, requiredEquipment: servicesTable.requiredEquipment, isActive: servicesTable.isActive }).from(servicesTable).where(and(eq(servicesTable.clinicId, clinicId), activeBranch(servicesTable.branchId), includeDeleted ? undefined : isNull(servicesTable.deletedAt))).orderBy(asc(servicesTable.name));
  const employees = await tx.select({ id: usersTable.id, name: usersTable.name, branchId: usersTable.branchId, isActive: usersTable.isActive, hourlyCost: employeeCostsTable.hourlyCost }).from(usersTable).leftJoin(employeeCostsTable, and(eq(employeeCostsTable.clinicId, clinicId), eq(employeeCostsTable.employeeId, usersTable.id))).where(and(eq(usersTable.clinicId, clinicId), activeEmployee())).orderBy(asc(usersTable.name));
  const rooms = await tx.select({ id: roomsTable.id, name: roomsTable.name, branchId: roomsTable.branchId, status: roomsTable.status, extra: roomsTable.extra, hourlyCost: roomCostsTable.hourlyCost }).from(roomsTable).leftJoin(roomCostsTable, and(eq(roomCostsTable.clinicId, clinicId), eq(roomCostsTable.roomId, roomsTable.id))).where(and(eq(roomsTable.clinicId, clinicId), activeRoom())).orderBy(asc(roomsTable.name));
  const materials = await tx.select({ id: inventoryItemsTable.id, name: inventoryItemsTable.name, branchId: inventoryItemsTable.branchId, unit: inventoryItemsTable.unit, billingType:sql<string>`coalesce(${inventoryItemsTable.extra}->>'billingType','clinic_cost')`, sellingPrice:sql<string|null>`${inventoryItemsTable.extra}->>'sellingPrice'`, unitCost: sql<string | null>`${inventoryItemsTable.extra}->>'unitCost'`, isActive: sql<boolean>`${inventoryItemsTable.isAvailable}=1 and coalesce((${inventoryItemsTable.extra}->>'isActive')::boolean,true)` }).from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId, clinicId), activeBranch(inventoryItemsTable.branchId))).orderBy(asc(inventoryItemsTable.name));
  const equipment = await tx.select().from(equipmentAssetsTable).where(and(eq(equipmentAssetsTable.clinicId, clinicId), activeBranch(equipmentAssetsTable.branchId))).orderBy(asc(equipmentAssetsTable.name));
  const operators = await tx.select().from(equipmentOperatorsTable).where(and(eq(equipmentOperatorsTable.clinicId, clinicId), activeBranch(equipmentOperatorsTable.branchId)));
  const employeeLinks = await tx.select().from(serviceEmployeesTable).where(eq(serviceEmployeesTable.clinicId, clinicId));
  const roomLinks = await tx.select().from(roomServicesTable).where(eq(roomServicesTable.clinicId, clinicId));
  return { branches, services, employees, rooms, materials, equipment: equipment.map(item => ({ ...item, employeeIds: operators.filter(o => o.equipmentId === item.id).map(o => o.employeeId) })), employeeLinks, roomLinks };
}
export async function costingCatalog(actor: User) {
  return withOperations(actor, false, async (tx, fresh) => {
    authorize(fresh);
    return { ...await catalogInTx(tx, operatingClinic(fresh)), canManage: ['inventory', 'services', 'employees', 'rooms', 'settings'].every(area => hasPermission(fresh, `${area}.manage` as 'settings.manage')) };
  });
}
export async function saveEquipment(actor: User, id: number | null, input: EquipmentInput) {
  return withOperations(actor, true, async (tx, fresh) => {
    authorize(fresh, true); const clinicId = operatingClinic(fresh), catalog = await catalogInTx(tx, clinicId);
    if (!catalog.branches.some(b => b.id === input.branchId) || input.roomId && !catalog.rooms.some(r => r.id === input.roomId && r.branchId === input.branchId) || input.employeeIds.some(employeeId => !catalog.employees.some(e => e.id === employeeId && e.isActive && (!e.branchId || e.branchId === input.branchId)))) throw badRequest('costing_invalid_link');
    const { employeeIds, ...values } = input;
    let equipmentId = id;
    if (id) {
      const old = catalog.equipment.find(e => e.id === id); if (!old) throw notFound('record_not_found');
      if (old.branchId !== input.branchId) throw badRequest('costing_branch_locked');
      await tx.update(equipmentAssetsTable).set(values).where(and(and(eq(equipmentAssetsTable.clinicId, clinicId), activeBranch(equipmentAssetsTable.branchId)), eq(equipmentAssetsTable.id, id)));
      await tx.delete(equipmentOperatorsTable).where(and(and(eq(equipmentOperatorsTable.clinicId, clinicId), activeBranch(equipmentOperatorsTable.branchId)), eq(equipmentOperatorsTable.equipmentId, id)));
    } else {
      const [item] = await tx.insert(equipmentAssetsTable).values({ clinicId, ...values }).returning({ id: equipmentAssetsTable.id }); equipmentId = item!.id;
    }
    await tx.insert(equipmentOperatorsTable).values(employeeIds.map(employeeId => ({ clinicId, branchId: input.branchId, equipmentId: equipmentId!, employeeId })));
    await recordAudit({ clinicId, actorUserId: fresh.id, action: 'costing.equipment_saved', entityType: 'equipment', entityId: equipmentId! }, tx);
    return { id: equipmentId };
  });
}
export async function saveResourceRate(actor: User, kind: 'employees' | 'rooms' | 'materials', id: number, value: string) {
  return withOperations(actor, true, async (tx, fresh) => {
    authorize(fresh, true); const clinicId = operatingClinic(fresh);
    if (kind === 'employees') {
      const [resource] = await tx.select({ id: usersTable.id }).from(usersTable).where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), eq(usersTable.id, id))); if (!resource) throw notFound('record_not_found');
      await tx.insert(employeeCostsTable).values({ clinicId, employeeId: id, hourlyCost: value }).onConflictDoUpdate({ target: [employeeCostsTable.clinicId, employeeCostsTable.employeeId], set: { hourlyCost: value } });
    } else if (kind === 'rooms') {
      const [resource] = await tx.select({ id: roomsTable.id }).from(roomsTable).where(and(and(eq(roomsTable.clinicId, clinicId), activeRoom()), eq(roomsTable.id, id))); if (!resource) throw notFound('record_not_found');
      await tx.insert(roomCostsTable).values({ clinicId, roomId: id, hourlyCost: value }).onConflictDoUpdate({ target: [roomCostsTable.clinicId, roomCostsTable.roomId], set: { hourlyCost: value } });
    } else {
      const [item] = await tx.select().from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId, clinicId), activeBranch(inventoryItemsTable.branchId)), eq(inventoryItemsTable.id, id))); if (!item) throw notFound('record_not_found');
      await tx.update(inventoryItemsTable).set({ extra: { ...item.extra, unitCost: value } }).where(and(and(eq(inventoryItemsTable.clinicId, clinicId), activeBranch(inventoryItemsTable.branchId)), eq(inventoryItemsTable.productId, item.productId)));
      await tx.update(inventoryProductsTable).set({extra:{...item.extra,unitCost:value}}).where(and(eq(inventoryProductsTable.clinicId,clinicId),eq(inventoryProductsTable.id,item.productId)));
    }
    await recordAudit({ clinicId, actorUserId: fresh.id, action: 'costing.rate_saved', entityType: kind, entityId: id }, tx); return { id };
  });
}
async function profileInTx(tx: OperationsTx, clinicId: number, serviceId: number, branchId: number) {
  const where = and(and(eq(serviceCostProfilesTable.clinicId, clinicId), activeBranch(serviceCostProfilesTable.branchId)), eq(serviceCostProfilesTable.serviceId, serviceId), eq(serviceCostProfilesTable.branchId, branchId));
  const [profile] = await tx.select().from(serviceCostProfilesTable).where(where);
  const materials = await tx.select({ itemId: serviceMaterialCostsTable.itemId, quantity: serviceMaterialCostsTable.quantity }).from(serviceMaterialCostsTable).where(and(and(eq(serviceMaterialCostsTable.clinicId, clinicId), activeBranch(serviceMaterialCostsTable.branchId)), eq(serviceMaterialCostsTable.serviceId, serviceId), eq(serviceMaterialCostsTable.branchId, branchId))).orderBy(asc(serviceMaterialCostsTable.itemId));
  const equipment = await tx.select({ equipmentId: serviceEquipmentCostsTable.equipmentId, uses: serviceEquipmentCostsTable.uses, minutes: serviceEquipmentCostsTable.minutes }).from(serviceEquipmentCostsTable).where(and(and(eq(serviceEquipmentCostsTable.clinicId, clinicId), activeBranch(serviceEquipmentCostsTable.branchId)), eq(serviceEquipmentCostsTable.serviceId, serviceId), eq(serviceEquipmentCostsTable.branchId, branchId))).orderBy(asc(serviceEquipmentCostsTable.equipmentId));
  return { configured: !!profile, branchId, overhead: profile?.overhead ?? '0.000', materials, equipment };
}
export async function saveCostProfile(actor: User, serviceId: number, input: ProfileInput) {
  return withOperations(actor, true, async (tx, fresh) => {
    authorize(fresh, true); const clinicId = operatingClinic(fresh), c = await catalogInTx(tx, clinicId), service = c.services.find(s => s.id === serviceId);
    if (!service) throw notFound('record_not_found');
    if (!c.branches.some(b => b.id === input.branchId) || service.branchId && service.branchId !== input.branchId || input.materials.some(line => !c.materials.some(m => m.id === line.itemId && m.branchId === input.branchId && m.isActive)) || input.equipment.some(line => !c.equipment.some(e => e.id === line.equipmentId && e.branchId === input.branchId && e.isActive))) throw badRequest('costing_invalid_link');
    await tx.insert(serviceCostProfilesTable).values({ clinicId, serviceId, branchId: input.branchId, overhead: input.overhead }).onConflictDoUpdate({ target: [serviceCostProfilesTable.clinicId, serviceCostProfilesTable.serviceId, serviceCostProfilesTable.branchId], set: { overhead: input.overhead } });
    await tx.delete(serviceMaterialCostsTable).where(and(and(eq(serviceMaterialCostsTable.clinicId, clinicId), activeBranch(serviceMaterialCostsTable.branchId)), eq(serviceMaterialCostsTable.serviceId, serviceId), eq(serviceMaterialCostsTable.branchId, input.branchId)));
    await tx.delete(serviceEquipmentCostsTable).where(and(and(eq(serviceEquipmentCostsTable.clinicId, clinicId), activeBranch(serviceEquipmentCostsTable.branchId)), eq(serviceEquipmentCostsTable.serviceId, serviceId), eq(serviceEquipmentCostsTable.branchId, input.branchId)));
    if (input.materials.length) await tx.insert(serviceMaterialCostsTable).values(input.materials.map(line => ({ clinicId, serviceId, branchId: input.branchId, ...line })));
    if (input.equipment.length) await tx.insert(serviceEquipmentCostsTable).values(input.equipment.map(line => ({ clinicId, serviceId, branchId: input.branchId, ...line })));
    await recordAudit({ clinicId, actorUserId: fresh.id, action: 'costing.service_recipe_saved', entityType: 'service', entityId: serviceId, details: { branchId: input.branchId } }, tx);
    return { id: serviceId };
  });
}

export type CostLine = { kind: 'materials' | 'equipment' | 'employee' | 'room' | 'overhead'; name: string; amount: string | null; quantity?: string; unit?: string; hourlyCost?: string; unitCost?: string; minutes?: number; uses?: number; purchaseCost?: string; residualValue?: string; lifetimeUses?: number; maintenancePerUse?: string; operatingHourlyCost?: string };
async function quoteInTx(tx: OperationsTx, clinicId: number, serviceId: number, input: QuoteInput, actual?: ActualInput & { appointmentId: number; chargePrice: string | null; chargeCurrency: string | null; productCharges:AppointmentProductCharge[] }) {
  const c = await catalogInTx(tx, clinicId, !!actual), service = c.services.find(s => s.id === serviceId);
  if (!service) throw notFound('record_not_found');
  if (!c.branches.some(b => b.id === input.branchId) || service.branchId && service.branchId !== input.branchId) throw badRequest('costing_invalid_link');
  const profile = await profileInTx(tx, clinicId, serviceId, input.branchId), warnings: string[] = [], lines: CostLine[] = [];
  const eligibleEmployees = c.employees.filter(e => e.isActive && (!e.branchId || e.branchId === input.branchId) && c.employeeLinks.some(l => l.serviceId === serviceId && l.employeeId === e.id));
  const eligibleRooms = c.rooms.filter(r => r.branchId === input.branchId && r.status === 'available' && c.roomLinks.some(l => l.serviceId === serviceId && l.roomId === r.id) && roomHasEquipment(service.requiredEquipment, r.extra['equipment']));
  if (!profile.configured) warnings.push('recipe_missing');
  if (service.currency !== 'JOD') warnings.push('currency_mismatch');
  let materialLines = profile.materials;
  if (actual) {
    if(actual.chargePrice===null)warnings.push('actual_price_missing');
    if(actual.chargeCurrency!==null&&actual.chargeCurrency!=='JOD')warnings.push('currency_mismatch');
    const [record] = await tx.select().from(inventoryConsumptionsTable).where(and(and(eq(inventoryConsumptionsTable.clinicId, clinicId), activeBranch(inventoryConsumptionsTable.branchId)), eq(inventoryConsumptionsTable.appointmentId, actual.appointmentId)));
    if (!record) warnings.push('actual_consumption_missing');
    materialLines = record ? await tx.select({ itemId: inventoryMovementsTable.itemId, quantity: sql<string>`(-${inventoryMovementsTable.quantity})::text` }).from(inventoryMovementsTable).where(and(and(eq(inventoryMovementsTable.clinicId, clinicId), activeBranch(inventoryMovementsTable.branchId)), eq(inventoryMovementsTable.consumptionId, record.id))).orderBy(asc(inventoryMovementsTable.itemId)) : [];
  }
  for (const entry of materialLines) {
    const m = c.materials.find(item => item.id === entry.itemId);
    const rate = m?.unitCost && /^\d+(?:\.\d{1,3})?$/.test(m.unitCost) ? m.unitCost : null;
    if (!m || m.branchId !== input.branchId || !actual && !m.isActive) warnings.push('material_unavailable');
    if (rate === null) warnings.push('material_rate_missing');
    lines.push({ kind: 'materials', name: m?.name ?? `#${entry.itemId}`, quantity: entry.quantity, unit: m?.unit, unitCost: rate ?? undefined, amount: rate === null ? null : decimal(materialCost(entry.quantity, rate)) });
  }
  const equipmentLines = actual ? actual.equipment : profile.equipment;
  const normalize=(value:string)=>value.trim().toLocaleLowerCase();
  if(!actual&&service.requiredEquipment.some(required=>!equipmentLines.some(line=>{const asset=c.equipment.find(e=>e.id===line.equipmentId);return asset&&(normalize(asset.equipmentType)===normalize(required)||normalize(asset.name)===normalize(required));})))warnings.push('required_equipment_cost_missing');
  if (actual && canonicalJson(equipmentLines.map(l => l.equipmentId).sort((a, b) => a - b)) !== canonicalJson(profile.equipment.map(l => l.equipmentId).sort((a, b) => a - b))) throw badRequest('costing_equipment_mismatch');
  for (const entry of equipmentLines) {
    const asset = c.equipment.find(e => e.id === entry.equipmentId);
    if (!asset) throw badRequest('costing_invalid_link');
    if (entry.uses === 0 && entry.minutes === 0) continue;
    if (!actual && !asset.isActive) warnings.push('equipment_inactive');
    if (asset.roomId && asset.roomId !== input.roomId) warnings.push('equipment_room_mismatch');
    if (!input.employeeId || !asset.employeeIds.includes(input.employeeId)) warnings.push('equipment_operator_mismatch');
    lines.push({ kind: 'equipment', name: asset.name, ...entry, purchaseCost: asset.purchaseCost, residualValue: asset.residualValue, lifetimeUses: asset.lifetimeUses, maintenancePerUse: asset.maintenancePerUse, operatingHourlyCost: asset.operatingHourlyCost, amount: decimal(equipmentCost(asset, entry.uses, entry.minutes)) });
  }
  const duration = actual?.actualMinutes ?? service.durationMinutes;
  const employee = c.employees.find(e => e.id === input.employeeId);
  if (!employee) warnings.push('employee_missing');
  else {
    if (!actual && !eligibleEmployees.some(e => e.id === employee.id)) warnings.push('employee_service_mismatch');
    if (employee.hourlyCost === null) warnings.push('employee_rate_missing');
    lines.push({ kind: 'employee', name: employee.name, minutes: duration, hourlyCost: employee.hourlyCost ?? undefined, amount: employee.hourlyCost === null ? null : decimal(timeCost(employee.hourlyCost, duration)) });
  }
  const room = c.rooms.find(r => r.id === input.roomId);
  if (input.roomId && !room || room && room.branchId !== input.branchId) throw badRequest('costing_invalid_link');
  if (room) {
    if (!actual && !eligibleRooms.some(r => r.id === room.id)) warnings.push('room_service_mismatch');
    if (room.hourlyCost === null) warnings.push('room_rate_missing');
    lines.push({ kind: 'room', name: room.name, minutes: duration, hourlyCost: room.hourlyCost ?? undefined, amount: room.hourlyCost === null ? null : decimal(timeCost(room.hourlyCost, duration)) });
  } else if (service.requiresRoom || service.requiredEquipment.length) warnings.push('room_missing');
  lines.push({ kind: 'overhead', name: 'overhead', amount: profile.overhead });
  let billing:ReturnType<typeof paymentSummary>|null=null;
  if(actual)billing=paymentSummary(actual.chargePrice,actual.productCharges,'actual');
  else {try{billing=paymentSummary(service.price,await resolveProductCharges(tx,clinicId,input.branchId,await plannedProductSelections(tx,clinicId,input.branchId,serviceId)));}catch(error){if(!(error instanceof Error)||!error.message.startsWith('billing_'))throw error;warnings.push(error.message);}}
  const uniqueWarnings = [...new Set(warnings)], sum = lines.reduce((value, line) => value + (line.amount === null ? 0n : milli(line.amount)), 0n);
  const complete = !uniqueWarnings.length, total = complete ? decimal(sum) : null;
  const price=billing?.total??null;
  return { mode: actual ? 'actual' : 'planned', currency: 'JOD', durationMinutes: duration, service: { id: service.id, name: service.name }, price, billing, priceCurrency: actual?.chargeCurrency??service.currency, complete, total, knownSubtotal: decimal(sum), profit: complete&&price!==null ? decimal(milli(price) - sum) : null, warnings: uniqueWarnings, lines, profile, eligibleEmployees: eligibleEmployees.map(e => ({ id: e.id, name: e.name })), eligibleRooms: eligibleRooms.map(r => ({ id: r.id, name: r.name })), rounding: 'Each component rounded to 0.001 JOD, then summed', rateBasis: 'Configured rates at calculation time' };
}
export async function serviceCostQuote(actor: User, serviceId: number, input: QuoteInput) {
  return withOperations(actor, false, async (tx, fresh) => { authorize(fresh); return quoteInTx(tx, operatingClinic(fresh), serviceId, input); });
}
export async function completedCostAppointments(actor: User) {
  return withOperations(actor, false, async (tx, fresh) => {
    authorize(fresh); if (!hasPermission(fresh, 'appointments.read')) throw forbidden(); const clinicId = operatingClinic(fresh);
    const appointments = await tx.select({ id: appointmentsTable.id, serviceId: appointmentsTable.serviceId, branchId: appointmentsTable.branchId, startsAt: appointmentsTable.startsAt, endsAt: appointmentsTable.endsAt, employeeId: appointmentsTable.employeeId, roomId: appointmentsTable.roomId }).from(appointmentsTable).where(and(and(eq(appointmentsTable.clinicId, clinicId), activeBranch(appointmentsTable.branchId)), eq(appointmentsTable.status, 'completed'))).orderBy(desc(appointmentsTable.startsAt)).limit(200);
    return { appointments };
  });
}
export async function appointmentCost(actor: User, id: number, input?: ActualInput, freeze = false) {
  return withOperations(actor, freeze, async (tx, fresh) => {
    authorize(fresh, freeze); if (!hasPermission(fresh, 'appointments.read')) throw forbidden(); const clinicId = operatingClinic(fresh);
    const [appointment] = await tx.select().from(appointmentsTable).where(and(and(eq(appointmentsTable.clinicId, clinicId), activeBranch(appointmentsTable.branchId)), eq(appointmentsTable.id, id)));
    if (!appointment) throw notFound('appointment_not_found'); if (appointment.status !== 'completed') throw conflict('consumption_requires_completed');
    const [snapshot] = await tx.select().from(appointmentCostSnapshotsTable).where(and(eq(appointmentCostSnapshotsTable.clinicId, clinicId), eq(appointmentCostSnapshotsTable.appointmentId, id)));
    if (snapshot) {
      if (freeze && createHash('sha256').update(canonicalJson(input)).digest('hex') !== snapshot.requestHash) throw conflict('costing_snapshot_locked');
      return { frozen: true, createdAt: snapshot.createdAt, breakdown: snapshot.breakdown };
    }
    const profile = await profileInTx(tx, clinicId, appointment.serviceId, appointment.branchId);
    // Initial view is a draft. Actual time and equipment usage must be confirmed before freezing.
    const actual = input ?? { actualMinutes: Math.min(1440, Math.max(1, Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60000))), equipment: profile.equipment };
    const breakdown = await quoteInTx(tx, clinicId, appointment.serviceId, { branchId: appointment.branchId, employeeId: appointment.employeeId, roomId: appointment.roomId }, { ...actual, appointmentId: id,chargePrice:appointment.chargePrice,chargeCurrency:appointment.chargeCurrency,productCharges:appointment.productCharges });
    if (freeze) {
      if (!input || !breakdown.complete) throw badRequest('costing_incomplete');
      await tx.insert(appointmentCostSnapshotsTable).values({ clinicId, appointmentId: id, createdBy: fresh.id, requestHash: createHash('sha256').update(canonicalJson(input)).digest('hex'), breakdown });
      await recordAudit({ clinicId, actorUserId: fresh.id, action: 'costing.appointment_finalized', entityType: 'appointment', entityId: id }, tx);
    }
    return { frozen: freeze, breakdown, actual };
  });
}
