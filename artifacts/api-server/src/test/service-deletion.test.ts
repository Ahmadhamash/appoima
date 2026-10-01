import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {and,eq} from 'drizzle-orm';
import {db,servicesTable,appointmentsTable,serviceEmployeesTable,roomServicesTable,auditEventsTable} from '@workspace/db';
import {Fixture,agent,login} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {normalizeWeek} from '../domain/setup-rules';

const fx=new Fixture();
afterAll(()=>fx.cleanup());
let manager:ReturnType<typeof agent>,viewer:ReturnType<typeof agent>,foreign:ReturnType<typeof agent>;
let clinicId:number,branchId:number,employeeId:number,roomId:number,serviceId:number,siblingId:number,appointmentId:number;
const body=()=>({name:'Full body laser',nameLang:'en',branchId,durationMinutes:45,price:'30.000',currency:'JOD',category:'Laser',requiresRoom:false,employeeIds:[employeeId]});
beforeAll(async()=>{
  const clinic=await fx.createClinic('Subservice deletion'),other=await fx.createClinic('Other tenant');clinicId=clinic.id;
  const owner=await fx.createUser({clinicId,role:'manager',permissions:[...ROLE_PRESETS.manager]});
  const reader=await fx.createUser({clinicId,role:'other_staff',permissions:['services.read']});
  const stranger=await fx.createUser({clinicId:other.id,role:'manager',permissions:[...ROLE_PRESETS.manager]});
  const provider=await fx.createUser({clinicId,role:'service_provider',permissions:[...ROLE_PRESETS.service_provider]});employeeId=provider.id;
  manager=agent();viewer=agent();foreign=agent();
  for(const [client,user]of [[manager,owner],[viewer,reader],[foreign,stranger]]as const)expect((await login(client,user.email,user.password)).status).toBe(200);
  const branch=await manager.post('/api/clinic/branches').send({name:'Main branch',nameLang:'en',timeZone:'Asia/Amman',openingHours:normalizeWeek({mon:[{open:'09:00',close:'17:00'}]})});expect(branch.status).toBe(201);branchId=branch.body.item.id;
  const first=await manager.post('/api/clinic/services').send(body());expect(first.status).toBe(201);serviceId=first.body.item.id;
  const second=await manager.post('/api/clinic/services').send({...body(),name:'Face laser'});expect(second.status).toBe(201);siblingId=second.body.item.id;
  const room=await manager.post('/api/clinic/rooms').send({name:'Laser room',nameLang:'en',branchId,capacity:1,status:'available',serviceIds:[serviceId,siblingId]});expect(room.status).toBe(201);roomId=room.body.item.id;
  const customer=await manager.post('/api/clinic/customers').send({name:'Existing customer',nameLang:'en',branchId,email:'history@example.test'});expect(customer.status).toBe(201);
  const [appointment]=await db.insert(appointmentsTable).values({clinicId,branchId,customerId:customer.body.item.id,serviceId,employeeId,roomId,startsAt:new Date('2026-09-28T07:00:00Z'),endsAt:new Date('2026-09-28T07:45:00Z'),durationMinutes:45,requiresRoom:false,status:'completed',createdBy:owner.id,chargePrice:'30.000',chargeCurrency:'JOD'}).returning();appointmentId=appointment!.id;
});

describe('Confirmed subservice deletion',()=>{
  it('requires authentication, manage permission and tenant ownership',async()=>{
    expect((await agent().delete(`/api/clinic/services/${serviceId}`).send({confirmed:true})).status).toBe(401);
    expect((await viewer.delete(`/api/clinic/services/${serviceId}`).send({confirmed:true})).status).toBe(403);
    expect((await foreign.delete(`/api/clinic/services/${serviceId}`).send({confirmed:true})).status).toBe(404);
  });
  it.each([{}, {confirmed:false}, {confirmed:true,clinicId:123}])('rejects an unconfirmed or unexpected deletion body %j',async input=>{
    expect((await manager.delete(`/api/clinic/services/${serviceId}`).send(input)).status).toBe(400);
    expect((await manager.get(`/api/clinic/services/${serviceId}`)).status).toBe(200);
  });
  it('removes only the chosen subservice and its current staff and room assignments',async()=>{
    const result=await manager.delete(`/api/clinic/services/${serviceId}`).send({confirmed:true});expect(result.status).toBe(200);expect(result.body.id).toBe(serviceId);
    const [row]=await db.select().from(servicesTable).where(eq(servicesTable.id,serviceId));expect(row!.deletedAt).toBeInstanceOf(Date);expect(row!.isActive).toBe(false);
    expect(await db.select().from(serviceEmployeesTable).where(eq(serviceEmployeesTable.serviceId,serviceId))).toEqual([]);
    expect(await db.select().from(roomServicesTable).where(eq(roomServicesTable.serviceId,serviceId))).toEqual([]);
    expect((await manager.get(`/api/clinic/rooms/${roomId}`)).body.item.serviceIds).toEqual([siblingId]);
    const list=await manager.get('/api/clinic/services');expect(list.body.items.map((item:{id:number})=>item.id)).toEqual([siblingId]);expect(list.body.total).toBe(1);
    expect((await manager.get(`/api/clinic/services/${siblingId}`)).status).toBe(200);
  });
  it('omits the deleted subservice from selections and prevents reactivation',async()=>{
    for(const path of ['/api/clinic/options?for=employees','/api/clinic/options?for=rooms','/api/clinic/scheduling/catalog','/api/clinic/costing/catalog']){
      const result=await manager.get(path);expect(result.status).toBe(200);expect(result.body.services.some((item:{id:number})=>item.id===serviceId)).toBe(false);
    }
    expect((await manager.get(`/api/clinic/services/${serviceId}`)).status).toBe(404);
    expect((await manager.put(`/api/clinic/services/${serviceId}`).send({...body(),isActive:true})).status).toBe(404);
    const unavailable=await manager.get('/api/clinic/scheduling/availability').query({branchId,serviceId,employeeId,date:'2026-10-05'});expect(unavailable.status).toBe(400);expect(unavailable.body.error).toBe('booking_unavailable');
  });
  it('preserves completed appointments and their cost reporting',async()=>{
    const [row]=await db.select().from(appointmentsTable).where(eq(appointmentsTable.id,appointmentId));expect(row!.serviceId).toBe(serviceId);expect(row!.status).toBe('completed');
    const detail=await manager.get(`/api/clinic/appointments/${appointmentId}`);expect(detail.status).toBe(200);expect(JSON.stringify(detail.body)).toContain('Full body laser');
    const costs=await manager.get(`/api/clinic/costing/appointments/${appointmentId}`);expect(costs.status).toBe(200);
  });
  it('allows safe retries without duplicating the deletion audit',async()=>{
    expect((await manager.delete(`/api/clinic/services/${serviceId}`).send({confirmed:true})).status).toBe(200);
    const events=await db.select().from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinicId),eq(auditEventsTable.entityId,serviceId),eq(auditEventsTable.action,'service.deleted')));expect(events).toHaveLength(1);
  });
});
