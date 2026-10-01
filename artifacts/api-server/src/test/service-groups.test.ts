import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {and,eq} from 'drizzle-orm';
import {createDefinition} from '@workspace/service-definition';
import {db,branchesTable,servicesTable,roomsTable,roomServicesTable,serviceEmployeesTable,customersTable,appointmentsTable,auditEventsTable} from '@workspace/db';
import {Fixture,agent,login} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {normalizeWeek} from '../domain/setup-rules';

const fx=new Fixture();afterAll(()=>fx.cleanup());
let a:ReturnType<typeof agent>,viewer:ReturnType<typeof agent>,foreign:ReturnType<typeof agent>;
let clinicId:number,foreignClinic:number,branchId:number,otherBranch:number,foreignBranch:number,employeeId:number,managerId:number;
beforeAll(async()=>{
  clinicId=(await fx.createClinic('Main services')).id;foreignClinic=(await fx.createClinic('Other tenant')).id;
  const manager=await fx.createUser({clinicId,role:'manager',permissions:[...ROLE_PRESETS.manager]});managerId=manager.id;
  const reader=await fx.createUser({clinicId,role:'other_staff',permissions:['services.read']});
  const other=await fx.createUser({clinicId:foreignClinic,role:'manager',permissions:[...ROLE_PRESETS.manager]});
  employeeId=(await fx.createUser({clinicId,role:'service_provider',permissions:[...ROLE_PRESETS.service_provider]})).id;
  a=agent();viewer=agent();foreign=agent();for(const [client,user]of [[a,manager],[viewer,reader],[foreign,other]]as const)expect((await login(client,user.email,user.password)).status).toBe(200);
  const values={nameLang:'en' as const,timeZone:'Asia/Amman',openingHours:normalizeWeek({mon:[{open:'09:00',close:'17:00'}]})};
  branchId=(await db.insert(branchesTable).values({...values,clinicId,name:'Main'}).returning())[0]!.id;
  otherBranch=(await db.insert(branchesTable).values({...values,clinicId,name:'Second'}).returning())[0]!.id;
  foreignBranch=(await db.insert(branchesTable).values({...values,clinicId:foreignClinic,name:'Foreign'}).returning())[0]!.id;
});
async function makeGroup(name:string,count=2){
  const rows=await db.insert(servicesTable).values(Array.from({length:count},(_,index)=>({clinicId,branchId,name:`${name} child ${String(index+1).padStart(2,'0')}`,nameLang:'en' as const,durationMinutes:30,price:'25.000',category:'Test category',definition:{...createDefinition('custom','en'),section:name,medicalScope:'medical' as const,description:`Keep ${index}`}}))).returning();
  await db.insert(serviceEmployeesTable).values(rows.map(row=>({clinicId,employeeId,serviceId:row.id})));
  return rows;
}
const load=async(id:number)=>{const result=await a.get(`/api/clinic/services/${id}/group`);expect(result.status).toBe(200);return result.body;};
const edit=(group:any,name=group.name)=>({name,revision:group.revision,services:group.items.map((row:any)=>({id:row.id,service:{name:row.name,nameLang:row.nameLang,branchId:row.branchId,durationMinutes:row.durationMinutes,price:row.price,currency:row.currency,category:row.category,definition:row.definition,isActive:row.isActive,requiresRoom:row.requiresRoom,followUpEnabled:row.followUpEnabled,requiredEquipment:row.requiredEquipment,employeeIds:row.employeeIds}}))});

describe('Complete main service groups',()=>{
  it('reports clinic-wide active and inactive totals and filters the exact selected records',async()=>{
    const rows=await makeGroup('Summary filters',3);await db.update(servicesTable).set({isActive:false}).where(eq(servicesTable.id,rows[1]!.id));
    const all=await a.get('/api/clinic/services').query({grouped:'true',search:'Summary filters'});expect(all.status).toBe(200);expect(all.body.items).toHaveLength(3);expect(all.body.serviceSummary).toMatchObject({active:2,inactive:1});
    const active=await a.get('/api/clinic/services').query({grouped:'true',status:'active',search:'Summary filters'});expect(active.body.items.map((row:any)=>row.id)).toEqual([rows[0]!.id,rows[2]!.id]);expect(active.body.serviceSummary).toEqual(all.body.serviceSummary);
    const inactive=await a.get('/api/clinic/services').query({grouped:'true',status:'inactive',search:'Summary filters'});expect(inactive.body.items.map((row:any)=>row.id)).toEqual([rows[1]!.id]);expect(inactive.body.serviceSummary).toEqual(all.body.serviceSummary);
    const pageActive=await a.get('/api/clinic/services').query({grouped:'true',status:'active',pageServiceIds:String(rows[2]!.id)});expect(pageActive.body.items.map((row:any)=>row.id)).toEqual([rows[2]!.id]);
    const empty=await a.get('/api/clinic/services').query({grouped:'true',status:'active',pageServiceIds:''});expect(empty.status).toBe(200);expect(empty.body.items).toEqual([]);expect(empty.body.serviceGroupTotal).toBe(0);
    expect((await load(rows[1]!.id)).items,'Group editing and deletion include inactive members even from a filtered list').toHaveLength(3);
    expect((await a.get('/api/clinic/services').query({grouped:'true',status:'invalid'})).status).toBe(400);
    expect((await a.get('/api/clinic/services').query({grouped:'true',pageServiceIds:'1,bad'})).status).toBe(400);
  });
  it('paginates whole main services and numbers them consecutively',async()=>{
    const big=await makeGroup('Pagination A',26),small=await makeGroup('Pagination B');
    const first=await a.get('/api/clinic/services').query({grouped:'true',search:'Pagination',page:1,pageSize:1});expect(first.status).toBe(200);expect(first.body.serviceGroupTotal).toBe(2);expect(first.body.total).toBe(28);expect(first.body.items).toHaveLength(26);expect(first.body.serviceGroups[0]).toMatchObject({id:big[0]!.id,number:1,count:26});
    const second=await a.get('/api/clinic/services').query({grouped:'true',search:'Pagination',page:2,pageSize:1});expect(second.status).toBe(200);expect(second.body.items).toHaveLength(2);expect(second.body.serviceGroups[0]).toMatchObject({id:small[0]!.id,number:2});
    const search=await a.get('/api/clinic/services').query({grouped:'true',search:'Pagination A child 26'});expect(search.body.items).toHaveLength(26);expect(search.body.serviceGroupTotal).toBe(1);
    expect((await load(big[0]!.id)).items).toHaveLength(26);
  });
  it('keeps legacy category groups editable and preserves individual definitions and settings',async()=>{
    const rows=await makeGroup('Edit original');
    await db.update(servicesTable).set({definition:null,category:'Legacy section',branchId:otherBranch,followUpEnabled:true,requiredEquipment:['Existing device'],isActive:false}).where(eq(servicesTable.id,rows[1]!.id));
    const original=await load(rows[0]!.id),payload=edit(original,'Edited main service');payload.services[0].service.name='Edited subservice';payload.services[0].service.price='45.500';payload.services[0].service.durationMinutes=45;
    expect((await a.put(`/api/clinic/services/${rows[0]!.id}/group`).send(payload)).status).toBe(200);
    const updated=await load(rows[0]!.id);expect(updated.name).toBe('Edited main service');expect(updated.items[0]).toMatchObject({name:'Edited subservice',price:'45.500',durationMinutes:45,employeeIds:[employeeId],definition:{section:'Edited main service',description:'Keep 0'}});
    const legacy=await load(rows[1]!.id);expect(legacy.name).toBe('Legacy section');expect((await a.put(`/api/clinic/services/${rows[1]!.id}/group`).send(edit(legacy,'Legacy renamed'))).status).toBe(200);
    expect((await load(rows[1]!.id)).items[0]).toMatchObject({branchId:otherBranch,followUpEnabled:true,requiredEquipment:['Existing device'],isActive:false,definition:{section:'Legacy renamed'}});
  });
  it('rolls back every edit if any subservice has an invalid branch relationship',async()=>{
    const rows=await makeGroup('Atomic edit'),group=await load(rows[0]!.id),payload=edit(group,'Must not save');payload.services[0].service.price='99';payload.services[1].service.branchId=foreignBranch;
    expect((await a.put(`/api/clinic/services/${rows[0]!.id}/group`).send(payload)).status).toBe(404);
    const unchanged=await load(rows[0]!.id);expect(unchanged.revision).toBe(group.revision);expect(unchanged.items[0].price).toBe('25.000');expect(unchanged.name).toBe('Atomic edit');
  });
  it('rejects missing or foreign members and cannot merge into another main service',async()=>{
    const rows=await makeGroup('Membership'),other=await makeGroup('Existing main'),group=await load(rows[0]!.id),payload=edit(group);
    payload.services.pop();expect((await a.put(`/api/clinic/services/${rows[0]!.id}/group`).send(payload)).status).toBe(400);
    const foreignMember=edit(group);foreignMember.services[1].id=other[0]!.id;expect((await a.put(`/api/clinic/services/${rows[0]!.id}/group`).send(foreignMember)).status).toBe(400);
    expect((await a.put(`/api/clinic/services/${rows[0]!.id}/group`).send(edit(group,'Existing main'))).status).toBe(409);
    expect((await load(rows[0]!.id)).revision).toBe(group.revision);
  });
  it('allows the same subservice name at different branches without overwriting branch settings',async()=>{
    const rows=await makeGroup('Branch variants');await db.update(servicesTable).set({branchId:otherBranch}).where(eq(servicesTable.id,rows[1]!.id));
    const payload=edit(await load(rows[0]!.id));for(const item of payload.services)item.service.name='Same treatment';expect((await a.put(`/api/clinic/services/${rows[0]!.id}/group`).send(payload)).status).toBe(200);
    expect((await load(rows[0]!.id)).items.map((item:any)=>item.branchId)).toEqual([branchId,otherBranch]);
  });
  it('requires authentication, manage permissions and the same clinic for edits and deletes',async()=>{
    const rows=await makeGroup('Permissions'),group=await load(rows[0]!.id),path=`/api/clinic/services/${rows[0]!.id}/group`;
    expect((await agent().get(path)).status).toBe(401);expect((await viewer.get(path)).status).toBe(200);expect((await foreign.get(path)).status).toBe(404);
    expect((await viewer.put(path).send(edit(group))).status).toBe(403);expect((await foreign.put(path).send(edit(group))).status).toBe(404);
    expect((await viewer.delete(path).send({confirmed:true,revision:group.revision})).status).toBe(403);expect((await foreign.delete(path).send({confirmed:true,revision:group.revision})).status).toBe(404);
  });
  it('requires confirmation and rejects stale edits and deletes after group membership changes',async()=>{
    const rows=await makeGroup('Concurrent group'),group=await load(rows[0]!.id),path=`/api/clinic/services/${rows[0]!.id}/group`;
    for(const body of [{revision:group.revision},{confirmed:false,revision:group.revision},{confirmed:true}])expect((await a.delete(path).send(body)).status).toBe(400);
    await makeGroup('Concurrent group',1);
    expect((await a.put(path).send(edit(group))).status).toBe(409);expect((await a.delete(path).send({confirmed:true,revision:group.revision})).status).toBe(409);expect((await load(rows[0]!.id)).items).toHaveLength(3);
  });
  it('deletes all group members together, preserves history and updates numbering',async()=>{
    const rows=await makeGroup('Delete order A',23),remaining=await makeGroup('Delete order B');
    const [room]=await db.insert(roomsTable).values({clinicId,branchId,name:'History room'}).returning();await db.insert(roomServicesTable).values(rows.map(row=>({clinicId,roomId:room!.id,serviceId:row.id})));
    const [customer]=await db.insert(customersTable).values({clinicId,branchId,name:'History customer',email:'history-group@example.test'}).returning();
    const [appointment]=await db.insert(appointmentsTable).values({clinicId,branchId,customerId:customer!.id,serviceId:rows[22]!.id,employeeId,startsAt:new Date('2026-09-28T08:00:00Z'),endsAt:new Date('2026-09-28T08:30:00Z'),durationMinutes:30,requiresRoom:false,status:'completed',createdBy:managerId,chargePrice:'25.000',chargeCurrency:'JOD'}).returning();
    const group=await load(rows[0]!.id),deleted=await a.delete(`/api/clinic/services/${rows[0]!.id}/group`).send({confirmed:true,revision:group.revision});expect(deleted.status).toBe(200);expect(deleted.body.ids).toHaveLength(23);
    const list=await a.get('/api/clinic/services').query({grouped:'true',search:'Delete order'});expect(list.body.serviceGroupTotal).toBe(1);expect(list.body.serviceGroups[0]).toMatchObject({id:remaining[0]!.id,number:1,count:2});
    for(const row of rows){const [stored]=await db.select().from(servicesTable).where(eq(servicesTable.id,row.id));expect(stored!.deletedAt).toBeInstanceOf(Date);expect(stored!.isActive).toBe(false);}
    expect((await a.get(`/api/clinic/appointments/${appointment!.id}`)).status).toBe(200);expect((await a.get(`/api/clinic/services/${remaining[0]!.id}`)).status).toBe(200);
    expect(await db.select().from(roomServicesTable).where(eq(roomServicesTable.roomId,room!.id))).toEqual([]);
    const events=await db.select().from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinicId),eq(auditEventsTable.action,'service_group.deleted')));expect(events).toHaveLength(1);expect(events[0]!.details).toMatchObject({recordsPreserved:true});
  });
});
