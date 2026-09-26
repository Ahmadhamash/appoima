/** Integration tests: requires a disposable real PostgreSQL database with all three migrations. */
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, branchesTable, servicesTable, roomsTable, customersTable, usersTable, serviceEmployeesTable, roomServicesTable,
  appointmentsTable, schedulingCommandsTable } from '@workspace/db';
import { agent, Fixture, login } from './helpers';
import { ROLE_PRESETS } from '../domain/permissions';
import { shiftDate } from '../domain/scheduling-rules';
import { verifySchedulingGuards } from '../services/scheduling';
const f = new Fixture();
const manager = agent(), doctor = agent(), reader = agent(), otherClinic = agent(), forbiddenUser = agent();
let clinicA:number, clinicB:number, branchA:number, branchB:number, serviceA:number, serviceB:number,
  roomA:number, roomTwo:number, customerA:number, customerB:number, managerId:number, docId:number, docTwoId:number, docBId:number;
const week = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map((d)=>[d,[{open:'09:00',close:'17:00'}]])) as unknown as Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun',{open:string;close:string}[]>;
const empty = Object.fromEntries(Object.keys(week).map((d)=>[d,[]])) as unknown as typeof week;
const date = shiftDate(new Date().toISOString().slice(0,10), 8);
const at = (hour=9,minute=0) => `${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00.000Z`;
const payload = (more:Record<string,unknown>={})=>({branchId:branchA,customerId:customerA,serviceId:serviceA,employeeId:docId,startsAt:at(),notes:'Provider-only operational note',notesLang:'en',idempotencyKey:randomUUID(),...more});
const book = (more:Record<string,unknown>={})=>manager.post('/api/clinic/appointments').send(payload(more));
const change = (id:number,status:string,expectedVersion:number,more:Record<string,unknown>={})=>manager.post(`/api/clinic/appointments/${id}/status`).send({status,expectedVersion,reason:'Test decision',idempotencyKey:randomUUID(),...more});
const countAppointments=async()=>{const rows=await db.select().from(appointmentsTable).where(eq(appointmentsTable.clinicId,clinicA));return rows.length;};
const errorCode=(e:unknown):string|undefined=>{const v=e as {code?:string;cause?:{code?:string}};return v.code??v.cause?.code;};
async function rawAppointment(employeeId=docId,roomId:number|null=roomA,startsAt=at(),customerId=customerA) {
  return db.insert(appointmentsTable).values({clinicId:clinicA,branchId:branchA,customerId,serviceId:serviceA,employeeId,roomId,
    startsAt:new Date(startsAt),endsAt:new Date(Date.parse(startsAt)+45*60000),durationMinutes:45,requiresRoom:true,createdBy:managerId}).returning();
}
describe('Phase 3 scheduling',()=>{
  beforeAll(async()=>{
    await verifySchedulingGuards();
    clinicA=(await f.createClinic()).id;clinicB=(await f.createClinic()).id;
    const a=await f.createUser({clinicId:clinicA,role:'manager',permissions:ROLE_PRESETS.manager});managerId=a.id;
    const b=await f.createUser({clinicId:clinicB,role:'manager',permissions:ROLE_PRESETS.manager});
    const d=await f.createUser({clinicId:clinicA,role:'doctor',permissions:['customers.read']});docId=d.id;
    docTwoId=(await f.createUser({clinicId:clinicA,role:'service_provider',permissions:['customers.read']})).id;
    docBId=(await f.createUser({clinicId:clinicB,role:'doctor',permissions:[]})).id;
    const r=await f.createUser({clinicId:clinicA,role:'other_staff',permissions:['appointments.read','customers.read']});
    const n=await f.createUser({clinicId:clinicA,role:'other_staff',permissions:['customers.read']});
    await login(manager,a.email,a.password);await login(otherClinic,b.email,b.password);await login(doctor,d.email,d.password);await login(reader,r.email,r.password);await login(forbiddenUser,n.email,n.password);
    branchA=(await db.insert(branchesTable).values({clinicId:clinicA,name:'Schedule A',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
    branchB=(await db.insert(branchesTable).values({clinicId:clinicB,name:'Schedule B',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
    await db.update(usersTable).set({branchId:branchA,workingHours:week}).where(inArray(usersTable.id,[docId,docTwoId]));
    await db.update(usersTable).set({branchId:branchB,workingHours:week}).where(eq(usersTable.id,docBId));
    serviceA=(await db.insert(servicesTable).values({clinicId:clinicA,branchId:branchA,name:'Service A',durationMinutes:45,price:'25',category:'Skin',requiresRoom:true}).returning())[0]!.id;
    serviceB=(await db.insert(servicesTable).values({clinicId:clinicB,branchId:branchB,name:'Service B',durationMinutes:45,price:'25',category:'Skin',requiresRoom:true}).returning())[0]!.id;
    roomA=(await db.insert(roomsTable).values({clinicId:clinicA,branchId:branchA,name:'Room A',status:'available'}).returning())[0]!.id;
    roomTwo=(await db.insert(roomsTable).values({clinicId:clinicA,branchId:branchA,name:'Room two',status:'available'}).returning())[0]!.id;
    customerA=(await db.insert(customersTable).values({clinicId:clinicA,name:'Customer A',email:'customer-a@example.test',notes:'Permitted customer note',sensitiveNotes:'Restricted customer note'}).returning())[0]!.id;
    customerB=(await db.insert(customersTable).values({clinicId:clinicB,name:'Customer B',email:'customer-b@example.test'}).returning())[0]!.id;
    await db.insert(serviceEmployeesTable).values([{clinicId:clinicA,serviceId:serviceA,employeeId:docId},{clinicId:clinicA,serviceId:serviceA,employeeId:docTwoId}]);
    await db.insert(roomServicesTable).values([{clinicId:clinicA,serviceId:serviceA,roomId:roomA},{clinicId:clinicA,serviceId:serviceA,roomId:roomTwo}]);
  });
  beforeEach(async()=>{
    await db.delete(appointmentsTable).where(inArray(appointmentsTable.clinicId,[clinicA,clinicB]));
    await db.delete(schedulingCommandsTable).where(inArray(schedulingCommandsTable.clinicId,[clinicA,clinicB]));
    await db.update(usersTable).set({workingHours:week,breaks:empty,timeOff:[],permissions:['customers.read'],isActive:true}).where(inArray(usersTable.id,[docId,docTwoId]));
    await db.update(branchesTable).set({timeZone:'UTC',openingHours:week}).where(eq(branchesTable.id,branchA));
    await db.update(roomsTable).set({status:'available'}).where(inArray(roomsTable.id,[roomA,roomTwo]));
    await db.update(servicesTable).set({isActive:true}).where(eq(servicesTable.id,serviceA));
  });
  afterAll(async()=>{await f.cleanup();});
  it('checks actual PostgreSQL exclusion constraints, not just application prechecks',async()=>{await expect(verifySchedulingGuards()).resolves.toBeUndefined();});
  it('offers branch-local valid slots and purpose-limited catalog data',async()=>{
    const r=await manager.get('/api/clinic/scheduling/availability').query({branchId:branchA,serviceId:serviceA,employeeId:docId,date});
    expect(r.status).toBe(200);expect(r.body.timeZone).toBe('UTC');expect(r.body.slots[0]).toMatchObject({startsAt:at(),endsAt:at(9,45),roomId:roomA});
    const c=await manager.get('/api/clinic/scheduling/catalog').query({branchId:branchA,serviceId:serviceA});
    expect(c.status).toBe(200);expect(c.body.employees[0]).not.toHaveProperty('passwordHash');expect(c.body.employees[0]).not.toHaveProperty('timeOff');
  });
  it('filters the manager home schedule by the chosen branch',async()=>{const today=new Date().toISOString().slice(0,10);await rawAppointment(docId,roomA,`${today}T09:00:00.000Z`);const selected=await manager.get('/api/clinic/scheduling/home').query({branchId:branchA});expect(selected.status).toBe(200);expect(selected.body.total).toBe(1);const other=await manager.get('/api/clinic/scheduling/home').query({branchId:branchB});expect(other.status).toBe(200);expect(other.body.total).toBe(0);});
  it('creates a pending appointment, room reservation and initial history atomically',async()=>{
    const r=await book();expect(r.status).toBe(201);
    const d=await manager.get(`/api/clinic/appointments/${r.body.id}`);expect(d.status).toBe(200);expect(d.body.status).toBe('pending');expect(d.body.room.id).toBe(roomA);expect(d.body.history).toHaveLength(1);expect(d.body.history[0].fromStatus).toBeNull();
  });
  it('retries a booking without creating a second appointment or history event',async()=>{
    const body=payload();const a=await manager.post('/api/clinic/appointments').send(body);const b=await manager.post('/api/clinic/appointments').send(body);
    expect(a.status).toBe(201);expect(b.status).toBe(201);expect(b.body).toMatchObject({id:a.body.id,replayed:true});expect(await countAppointments()).toBe(1);
    expect((await manager.get(`/api/clinic/appointments/${a.body.id}`)).body.history).toHaveLength(1);
  });
  it('rejects reuse of a command key with different content',async()=>{
    const body=payload();await manager.post('/api/clinic/appointments').send(body);
    const r=await manager.post('/api/clinic/appointments').send({...body,startsAt:at(11)});expect(r.status).toBe(409);expect(r.body.error).toBe('idempotency_mismatch');expect(await countAppointments()).toBe(1);
  });
  it('concurrent API bookings for one employee allow exactly one success',async()=>{
    const responses=await Promise.all([book(),book()]);expect(responses.map((r)=>r.status).sort()).toEqual([201,409]);expect(await countAppointments()).toBe(1);
  });
  it('concurrent API bookings for different employees but one room allow exactly one success',async()=>{
    await db.update(roomsTable).set({status:'maintenance'}).where(eq(roomsTable.id,roomTwo));
    const responses=await Promise.all([book(),book({employeeId:docTwoId})]);expect(responses.map((r)=>r.status).sort()).toEqual([201,409]);expect(await countAppointments()).toBe(1);
  });
  it('database alone rejects employee overlaps on independent connections',async()=>{
    const results=await Promise.allSettled([rawAppointment(docId,roomA),rawAppointment(docId,roomTwo)]);
    expect(results.filter((v)=>v.status==='fulfilled')).toHaveLength(1);
    const failure=results.find((v)=>v.status==='rejected') as PromiseRejectedResult;expect(errorCode(failure.reason)).toBe('23P01');
  });
  it('database alone rejects room overlaps for two different employees',async()=>{
    const results=await Promise.allSettled([rawAppointment(docId,roomA),rawAppointment(docTwoId,roomA)]);
    expect(results.filter((v)=>v.status==='fulfilled')).toHaveLength(1);
    const failure=results.find((v)=>v.status==='rejected') as PromiseRejectedResult;expect(errorCode(failure.reason)).toBe('23P01');
  });
  it('allows back-to-back appointments without treating their boundary as an overlap',async()=>{expect((await book()).status).toBe(201);expect((await book({startsAt:at(9,45)})).status).toBe(201);});
  it('rejects a missing required room even through a direct database insert',async()=>{try{await rawAppointment(docId,null);throw new Error('Expected DB check violation');}catch(e){expect(errorCode(e)).toBe('23514');}});
  it('rejects cross-clinic appointment relationships in the database',async()=>{try{await rawAppointment(docBId,roomA);throw new Error('Expected FK denial');}catch(e){expect(errorCode(e)).toBe('23503');}});
  it('rejects cross-clinic identifiers in every booking relationship',async()=>{
    for(const more of [{branchId:branchB},{serviceId:serviceB},{employeeId:docBId},{customerId:customerB}])expect((await book(more)).status).toBe(404);
    expect(await countAppointments()).toBe(0);
  });
  it('does not trust client clinic ids or caller-selected room overrides',async()=>{expect((await book({clinicId:clinicB})).status).toBe(400);expect((await book({roomId:roomA})).status).toBe(400);});
  it('denies another clinic access to reads, changes, availability exclusion and customer history',async()=>{
    const r=await book(),id=r.body.id;
    expect((await otherClinic.get(`/api/clinic/appointments/${id}`)).status).toBe(404);
    expect((await otherClinic.post(`/api/clinic/appointments/${id}/status`).send({status:'cancelled',expectedVersion:1,reason:'Not allowed',idempotencyKey:randomUUID()})).status).toBe(404);
    expect((await otherClinic.get(`/api/clinic/customers/${customerA}/appointments`)).status).toBe(404);
    expect((await otherClinic.get('/api/clinic/scheduling/availability').query({branchId:branchB,serviceId:serviceB,employeeId:docBId,date,excludeAppointmentId:id})).status).toBe(404);
  });
  it('self-scoped doctors cannot open or list another employee appointment',async()=>{
    const own=await book(),other=await book({employeeId:docTwoId,startsAt:at(11)});
    expect((await doctor.get(`/api/clinic/appointments/${own.body.id}`)).status).toBe(200);
    expect((await doctor.get(`/api/clinic/appointments/${other.body.id}`)).status).toBe(404);
    const list=await doctor.get('/api/clinic/appointments');expect(list.status).toBe(200);expect(list.body.items.map((v:{id:number})=>v.id)).toEqual([own.body.id]);
    expect((await doctor.get('/api/clinic/appointments').query({employeeId:docTwoId})).status).toBe(403);
  });
  it('explicit appointment read access permits another employee read, not write',async()=>{
    const other=await book({employeeId:docTwoId});await db.update(usersTable).set({permissions:['appointments.read','customers.read']}).where(eq(usersTable.id,docId));
    expect((await doctor.get(`/api/clinic/appointments/${other.body.id}`)).status).toBe(200);
    expect((await doctor.post(`/api/clinic/appointments/${other.body.id}/notes`).send({notes:'Forbidden',notesLang:'en',expectedVersion:1,idempotencyKey:randomUUID()})).status).toBe(403);
  });
  it('self-scoped doctors cannot book, confirm or reschedule',async()=>{
    const a=await book();expect((await doctor.post('/api/clinic/appointments').send(payload({startsAt:at(11)}))).status).toBe(403);
    expect((await doctor.post(`/api/clinic/appointments/${a.body.id}/status`).send({status:'confirmed',expectedVersion:1,idempotencyKey:randomUUID()})).status).toBe(403);
    expect((await doctor.post(`/api/clinic/appointments/${a.body.id}/reschedule`).send({employeeId:docId,startsAt:at(11),reason:'Denied',expectedVersion:1,idempotencyKey:randomUUID()})).status).toBe(403);
  });
  it('assigned doctor can start checked-in service and finish with notes exactly once',async()=>{
    const a=await book();expect((await change(a.body.id,'confirmed',1)).status).toBe(200);expect((await change(a.body.id,'checked_in',2)).status).toBe(200);
    expect((await doctor.post(`/api/clinic/appointments/${a.body.id}/status`).send({status:'in_service',expectedVersion:3,idempotencyKey:randomUUID()})).status).toBe(200);
    const body={status:'completed',expectedVersion:4,notes:'Actual service notes',notesLang:'en',idempotencyKey:randomUUID()};
    const done=await doctor.post(`/api/clinic/appointments/${a.body.id}/status`).send(body);const retry=await doctor.post(`/api/clinic/appointments/${a.body.id}/status`).send(body);
    expect(done.status).toBe(200);expect(retry.body.replayed).toBe(true);
    const detail=await doctor.get(`/api/clinic/appointments/${a.body.id}`);expect(detail.body.status).toBe('completed');expect(detail.body.notes).toBe('Actual service notes');expect(detail.body.nextActions).toEqual([]);expect(detail.body.history).toHaveLength(5);
  });
  it('rejects invalid lifecycle jumps without changing history',async()=>{const a=await book();const bad=await change(a.body.id,'completed',1);expect(bad.status).toBe(409);expect(bad.body.error).toBe('invalid_transition');expect((await manager.get(`/api/clinic/appointments/${a.body.id}`)).body.history).toHaveLength(1);});
  it('rejects stale versions rather than overwriting a concurrent update',async()=>{const a=await book();await change(a.body.id,'confirmed',1);const stale=await change(a.body.id,'cancelled',1);expect(stale.status).toBe(409);expect(stale.body.error).toBe('appointment_changed');});
  it('requires cancellation reason and refuses early no-show',async()=>{const a=await book();expect((await change(a.body.id,'cancelled',1,{reason:''})).status).toBe(400);const noShow=await change(a.body.id,'no_show',1);expect(noShow.status).toBe(400);expect(noShow.body.error).toBe('too_early_no_show');});
  it('cancellation releases the slot and repeated cancellation does not touch a replacement',async()=>{
    const a=await book();const body={status:'cancelled',expectedVersion:1,reason:'Customer request',idempotencyKey:randomUUID()};
    expect((await manager.post(`/api/clinic/appointments/${a.body.id}/status`).send(body)).status).toBe(200);
    const replacement=await book();expect(replacement.status).toBe(201);
    expect((await manager.post(`/api/clinic/appointments/${a.body.id}/status`).send(body)).body.replayed).toBe(true);
    expect((await manager.get(`/api/clinic/appointments/${replacement.body.id}`)).body.status).toBe('pending');
  });
  it('rescheduling retains original timing and status history and resets confirmation',async()=>{
    const a=await book();await change(a.body.id,'confirmed',1);
    const body={employeeId:docTwoId,startsAt:at(11),reason:'Requested a later time',expectedVersion:2,idempotencyKey:randomUUID()};
    const moved=await manager.post(`/api/clinic/appointments/${a.body.id}/reschedule`).send(body);expect(moved.status).toBe(200);
    expect((await manager.post(`/api/clinic/appointments/${a.body.id}/reschedule`).send(body)).body.replayed).toBe(true);
    const d=await manager.get(`/api/clinic/appointments/${a.body.id}`);expect(d.body.status).toBe('pending');expect(d.body.startsAt).toBe(at(11));expect(d.body.history).toHaveLength(3);expect(d.body.history[2].before.startsAt).toBe(at());expect(d.body.history[2].fromStatus).toBe('confirmed');
  });
  it('failed rescheduling leaves the original reservation and history untouched',async()=>{
    const a=await book();await book({startsAt:at(11)});
    const r=await manager.post(`/api/clinic/appointments/${a.body.id}/reschedule`).send({employeeId:docId,startsAt:at(11),reason:'Conflicting move',expectedVersion:1,idempotencyKey:randomUUID()});expect(r.status).toBe(409);
    const d=await manager.get(`/api/clinic/appointments/${a.body.id}`);expect(d.body.startsAt).toBe(at());expect(d.body.history).toHaveLength(1);
  });
  it('authorized availability exclusion makes the old reservation selectable during reschedule',async()=>{
    const a=await book();const params={branchId:branchA,serviceId:serviceA,employeeId:docId,date};
    const before=await manager.get('/api/clinic/scheduling/availability').query(params);expect(before.body.slots.some((s:{startsAt:string})=>s.startsAt===at())).toBe(false);
    const edit=await manager.get('/api/clinic/scheduling/availability').query({...params,excludeAppointmentId:a.body.id});expect(edit.body.slots.some((s:{startsAt:string})=>s.startsAt===at())).toBe(true);
  });
  it('availability excludes employee breaks, time off and room maintenance',async()=>{
    const days=Object.fromEntries(Object.keys(week).map((d)=>[d,[{open:'10:00',close:'11:00'}]])) as typeof week;
    await db.update(usersTable).set({breaks:days,timeOff:[{startsAt:at(12),endsAt:at(13),note:''}]}).where(eq(usersTable.id,docId));
    const r=await manager.get('/api/clinic/scheduling/availability').query({branchId:branchA,serviceId:serviceA,employeeId:docId,date});
    expect(r.body.slots.some((s:{startsAt:string})=>s.startsAt===at(10))).toBe(false);expect(r.body.slots.some((s:{startsAt:string})=>s.startsAt===at(12))).toBe(false);
    await db.update(roomsTable).set({status:'maintenance'}).where(inArray(roomsTable.id,[roomA,roomTwo]));
    expect((await manager.get('/api/clinic/scheduling/availability').query({branchId:branchA,serviceId:serviceA,employeeId:docId,date})).body.slots).toEqual([]);
  });
  it('converts branch-local hours to UTC using the branch timezone',async()=>{
    await db.update(branchesTable).set({timeZone:'Asia/Amman'}).where(eq(branchesTable.id,branchA));
    const r=await manager.get('/api/clinic/scheduling/availability').query({branchId:branchA,serviceId:serviceA,employeeId:docId,date});
    const first=r.body.slots[0];expect(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Amman',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(first.startsAt))).toBe('09:00');
  });
  it('restricted notes are absent from a read-only response',async()=>{
    const a=await book(),r=await reader.get(`/api/clinic/appointments/${a.body.id}`);expect(r.status).toBe(200);expect(r.body).not.toHaveProperty('notes');expect(r.body.customerDetails).not.toHaveProperty('sensitiveNotes');expect(r.body.customerDetails.notes).toBe('Permitted customer note');
    expect((await doctor.get(`/api/clinic/appointments/${a.body.id}`)).body.customerDetails).not.toHaveProperty('sensitiveNotes');
  });
  it('customer history remains appointment-scoped for a self-scoped doctor',async()=>{
    const own=await book();await book({employeeId:docTwoId,startsAt:at(11)});
    const h=await doctor.get(`/api/clinic/customers/${customerA}/appointments`);expect(h.status).toBe(200);expect(h.body.items.map((v:{id:number})=>v.id)).toEqual([own.body.id]);
    expect((await forbiddenUser.get(`/api/clinic/customers/${customerA}/appointments`)).status).toBe(403);
  });
  it('idempotent inline customer creation does not duplicate the record',async()=>{
    const body={name:'Inline customer test',nameLang:'en',email:'inline@example.test',phone:null,branchId:branchA,idempotencyKey:randomUUID()};
    const a=await manager.post('/api/clinic/scheduling/customer').send(body),b=await manager.post('/api/clinic/scheduling/customer').send(body);
    expect(a.status).toBe(201);expect(b.body).toMatchObject({id:a.body.id,replayed:true});
  });
  it('the first booking completes the real manager checklist step',async()=>{
    expect((await manager.get('/api/me/clinic')).body.clinic.progress.hasFirstAppointment).toBe(false);await book();expect((await manager.get('/api/me/clinic')).body.clinic.progress.hasFirstAppointment).toBe(true);
  });
  it('list pagination and aggregate calendar counts agree with committed records',async()=>{
    await book();await book({startsAt:at(11)});
    const p=await manager.get('/api/clinic/appointments').query({date,page:1,pageSize:1});expect(p.body.total).toBe(2);expect(p.body.items).toHaveLength(1);
    const counts=await manager.get('/api/clinic/scheduling/calendar').query({date,through:date});expect(counts.status).toBe(200);expect(counts.body.days).toEqual([{date,count:2}]);
  });
});
