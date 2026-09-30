import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, branchesTable, servicesTable, roomsTable, serviceEmployeesTable, roomServicesTable, usersTable, customersTable, appointmentsTable, appointmentCostSnapshotsTable, type WeeklyHours } from '@workspace/db';
import { Fixture, agent, login } from './helpers';
import { ROLE_PRESETS } from '../domain/permissions';

const fixture = new Fixture(), manager = agent(), doctor = agent(), provider = agent(), secretary = agent(), outsider = agent();
const key = () => randomUUID();
const week = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day => [day, [{ open: '00:00', close: '23:59' }]])) as WeeklyHours;
let clinicId: number, branchId: number, serviceId: number, employeeId: number, providerId:number, roomId: number, customerId: number, materialId: number, assetId: number, parentId: number;
describe('costing and follow-up integration', () => {
  beforeAll(async () => {
    if (process.env.TEST_DATABASE_DISPOSABLE !== '1') throw new Error('Use a disposable database');
    const clinic = await fixture.createClinic(); clinicId = clinic.id;
    const owner = await fixture.createUser({ clinicId, role: 'manager', permissions: ROLE_PRESETS.manager }); await login(manager, owner.email, owner.password);
    const employee = await fixture.createUser({ clinicId, role: 'doctor', permissions: ROLE_PRESETS.doctor }); employeeId = employee.id; await login(doctor, employee.email, employee.password);
    const serviceProvider=await fixture.createUser({clinicId,role:'service_provider',permissions:ROLE_PRESETS.service_provider});providerId=serviceProvider.id;await login(provider,serviceProvider.email,serviceProvider.password);
    const desk = await fixture.createUser({ clinicId, role: 'secretary', permissions: ROLE_PRESETS.secretary }); await login(secretary, desk.email, desk.password);
    const another = await fixture.createClinic(), other = await fixture.createUser({ clinicId: another.id, role: 'manager', permissions: ROLE_PRESETS.manager }); await login(outsider, other.email, other.password);
    const [branch] = await db.insert(branchesTable).values({ clinicId, name: 'Cost branch', timeZone: 'UTC', openingHours: week }).returning(); branchId = branch!.id;
    await db.update(usersTable).set({ workingHours: week }).where(and(eq(usersTable.clinicId,clinicId),eq(usersTable.id,employeeId)));
    const [service] = await db.insert(servicesTable).values({ clinicId, name: 'Treatment', durationMinutes: 30, price: '50', currency: 'JOD', category: 'Skin', requiresRoom: true, followUpEnabled: true }).returning(); serviceId = service!.id;
    const [room] = await db.insert(roomsTable).values({ clinicId, branchId, name: 'Treatment room' }).returning(); roomId = room!.id;
    await db.insert(serviceEmployeesTable).values({ clinicId, serviceId, employeeId }); await db.insert(roomServicesTable).values({ clinicId, serviceId, roomId });
    const [customer] = await db.insert(customersTable).values({ clinicId, name: 'Test customer', phone: '0000000' }).returning(); customerId = customer!.id;
    const [parent] = await db.insert(appointmentsTable).values({ clinicId, branchId, serviceId, employeeId, customerId, roomId, startsAt: new Date('2030-01-01T09:00:00Z'), endsAt: new Date('2030-01-01T09:30:00Z'), durationMinutes: 30, requiresRoom: true, status: 'completed', createdBy: owner.id, chargePrice: '50', chargeCurrency: 'JOD' }).returning(); parentId = parent!.id;
  });
  it('limits cost data to authorized managers and isolates clinic references', async () => {
    expect((await doctor.get('/api/clinic/costing/catalog')).status).toBe(403);
    expect((await secretary.get('/api/clinic/costing/catalog')).status).toBe(403);
    expect((await manager.get('/api/clinic/costing/catalog')).status).toBe(200);
    expect((await outsider.put(`/api/clinic/costing/rates/employees/${employeeId}`).send({ value: '10' })).status).toBe(404);
  });
  it('does not present missing costs as a zero total', async () => {
    const q = await manager.post(`/api/clinic/costing/services/${serviceId}/quote`).send({ branchId, employeeId, roomId });
    expect(q.status).toBe(200); expect(q.body.total).toBe(null); expect(q.body.warnings).toContain('recipe_missing'); expect(q.body.warnings).toContain('employee_rate_missing');
  });
  it('connects stock, equipment, operators and rooms and computes a session', async () => {
    const m = await manager.post('/api/clinic/inventory/items').send({ name: 'Gel', nameLang: 'en', branchId, unit: 'ml', initialQuantity: '100', extra: { unitCost: '2' }, idempotencyKey: key() }); expect(m.status).toBe(201); materialId = m.body.id;
    const e = await manager.post('/api/clinic/costing/equipment').send({ name: 'Device', branchId, roomId, purchaseCost: '1000', residualValue: '100', lifetimeUses: 1000, maintenancePerUse: '0.200', operatingHourlyCost: '3', isActive: true, employeeIds: [employeeId] }); expect(e.status).toBe(201); assetId = e.body.id;
    expect((await manager.put(`/api/clinic/costing/rates/employees/${employeeId}`).send({ value: '12' })).status).toBe(200);
    expect((await manager.put(`/api/clinic/costing/rates/rooms/${roomId}`).send({ value: '6' })).status).toBe(200);
    expect((await manager.put(`/api/clinic/costing/services/${serviceId}`).send({ branchId, overhead: '1', materials: [{ itemId: materialId, quantity: '0.500' }], equipment: [{ equipmentId: assetId, uses: 1, minutes: 30 }] })).status).toBe(200);
    const q = await manager.post(`/api/clinic/costing/services/${serviceId}/quote`).send({ branchId, employeeId, roomId });
    expect(q.status).toBe(200); expect(q.body.total).toBe('13.600'); expect(q.body.profit).toBe('36.400');
    const wrong = await manager.post(`/api/clinic/costing/services/${serviceId}/quote`).send({ branchId, employeeId, roomId: null }); expect(wrong.body.total).toBe(null); expect(wrong.body.warnings).toContain('equipment_room_mismatch');
    const cross = await outsider.put(`/api/clinic/costing/services/${serviceId}`).send({ branchId, overhead: '1', materials: [], equipment: [] }); expect(cross.status).toBe(404);
  });
  it('defaults follow-ups to zero and accepts per-appointment secretary and assigned doctor prices', async () => {
    const body = { branchId, customerId, serviceId, employeeId, startsAt: '2030-01-02T10:00:00Z', appointmentType: 'follow_up', followUpOfId: parentId, idempotencyKey: key() };
    const booked = await secretary.post('/api/clinic/appointments').send(body); expect(booked.status).toBe(201);
    const id = booked.body.id, detail = await doctor.get(`/api/clinic/appointments/${id}`); expect(detail.body.chargePrice).toBe('0.000'); expect(detail.body.followUpOfId).toBe(parentId);
    expect((await doctor.post(`/api/clinic/appointments/${id}/charge`).send({ price: '7.500', expectedVersion: 1, idempotencyKey: key() })).status).toBe(200);
    expect((await secretary.post(`/api/clinic/appointments/${id}/charge`).send({ price: '8', expectedVersion: 2, idempotencyKey: key() })).status).toBe(200);
    expect((await outsider.post(`/api/clinic/appointments/${id}/charge`).send({ price: '9', expectedVersion: 3, idempotencyKey: key() })).status).toBe(404);
    const wrong = await secretary.post('/api/clinic/appointments').send({ ...body, followUpOfId: 999999, startsAt: '2030-01-03T10:00:00Z', idempotencyKey: key() }); expect(wrong.status).toBe(400);
  });
  it('uses real consumption and confirmed time, then preserves immutable finalized costs', async () => {
    const actual = { actualMinutes: 40, equipment: [{ equipmentId: assetId, uses: 1, minutes: 20 }] };
    const early = await manager.post(`/api/clinic/costing/appointments/${parentId}/finalize`).send(actual); expect(early.status).toBe(400);
    expect((await manager.post(`/api/clinic/appointments/${parentId}/consumption`).send({ consumption: { items: [{ itemId: materialId, quantity: '0.750' }] }, idempotencyKey: key() })).status).toBe(200);
    const final = await manager.post(`/api/clinic/costing/appointments/${parentId}/finalize`).send(actual); expect(final.status).toBe(200); expect(final.body.breakdown.total).toBe('16.600');
    expect((await manager.post(`/api/clinic/costing/appointments/${parentId}/finalize`).send(actual)).status).toBe(200);
    expect((await manager.post(`/api/clinic/costing/appointments/${parentId}/finalize`).send({ ...actual, actualMinutes: 45 })).status).toBe(409);
    await manager.put(`/api/clinic/costing/rates/materials/${materialId}`).send({ value: '99' });
    expect((await manager.get(`/api/clinic/costing/appointments/${parentId}`)).body.breakdown.total).toBe('16.600');
    expect((await doctor.post(`/api/clinic/appointments/${parentId}/charge`).send({ price: '8', expectedVersion: 1, idempotencyKey: key() })).status).toBe(409);
    await expect(db.update(appointmentCostSnapshotsTable).set({ requestHash: 'tampered' }).where(eq(appointmentCostSnapshotsTable.appointmentId, parentId))).rejects.toThrow();
    await expect(db.execute(sql`insert into employee_costs(clinic_id,employee_id,hourly_cost) values(${clinicId},${employeeId},'NaN') on conflict(clinic_id,employee_id) do update set hourly_cost='NaN'`)).rejects.toThrow();
  });
  it('allows the assigned service provider to price an appointment without granting scheduling management',async()=>{
    const [appointment]=await db.insert(appointmentsTable).values({clinicId,branchId,serviceId,customerId,employeeId:providerId,roomId,startsAt:new Date('2030-01-04T09:00:00Z'),endsAt:new Date('2030-01-04T09:30:00Z'),durationMinutes:30,requiresRoom:true,status:'pending',createdBy:employeeId,chargePrice:'0',chargeCurrency:'JOD'}).returning();
    expect((await provider.post(`/api/clinic/appointments/${appointment!.id}/charge`).send({price:'4.250',expectedVersion:1,idempotencyKey:key()})).status).toBe(200);
    expect((await provider.get(`/api/clinic/appointments/${appointment!.id}`)).body.chargePrice).toBe('4.250');
    expect((await doctor.post(`/api/clinic/appointments/${appointment!.id}/charge`).send({price:'5',expectedVersion:2,idempotencyKey:key()})).status).toBe(404);
  });
});
