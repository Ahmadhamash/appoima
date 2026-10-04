import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, roomsTable, branchesTable, servicesTable, customersTable, usersTable, serviceEmployeesTable, roomServicesTable, appointmentsTable, type WeeklyHours } from '@workspace/db';
import { Fixture, agent, login } from './helpers';
import { ROLE_PRESETS } from '../domain/permissions';

const fx=new Fixture(),manager=agent(),viewer=agent(),foreign=agent();
const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{open:'00:00',close:'23:59'}]])) as WeeklyHours;
let clinicId:number,branchId:number,serviceId:number,customerId:number,employeeId:number,managerId:number;
const future=new Date(Date.now()+3*86400000);future.setUTCHours(7,0,0,0);
beforeAll(async()=>{
 if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw Error('Requires a disposable test database');
 clinicId=(await fx.createClinic()).id;
 const m=await fx.createUser({clinicId,role:'manager',permissions:ROLE_PRESETS.manager});managerId=m.id;await login(manager,m.email,m.password);
 const v=await fx.createUser({clinicId,role:'other_staff',permissions:['rooms.read']});await login(viewer,v.email,v.password);
 const f=await fx.createUser({clinicId:(await fx.createClinic()).id,role:'manager',permissions:ROLE_PRESETS.manager});await login(foreign,f.email,f.password);
 const provider=await fx.createUser({clinicId,role:'doctor',permissions:ROLE_PRESETS.doctor});employeeId=provider.id;await db.update(usersTable).set({workingHours:week}).where(eq(usersTable.id,employeeId));
 const [b]=await db.insert(branchesTable).values({clinicId,name:'Amman',timeZone:'Asia/Amman',openingHours:week}).returning();branchId=b!.id;
 const [s]=await db.insert(servicesTable).values({clinicId,branchId,name:'Treatment',category:'Treatment',price:'20',durationMinutes:30,requiresRoom:true}).returning();serviceId=s!.id;
 await db.insert(serviceEmployeesTable).values({clinicId,serviceId,employeeId});
 const [c]=await db.insert(customersTable).values({clinicId,name:'Patient',email:'patient@example.test'}).returning();customerId=c!.id;
});
async function room(name:string){const r=await manager.post('/api/clinic/rooms').send({name,nameLang:'en',status:'available',branchId,serviceIds:[serviceId],extra:{description:'Original'},capacity:2});expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.item.id as number;}
const remove=(id:number,client=manager)=>client.delete(`/api/clinic/rooms/${id}`).send({confirmed:true});
let pastAppointmentOffset=0;
async function appointment(roomId:number,status:'pending'|'confirmed'|'checked_in'|'in_service'|'completed'|'cancelled',past=false){const startsAt=past?new Date(Date.now()-2*86400000-(pastAppointmentOffset++)*3600000):future;return (await db.insert(appointmentsTable).values({clinicId,branchId,roomId,serviceId,customerId,employeeId,createdBy:managerId,status,startsAt,endsAt:new Date(startsAt.getTime()+30*60000),durationMinutes:30,requiresRoom:true}).returning())[0]!;}
describe('Room editing, confirmed deletion and booking protection',()=>{
 it('requires confirmation and permissions, refreshes settings and excludes removed rooms',async()=>{
  const id=await room('Editable');
  expect((await manager.delete(`/api/clinic/rooms/${id}`).send({confirmed:false})).status).toBe(400);
  expect((await remove(id,viewer)).status).toBe(403);expect((await remove(id,foreign)).status).toBe(404);
  const edited=await manager.put(`/api/clinic/rooms/${id}`).send({name:'Updated room',nameLang:'en',branchId,capacity:3,status:'maintenance',serviceIds:[serviceId],extra:{description:'Updated',color:'#123456',features:['Sink / Handwash']}});expect(edited.status).toBe(200);
  expect((await manager.get(`/api/clinic/rooms/${id}`)).body.item).toMatchObject({name:'Updated room',capacity:3,status:'maintenance',extra:{description:'Updated',color:'#123456'}});
  const old=await appointment(id,'completed',true);expect((await remove(id)).status).toBe(200);expect((await remove(id)).status).toBe(200);
  expect((await manager.get(`/api/clinic/rooms/${id}`)).status).toBe(404);
  expect((await manager.get('/api/clinic/rooms/overview')).body.rooms.some((r:{id:number})=>r.id===id)).toBe(false);
  expect((await manager.get('/api/clinic/rooms')).body.items.some((r:{id:number})=>r.id===id)).toBe(false);
  expect((await db.select().from(appointmentsTable).where(eq(appointmentsTable.id,old.id)))[0]!.roomId).toBe(id);
  expect((await manager.put(`/api/clinic/rooms/${id}`).send({name:'Restore',nameLang:'en',capacity:1,status:'available',branchId,serviceIds:[]})).status).toBe(404);
 });
 it('blocks every live future status and overdue checked-in or in-service appointments',async()=>{
  for(const status of ['pending','confirmed','checked_in','in_service'] as const){const id=await room(status),a=await appointment(id,status);expect((await remove(id)).body.error).toBe('room_has_appointments');await db.update(appointmentsTable).set({status:'cancelled'}).where(eq(appointmentsTable.id,a.id));expect((await remove(id)).status).toBe(200);}
  for(const status of ['checked_in','in_service'] as const){const id=await room('Overdue '+status),a=await appointment(id,status,true);expect((await remove(id)).body.error).toBe('room_has_appointments');await db.update(appointmentsTable).set({status:'completed'}).where(eq(appointmentsTable.id,a.id));expect((await remove(id)).status).toBe(200);}
 });
 it('serializes deletion with booking so an appointment never reserves a deleted room',async()=>{
  await db.update(roomsTable).set({status:'maintenance'}).where(eq(roomsTable.clinicId,clinicId));
  const id=await room('Race'),[booking,deletion]=await Promise.all([manager.post('/api/clinic/appointments').send({branchId,customerId,serviceId,employeeId,startsAt:future.toISOString(),idempotencyKey:randomUUID()}),remove(id)]);
  expect(booking.status===201&&deletion.status===200).toBe(false);
  if(booking.status===201)expect(deletion.body.error).toBe('room_has_appointments');else expect(deletion.status).toBe(200);
  const [r]=await db.select().from(roomsTable).where(and(eq(roomsTable.clinicId,clinicId),eq(roomsTable.id,id)));
  if(r!.deletedAt)expect((await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,clinicId),eq(appointmentsTable.roomId,id))))).toHaveLength(0);
 });
});
