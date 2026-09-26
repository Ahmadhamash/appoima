/** Real PostgreSQL/API tests. AI HTTP is stubbed explicitly; no paid/live provider calls.
 * Requires a dedicated disposable migrated database, TEST_DATABASE_DISPOSABLE=1.
 * Synthetic fixtures remain; test accounts are deactivated. Never use production.
 */
import {randomBytes,randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {db,branchesTable,servicesTable,usersTable,customersTable,serviceEmployeesTable,appointmentsTable,auditEventsTable,waitingEntriesTable,waitingOffersTable,inventoryMovementsTable} from '@workspace/db';
import {Fixture,agent,login} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {shiftDate} from '../domain/scheduling-rules';
import {prepareAssistantAction} from '../services/assistant-context';
import {getUserById} from '../services/auth';
const f=new Fixture(),manager=agent(),doctor=agent(),reader=agent(),unprivileged=agent(),owner=agent(),foreign=agent(),forced=agent();
let clinic:number,otherClinic:number,branch:number,otherBranch:number,service:number,customer:number,secondCustomer:number,managerId:number,doctorId:number,readerId:number,otherDoctorId:number,ownId:number,anotherId:number,foreignId:number,cancelledId:number,day:string;
const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d=>[d,[{open:'09:00',close:'17:00'}]])) as Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun',{open:string;close:string}[]>;
const key=()=>randomUUID();
const request=(action='summarize_appointment',appointmentId=ownId)=>({action,language:'en',appointmentId});
const post=(a:ReturnType<typeof agent>,body:unknown)=>a.post('/api/assistant/actions').send(body as object);
async function createActor(role:'manager'|'doctor'|'other_staff'|'platform_owner',clinicId:number|null,permissions:string[],a:ReturnType<typeof agent>,mustChangePassword=false){
 const u=await f.createUser({clinicId,role,permissions,mustChangePassword,password:randomBytes(24).toString('base64url')});expect((await login(a,u.email,u.password)).status).toBe(200);return u.id;
}
async function book(hour:number,employeeId=doctorId) {const r=await manager.post('/api/clinic/appointments').send({branchId:branch,serviceId:service,customerId:customer,employeeId,startsAt:`${day}T${hour}:00:00.000Z`,notes:'PRIVATE_APPOINTMENT_NOTE',notesLang:'en',idempotencyKey:key()});expect(r.status).toBe(201);return r.body.id as number;}
async function generateAgent() {const a=agent();await createActor('manager',clinic,['appointments.manage'],a);return a;}
function enableStub(response:()=>Promise<Response>) {vi.stubEnv('AI_ASSISTANT_ENABLED','true');vi.stubEnv('AI_ASSISTANT_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','synthetic-test-key');vi.stubEnv('AI_ASSISTANT_MODEL','synthetic-test-model');return vi.stubGlobal('fetch',vi.fn(response));}
const output=()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Synthetic verified-contract wording.'}]}],usage:{input_tokens:10,output_tokens:5}}),{status:200});
async function operationalState() {
 const rows=await db.select().from(appointmentsTable).where(eq(appointmentsTable.clinicId,clinic)).orderBy(appointmentsTable.id);
 const waits=await db.select().from(waitingEntriesTable).where(eq(waitingEntriesTable.clinicId,clinic)).orderBy(waitingEntriesTable.id);
 const offers=await db.select().from(waitingOffersTable).where(eq(waitingOffersTable.clinicId,clinic)).orderBy(waitingOffersTable.id);
 const movements=await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.clinicId,clinic)).orderBy(inventoryMovementsTable.id);
 return JSON.stringify({rows,waits,offers,movements});
}
describe('Phase 5 local help and guarded optional assistant',()=>{
 beforeAll(async()=>{
  if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw new Error('Phase 5 requires TEST_DATABASE_DISPOSABLE=1 and a disposable DATABASE_URL.');
  clinic=(await f.createClinic()).id;otherClinic=(await f.createClinic()).id;
  managerId=await createActor('manager',clinic,ROLE_PRESETS.manager,manager);
  doctorId=await createActor('doctor',clinic,ROLE_PRESETS.doctor,doctor);
  otherDoctorId=await createActor('doctor',clinic,ROLE_PRESETS.doctor,agent());
  readerId=await createActor('other_staff',clinic,['appointments.read'],reader);
  await createActor('other_staff',clinic,[],unprivileged);await createActor('platform_owner',null,[],owner);
  const foreignManagerId=await createActor('manager',otherClinic,ROLE_PRESETS.manager,foreign);
  await createActor('other_staff',clinic,['appointments.read'],forced,true);
  branch=(await db.insert(branchesTable).values({clinicId:clinic,name:'Synthetic assistant branch',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
  otherBranch=(await db.insert(branchesTable).values({clinicId:otherClinic,name:'Synthetic foreign branch',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
  await db.update(usersTable).set({branchId:branch,workingHours:week}).where(inArray(usersTable.id,[doctorId,otherDoctorId]));
  service=(await db.insert(servicesTable).values({clinicId:clinic,branchId:branch,name:'PRIVATE_SERVICE_LABEL',durationMinutes:45,price:'25',category:'Skin',requiresRoom:false}).returning())[0]!.id;
  await db.insert(serviceEmployeesTable).values([doctorId,otherDoctorId].map(employeeId=>({clinicId:clinic,serviceId:service,employeeId})));
  customer=(await db.insert(customersTable).values({clinicId:clinic,name:'PRIVATE_CUSTOMER_NAME',email:'private@example.test',phone:'123456789',notes:'PRIVATE_NORMAL_NOTE',sensitiveNotes:'PRIVATE_SENSITIVE_NOTE'}).returning())[0]!.id;
  secondCustomer=(await db.insert(customersTable).values({clinicId:clinic,name:'Synthetic waiting customer',email:'waiting@example.test'}).returning())[0]!.id;
  day=shiftDate(new Date().toISOString().slice(0,10),90);ownId=await book(10);anotherId=await book(13,otherDoctorId);cancelledId=await book(11);
  const w=await manager.post('/api/clinic/waiting-list').send({branchId:branch,customerId:secondCustomer,serviceId:service,preferredEmployeeId:doctorId,preferredDate:day,fromTime:'11:00',toTime:'12:00',idempotencyKey:key()});expect(w.status).toBe(201);
  expect((await manager.post(`/api/clinic/appointments/${cancelledId}/status`).send({status:'cancelled',expectedVersion:1,reason:'Synthetic cancellation',idempotencyKey:key()})).status).toBe(200);
  const otherService=(await db.insert(servicesTable).values({clinicId:otherClinic,branchId:otherBranch,name:'FOREIGN_SERVICE',durationMinutes:45,price:'25',category:'Skin'}).returning())[0]!.id;
  const otherCustomer=(await db.insert(customersTable).values({clinicId:otherClinic,name:'FOREIGN_CUSTOMER',email:'foreign@example.test'}).returning())[0]!.id;
  foreignId=(await db.insert(appointmentsTable).values({clinicId:otherClinic,branchId:otherBranch,customerId:otherCustomer,serviceId:otherService,employeeId:foreignManagerId,createdBy:foreignManagerId,startsAt:new Date(`${day}T14:00:00Z`),endsAt:new Date(`${day}T14:45:00Z`),durationMinutes:45,requiresRoom:false}).returning())[0]!.id;
 });
 beforeEach(()=>{vi.stubEnv('AI_ASSISTANT_ENABLED','false');vi.stubEnv('AI_ASSISTANT_ACTIONS_ENABLED','true');});
 afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();if(readerId)await db.update(usersTable).set({permissions:['appointments.read']}).where(eq(usersTable.id,readerId));});
 afterAll(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();if(f.userIds.length)await db.update(usersTable).set({isActive:false}).where(inArray(usersTable.id,f.userIds));});
 it('requires sign-in',async()=>{expect((await agent().get('/api/assistant/bootstrap?language=en')).status).toBe(401);expect((await post(agent(),request())).status).toBe(401);});
 it('blocks initial-password users',async()=>{expect((await forced.get('/api/assistant/bootstrap?language=en')).status).toBe(403);});
 it('local help needs no AI account and responses are private',async()=>{const r=await manager.get('/api/assistant/bootstrap?language=en');expect(r.status).toBe(200);expect(r.body.provider.state).toBe('disabled');expect(r.headers['cache-control']).toContain('no-store');expect(r.body.actions).toHaveLength(4);});
 it('returns Arabic FAQ answers',async()=>{const r=await manager.post('/api/assistant/help').send({language:'ar',topic:'book'});expect(r.status).toBe(200);expect(r.body.title).toBe('حجز موعد');expect(r.body.source).toBe('local');});
 it('matches local text without a provider call',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=await manager.post('/api/assistant/help').send({language:'en',question:'how to check in'});expect(r.status).toBe(200);expect(r.body.topic).toBe('check_in');expect(fetch).not.toHaveBeenCalled();});
 it('provider role receives assigned-work help without manager setup',async()=>{const r=await doctor.get('/api/assistant/bootstrap?language=en');expect(r.body.actions).toEqual(['summarize_appointment']);expect(r.body.topics.map((t:{id:string})=>t.id)).not.toContain('setup');});
 it('rejects explicitly requested unauthorized FAQ topic',async()=>{expect((await doctor.post('/api/assistant/help').send({language:'en',topic:'setup'})).status).toBe(403);});
 it('owner gets local owner help but no clinic tools',async()=>{const r=await owner.get('/api/assistant/bootstrap?language=en');expect(r.body.actions).toEqual([]);expect(r.body.topics.map((t:{id:string})=>t.id)).toEqual(['navigation','owner']);expect((await post(owner,request())).status).toBe(403);});
 it('unprivileged staff retain help, not operational data',async()=>{expect((await unprivileged.get('/api/assistant/bootstrap?language=en')).status).toBe(200);expect((await post(unprivileged,request())).status).toBe(403);expect((await unprivileged.get('/api/assistant/appointments')).status).toBe(403);});
 it('summary is live operational data without private notes/contacts',async()=>{const r=await post(manager,request());expect(r.status).toBe(200);expect(r.body.appointment.id).toBe(ownId);for(const secret of ['private@example.test','123456789','PRIVATE_NORMAL_NOTE','PRIVATE_SENSITIVE_NOTE','PRIVATE_APPOINTMENT_NOTE'])expect(JSON.stringify(r.body)).not.toContain(secret);expect(r.body.readOnly).toBe(true);});
 it('assigned doctor can summarize own appointment only',async()=>{expect((await post(doctor,request())).status).toBe(200);expect((await post(doctor,request('summarize_appointment',anotherId))).status).toBe(404);});
 it('explicit appointment read can summarize others in same clinic',async()=>{expect((await post(reader,request('summarize_appointment',anotherId))).status).toBe(200);});
 it('cross-clinic appointment is not visible',async()=>{expect((await post(manager,request('summarize_appointment',foreignId))).status).toBe(404);expect((await post(foreign,request())).status).toBe(404);});
 it('choices contain only assigned appointments for a doctor',async()=>{const r=await doctor.get('/api/assistant/appointments');expect(r.status).toBe(200);expect(r.body.items.every((a:{employee:{id:number}})=>a.employee.id===doctorId)).toBe(true);});
 it('choices reject caller clinic override and invalid date/page',async()=>{for(const q of [`clinicId=${otherClinic}`,'date=2026-02-30','page=0'])expect((await manager.get(`/api/assistant/appointments?${q}`)).status).toBe(400);});
 it('checks permission again after access is revoked',async()=>{await db.update(usersTable).set({permissions:[]}).where(eq(usersTable.id,readerId));expect((await post(reader,request())).status).toBe(403);});
 it('reader cannot request slots, replies or waiting explanations',async()=>{for(const action of ['draft_reply','explain_waiting'])expect((await post(reader,request(action))).status).toBe(403);expect((await post(reader,{action:'suggest_slots',language:'en',branchId:branch,serviceId:service,employeeId:doctorId,date:day})).status).toBe(403);});
 it('slots reuse schedules and are capped at eight',async()=>{const r=await post(manager,{action:'suggest_slots',language:'en',branchId:branch,serviceId:service,employeeId:doctorId,date:day});expect(r.status).toBe(200);expect(r.body.slots.length).toBeGreaterThan(0);expect(r.body.slots.length).toBeLessThanOrEqual(8);expect(r.body.timeZone).toBe('UTC');expect(r.body.slots.some((s:{startsAt:string})=>s.startsAt===`${day}T10:00:00.000Z`)).toBe(false);});
 it('slots reject a foreign branch',async()=>{expect((await post(manager,{action:'suggest_slots',language:'en',branchId:otherBranch,serviceId:service,employeeId:doctorId,date:day})).status).toBe(404);});
 it('pending reply is a draft rather than false confirmation',async()=>{const r=await post(manager,request('draft_reply'));expect(r.status).toBe(200);expect(r.body.text).toContain('pending confirmation');expect(r.body.generation).toBeUndefined();});
 it('explains recorded waiting offer without refreshing or booking',async()=>{const before=await operationalState(),r=await post(manager,request('explain_waiting',cancelledId));expect(r.status).toBe(200);expect(r.body.waiting.status).toBe('offered');expect(r.body.text).toContain('has not rechecked');expect(await operationalState()).toBe(before);});
 it('waiting explanation rejects non-cancelled source',async()=>{expect((await post(manager,request('explain_waiting'))).status).toBe(400);});
 it('no mutation action, confirmation, SQL or tools can be smuggled into input',async()=>{const before=await operationalState();for(const body of [request('book'),request('cancel'),request('reschedule'),request('send_message'),{...request(),confirmed:true},{...request(),clinicId:otherClinic},{...request(),sql:'DROP TABLE appointments'},{...request(),tools:[]}])expect((await post(manager,body)).status).toBe(400);expect(await operationalState()).toBe(before);});
 it('assistant has no confirmation/write endpoint',async()=>{for(const p of ['confirm','book','send','cancel'])expect((await manager.post(`/api/assistant/${p}`).send({confirmed:true,appointmentId:ownId})).status).toBe(404);});
 it('malformed and oversized questions fail',async()=>{for(const body of [{language:'en',question:'x'.repeat(601)},{language:'en',question:'hi',topic:'book'},{language:'en'},{language:'fr',topic:'book'}])expect((await manager.post('/api/assistant/help').send(body)).status).toBe(400);});
 it('disabled provider returns clear unavailable and makes no HTTP call',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=await manager.post('/api/assistant/generate').send({consent:true,request:request()});expect(r.status).toBe(503);expect(r.body.error).toBe('assistant_unavailable');expect(fetch).not.toHaveBeenCalled();});
 it('provider consent is mandatory and not coerced',async()=>{for(const consent of [false,undefined,'true'])expect((await manager.post('/api/assistant/generate').send({consent,request:request()})).status).toBe(400);});
 it('disabled provider path still denies underlying forbidden actions',async()=>{expect((await reader.post('/api/assistant/generate').send({consent:true,request:request('draft_reply')})).status).toBe(403);});
 it('actions flag blocks local tools but never disables help',async()=>{vi.stubEnv('AI_ASSISTANT_ACTIONS_ENABLED','false');expect((await post(manager,request())).status).toBe(403);expect((await manager.post('/api/assistant/help').send({language:'en',topic:'navigation'})).status).toBe(200);});
 it('records failed and successful audit metadata, not chat contents',async()=>{await manager.post('/api/assistant/help').send({language:'en',question:'PRIVATE_CHAT_TOKEN'});await post(manager,{...request(),sql:'PRIVATE_SQL_TOKEN'});const events=await db.select().from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinic),sql`${auditEventsTable.action} like 'assistant.%'`));expect(events.some(e=>e.action==='assistant.failed')).toBe(true);expect(events.some(e=>e.action==='assistant.completed')).toBe(true);expect(JSON.stringify(events)).not.toContain('PRIVATE_CHAT_TOKEN');expect(JSON.stringify(events)).not.toContain('PRIVATE_SQL_TOKEN');});
 it('external packet removes identity, clinical and free-text fields',async()=>{const actor=await getUserById(managerId);const snapshot=await prepareAssistantAction(actor!,request());const text=JSON.stringify(snapshot.packet);for(const value of ['PRIVATE_CUSTOMER_NAME','PRIVATE_SERVICE_LABEL','PRIVATE_APPOINTMENT_NOTE','PRIVATE_NORMAL_NOTE','PRIVATE_SENSITIVE_NOTE','private@example.test'])expect(text).not.toContain(value);});
 it('configured adapter labels configuration as unverified',async()=>{enableStub(async()=>output());const r=await manager.get('/api/assistant/bootstrap?language=en');expect(r.body.provider.state).toBe('configured_not_verified');expect(fetch).not.toHaveBeenCalled();});
 it('stubbed successful AI call returns reviewed wording and token metadata without writes',async()=>{enableStub(async()=>output());const a=await generateAgent(),before=await operationalState();const r=await a.post('/api/assistant/generate').send({consent:true,request:request()});expect(r.status).toBe(200);expect(r.body.generation.reviewRequired).toBe(true);expect(r.body.generation.usage).toEqual({inputTokens:10,outputTokens:5});expect(await operationalState()).toBe(before);});
 it('stubbed provider failure is sanitized and audited',async()=>{enableStub(async()=>new Response('PROVIDER_SECRET_ERROR',{status:500}));const a=await generateAgent(),r=await a.post('/api/assistant/generate').send({consent:true,request:request()});expect(r.status).toBe(503);expect(JSON.stringify(r.body)).not.toContain('PROVIDER_SECRET_ERROR');const events=await db.select().from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinic),eq(auditEventsTable.action,'assistant.provider_failed')));expect(events.length).toBeGreaterThan(0);});
 it('model-supplied function calls cannot mutate data',async()=>{enableStub(async()=>new Response(JSON.stringify({status:'completed',output:[{type:'function_call',name:'cancel_appointment',arguments:JSON.stringify({appointmentId:ownId})}]})));const a=await generateAgent(),before=await operationalState();const r=await a.post('/api/assistant/generate').send({consent:true,request:request()});expect(r.status).toBe(503);expect(await operationalState()).toBe(before);});
 it('permission revocation during provider latency suppresses generated output',async()=>{const a=agent(),id=await createActor('manager',clinic,['appointments.manage'],a);enableStub(async()=>{await db.update(usersTable).set({permissions:[]}).where(eq(usersTable.id,id));return output();});const r=await a.post('/api/assistant/generate').send({consent:true,request:request()});expect(r.status).toBe(403);expect(r.body.generation).toBeUndefined();});
 it('record change during provider latency rejects stale generated output',async()=>{enableStub(async()=>{await db.update(appointmentsTable).set({version:sql`${appointmentsTable.version}+1`}).where(eq(appointmentsTable.id,ownId));return output();});const a=await generateAgent(),r=await a.post('/api/assistant/generate').send({consent:true,request:request()});expect(r.status).toBe(409);expect(r.body.error).toBe('assistant_context_changed');expect(r.body.generation).toBeUndefined();});
});
