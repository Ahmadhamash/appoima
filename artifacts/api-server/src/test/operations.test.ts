/** Phase 4 REAL PostgreSQL/API acceptance tests, not mocks.
 * Requires all four migrations + guards and TEST_DATABASE_DISPOSABLE=1.
 * Append-only ledger fixtures are retained by design. Test accounts are deactivated afterwards.
 * Use a dedicated disposable DATABASE, then destroy that database outside the application.
 */
import {randomBytes,randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {db,branchesTable,usersTable,servicesTable,serviceEmployeesTable,customersTable,appointmentsTable,auditEventsTable,
  inventoryItemsTable,inventoryMovementsTable,inventoryConsumptionsTable,waitingEntriesTable,waitingOffersTable} from '@workspace/db';
import {Fixture,agent,login} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {shiftDate} from '../domain/scheduling-rules';
import {verifySchedulingGuards} from '../services/scheduling';
import {verifyInventoryGuards} from '../services/inventory';
const f=new Fixture(),manager=agent(),provider=agent(),other=agent(),reader=agent(),stockClerk=agent(),broaderReader=agent();
let clinic:number,foreignClinic:number,branch:number,branchTwo:number,foreignBranch:number,managerId:number,providerId:number,otherProviderId:number,
  service:number,customer:number,customerTwo:number,foreignCustomer:number,day:string,caseNumber=0;
const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d=>[d,[{open:'09:00',close:'17:00'}]])) as Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun',{open:string;close:string}[]>;
const at=(h=10,m=0)=>`${day}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00.000Z`;
const key=()=>randomUUID();
const code=(e:unknown)=>{const x=e as {code?:string;cause?:{code?:string}};return x.code??x.cause?.code;};
async function createActor(clinicId:number,role:'manager'|'doctor'|'other_staff',permissions:string[],a:ReturnType<typeof agent>){
  const u=await f.createUser({clinicId,role,permissions,password:randomBytes(24).toString('base64url')});expect((await login(a,u.email,u.password)).status).toBe(200);return u.id;
}
const book=(more:Record<string,unknown>={})=>manager.post('/api/clinic/appointments').send({branchId:branch,customerId:customer,serviceId:service,employeeId:providerId,startsAt:at(),idempotencyKey:key(),...more});
const detail=(id:number)=>manager.get(`/api/clinic/appointments/${id}`);
async function change(id:number,status:string,more:Record<string,unknown>={}){
  const a=await detail(id);return manager.post(`/api/clinic/appointments/${id}/status`).send({status,expectedVersion:a.body.version,reason:'Synthetic acceptance decision',idempotencyKey:key(),...more});
}
async function inService(){const r=await book();expect(r.status).toBe(201);for(const target of ['confirmed','checked_in','in_service'])expect((await change(r.body.id,target)).status).toBe(200);return r.body.id as number;}
const wait=(more:Record<string,unknown>={})=>manager.post('/api/clinic/waiting-list').send({branchId:branch,customerId:customerTwo,serviceId:service,preferredEmployeeId:providerId,preferredDate:day,fromTime:'09:00',toTime:'12:00',note:'Synthetic waiting request',noteLang:'en',idempotencyKey:key(),...more});
async function cancelled(){const r=await book();expect(r.status).toBe(201);expect((await change(r.body.id,'cancelled')).status).toBe(200);return r.body.id as number;}
async function suggestion(id:number){const r=await manager.get(`/api/clinic/appointments/${id}/replacement`);expect(r.status).toBe(200);return r.body.suggestion;}
const confirm=(id:number,body:Record<string,unknown>={})=>manager.post(`/api/clinic/waiting-list/offers/${id}/confirm`).send({confirmed:true,idempotencyKey:key(),...body});
async function createItem(more:Record<string,unknown>={}){const r=await manager.post('/api/clinic/inventory/items').send({branchId:branch,name:`Synthetic item ${key()}`,nameLang:'en',unit:'ml',idempotencyKey:key(),...more});expect(r.status).toBe(201);return r.body.id as number;}
const movement=(id:number,more:Record<string,unknown>={})=>manager.post(`/api/clinic/inventory/items/${id}/movements`).send({kind:'receipt',quantity:'10.000',reason:'Synthetic stock receipt',reasonLang:'en',idempotencyKey:key(),...more});
const stock=(id:number)=>manager.get(`/api/clinic/inventory/items/${id}`);
const materials=(itemId:number,quantity='2.500')=>({items:[{itemId,quantity}],confirmNoItems:false});
const consume=(appointmentId:number,itemId:number,more:Record<string,unknown>={})=>manager.post(`/api/clinic/appointments/${appointmentId}/consumption`).send({consumption:materials(itemId),idempotencyKey:key(),...more});
async function activeCount(){const result=await db.select({n:sql<number>`count(*)::int`}).from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,clinic),eq(appointmentsTable.serviceId,service),sql`${appointmentsTable.status} <> 'cancelled'`));return result[0]!.n;}
async function audit(action:string,entityId:number){return db.select().from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinic),eq(auditEventsTable.action,action),eq(auditEventsTable.entityId,entityId)));}
describe('Phase 4 waiting list and append-only inventory',()=>{
  beforeAll(async()=>{
    if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw new Error('Phase 4 keeps immutable synthetic ledgers. Set TEST_DATABASE_DISPOSABLE=1 only for a dedicated disposable DATABASE_URL.');
    await verifySchedulingGuards();await verifyInventoryGuards();
    clinic=(await f.createClinic('Synthetic Phase 4 operations')).id;foreignClinic=(await f.createClinic('Synthetic other tenant')).id;
    managerId=await createActor(clinic,'manager',ROLE_PRESETS.manager,manager);
    providerId=await createActor(clinic,'doctor',['customers.read','inventory.manage'],provider);
    otherProviderId=await createActor(clinic,'doctor',['appointments.read','inventory.manage'],broaderReader);
    await createActor(clinic,'other_staff',['appointments.read','inventory.read','services.read'],reader);
    await createActor(clinic,'other_staff',['inventory.manage'],stockClerk);
    await createActor(foreignClinic,'manager',ROLE_PRESETS.manager,other);
    branch=(await db.insert(branchesTable).values({clinicId:clinic,name:'Synthetic UTC branch',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
    branchTwo=(await db.insert(branchesTable).values({clinicId:clinic,name:'Synthetic second branch',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
    foreignBranch=(await db.insert(branchesTable).values({clinicId:foreignClinic,name:'Synthetic foreign branch',timeZone:'UTC',openingHours:week}).returning())[0]!.id;
    foreignCustomer=(await db.insert(customersTable).values({clinicId:foreignClinic,name:'Synthetic foreign customer',email:'foreign@example.test'}).returning())[0]!.id;
    await db.update(usersTable).set({branchId:branch,workingHours:week}).where(inArray(usersTable.id,[providerId,otherProviderId]));
  });
  beforeEach(async()=>{
    day=shiftDate(new Date().toISOString().slice(0,10),7+(caseNumber++));
    service=(await db.insert(servicesTable).values({clinicId:clinic,branchId:branch,name:`Synthetic service ${caseNumber}`,durationMinutes:45,price:'25',category:'Skin',requiresRoom:false}).returning())[0]!.id;
    await db.insert(serviceEmployeesTable).values([providerId,otherProviderId].map(employeeId=>({clinicId:clinic,serviceId:service,employeeId})));
    customer=(await db.insert(customersTable).values({clinicId:clinic,name:`Synthetic booking ${caseNumber}`,email:`a${caseNumber}@example.test`}).returning())[0]!.id;
    customerTwo=(await db.insert(customersTable).values({clinicId:clinic,name:`Synthetic waiting ${caseNumber}`,email:`b${caseNumber}@example.test`}).returning())[0]!.id;
    await db.update(usersTable).set({permissions:['customers.read','inventory.manage']}).where(eq(usersTable.id,providerId));
  });
  afterAll(async()=>{if(f.userIds.length)await db.update(usersTable).set({isActive:false}).where(inArray(usersTable.id,f.userIds));/* Do NOT bypass immutable guards to clean fixtures. */});
  it('requires the live inventory triggers, not only table names',async()=>{await expect(verifyInventoryGuards()).resolves.toBeUndefined();});
  it('cancellation suggests FIFO-compatible entry but does not book it',async()=>{
    const first=await wait(),second=await wait({preferredEmployeeId:null});expect(first.status).toBe(201);expect(second.status).toBe(201);
    const id=await cancelled(),s=await suggestion(id);expect(s.entry.id).toBe(first.body.id);expect(s.offer.status).toBe('offered');expect(await activeCount()).toBe(0);
    expect((await audit('waiting_list.suggested',first.body.id)).length).toBe(1);
  });
  it('does not suggest an earlier request outside the requested time window',async()=>{
    await wait({fromTime:'13:00',toTime:'16:00'});const fits=await wait();const s=await suggestion(await cancelled());expect(s.entry.id).toBe(fits.body.id);
  });
  it('does not suggest a request for another preferred provider',async()=>{await wait({preferredEmployeeId:otherProviderId});const fits=await wait({preferredEmployeeId:null});expect((await suggestion(await cancelled())).entry.id).toBe(fits.body.id);});
  it('rejects a waiting window shorter than the service',async()=>{expect((await wait({fromTime:'10:00',toTime:'10:30'})).status).toBe(400);});
  it('prevents duplicate active requests and supports transport replay',async()=>{
    const idempotencyKey=key(),first=await wait({idempotencyKey}),retry=await wait({idempotencyKey});expect(retry.body).toMatchObject({id:first.body.id,replayed:true});expect((await wait()).status).toBe(409);
  });
  it('requires an explicit confirmed true payload',async()=>{await wait();const s=await suggestion(await cancelled());expect((await confirm(s.offer.id,{confirmed:false})).status).toBe(400);expect(await activeCount()).toBe(0);});
  it('confirmation creates one confirmed replacement and audit/history',async()=>{
    const entry=await wait(),id=await cancelled(),s=await suggestion(id),body={idempotencyKey:key()};const r=await confirm(s.offer.id,body),retry=await confirm(s.offer.id,body);
    expect(r.status).toBe(200);expect(retry.body).toMatchObject({id:r.body.id,replayed:true});expect(await activeCount()).toBe(1);
    const a=await detail(r.body.id);expect(a.body).toMatchObject({status:'confirmed',customerId:customerTwo,startsAt:at()});expect(a.body.history).toHaveLength(1);
    expect((await audit('waiting_list.replacement_confirmed',entry.body.id)).length).toBe(1);expect((await suggestion(id)).offer.status).toBe('booked');
  });
  it('two concurrent replacement confirmations produce only one booking',async()=>{
    await wait();const s=await suggestion(await cancelled());const responses=await Promise.all([confirm(s.offer.id),confirm(s.offer.id)]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect(await activeCount()).toBe(1);
  });
  it('stale slot confirmation fails cleanly and persists unavailable decision',async()=>{
    await wait();const id=await cancelled(),s=await suggestion(id);expect((await book()).status).toBe(201);
    const r=await confirm(s.offer.id);expect(r.status).toBe(409);expect(r.body.error).toBe('waiting_offer_changed');expect(await activeCount()).toBe(1);
    const [offer]=await db.select().from(waitingOffersTable).where(eq(waitingOffersTable.id,s.offer.id));expect(offer!.status).toBe('unavailable');expect((await suggestion(id))).toBeNull();
    expect((await audit('waiting_list.offer_unavailable',s.entry.id)).length).toBe(1);
  });
  it('declining an offer immediately suggests the next compatible request',async()=>{
    const first=await wait(),next=await wait({preferredEmployeeId:null}),id=await cancelled(),s=await suggestion(id);
    const r=await manager.post(`/api/clinic/waiting-list/${first.body.id}/decline`).send({expectedVersion:s.entry.version,reason:'Synthetic decline',idempotencyKey:key()});expect(r.status).toBe(200);
    expect((await suggestion(id)).entry.id).toBe(next.body.id);expect(await activeCount()).toBe(0);
  });
  it('changed service duration invalidates an offer and advances the queue when possible',async()=>{
    await wait();const id=await cancelled(),s=await suggestion(id);await db.update(servicesTable).set({durationMinutes:60}).where(eq(servicesTable.id,service));
    const r=await confirm(s.offer.id);expect(r.status).toBe(409);expect(r.body.error).toBe('waiting_offer_changed');expect(await activeCount()).toBe(0);
  });
  it('read-only staff cannot create, decline, refresh or confirm waiting records',async()=>{
    const w=await wait(),s=await suggestion(await cancelled());expect((await reader.post('/api/clinic/waiting-list/refresh').send({idempotencyKey:key()})).status).toBe(403);
    expect((await reader.post('/api/clinic/waiting-list').send({branchId:branch,customerId:customerTwo,serviceId:service,preferredDate:day,idempotencyKey:key()})).status).toBe(403);
    expect((await reader.post(`/api/clinic/waiting-list/${w.body.id}/decline`).send({expectedVersion:s.entry.version,reason:'Test',idempotencyKey:key()})).status).toBe(403);
    expect((await reader.post(`/api/clinic/waiting-list/offers/${s.offer.id}/confirm`).send({confirmed:true,idempotencyKey:key()})).status).toBe(403);
  });
  it('cross-clinic waiting entry, offer, source and customer references are denied',async()=>{
    const w=await wait(),id=await cancelled(),s=await suggestion(id);expect((await wait({customerId:foreignCustomer})).status).toBe(404);
    expect((await other.get(`/api/clinic/appointments/${id}/replacement`)).status).toBe(404);
    expect((await other.post(`/api/clinic/waiting-list/${w.body.id}/decline`).send({expectedVersion:s.entry.version,reason:'Test',idempotencyKey:key()})).status).toBe(404);
    expect((await other.post(`/api/clinic/waiting-list/offers/${s.offer.id}/confirm`).send({confirmed:true,idempotencyKey:key()})).status).toBe(404);
  });
  it('inventory item starts at zero and cannot accept a directly supplied balance',async()=>{
    const id=await createItem();expect(Number((await stock(id)).body.balance)).toBe(0);
    expect((await manager.post('/api/clinic/inventory/items').send({name:'Invalid',nameLang:'en',branchId:branch,unit:'ml',balance:100,idempotencyKey:key()})).status).toBe(400);
  });
  it('receipt retries add stock exactly once',async()=>{const id=await createItem(),idempotencyKey=key();const a=await movement(id,{idempotencyKey}),b=await movement(id,{idempotencyKey});expect(a.status).toBe(201);expect(b.body).toMatchObject({id:a.body.id,replayed:true});expect(Number((await stock(id)).body.balance)).toBe(10);expect((await stock(id)).body.movements).toHaveLength(1);});
  it('adjustments require a reason and cannot drive stock negative',async()=>{
    const id=await createItem();await movement(id);expect((await movement(id,{kind:'adjustment',quantity:'-1',reason:''})).status).toBe(400);
    expect((await movement(id,{kind:'adjustment',quantity:'-11'})).status).toBe(409);expect((await movement(id,{kind:'adjustment',quantity:'-0.125'})).status).toBe(201);expect((await stock(id)).body.balance).toBe('9.875');
  });
  it('receipt rejects negative, zero, exponent and overprecision quantities',async()=>{const id=await createItem();for(const quantity of ['-1','0','1e2','0.0001'])expect((await movement(id,{quantity})).status).toBe(400);});
  it('two competing stock adjustments cannot make a negative balance',async()=>{
    const id=await createItem();await movement(id,{quantity:'1'});const r=await Promise.all([movement(id,{kind:'adjustment',quantity:'-0.750'}),movement(id,{kind:'adjustment',quantity:'-0.750'})]);expect(r.map(x=>x.status).sort()).toEqual([201,409]);expect((await stock(id)).body.balance).toBe('0.250');
  });
  it('inventory read-only users can read but cannot receive stock',async()=>{const id=await createItem();expect((await reader.get(`/api/clinic/inventory/items/${id}`)).status).toBe(200);expect((await reader.post(`/api/clinic/inventory/items/${id}/movements`).send({kind:'receipt',quantity:'1',idempotencyKey:key()})).status).toBe(403);});
  it('cross-tenant inventory item reads, movements and branch creation are denied',async()=>{
    const id=await createItem();expect((await other.get(`/api/clinic/inventory/items/${id}`)).status).toBe(404);
    expect((await other.post(`/api/clinic/inventory/items/${id}/movements`).send({kind:'receipt',quantity:'1',idempotencyKey:key()})).status).toBe(404);
    expect((await manager.post('/api/clinic/inventory/items').send({branchId:foreignBranch,name:'Cross tenant',nameLang:'en',unit:'ml',idempotencyKey:key()})).status).toBe(400);
    const appointmentId=await inService();expect((await other.get(`/api/clinic/appointments/${appointmentId}/consumption`)).status).toBe(404);
    expect((await other.post(`/api/clinic/appointments/${appointmentId}/consumption`).send({consumption:materials(id),idempotencyKey:key()})).status).toBe(404);
    expect((await other.get(`/api/clinic/services/${service}/actual-use`)).status).toBe(404);
  });
  it('completion records actual materials and retries without a second deduction',async()=>{
    const id=await inService(),item=await createItem();await movement(item);const current=await detail(id),body={status:'completed',consumptionApproved:true,expectedVersion:current.body.version,consumption:materials(item),idempotencyKey:key()};
    const first=await provider.post(`/api/clinic/appointments/${id}/status`).send(body),retry=await provider.post(`/api/clinic/appointments/${id}/status`).send(body);
    expect(first.status).toBe(200);expect(retry.body.replayed).toBe(true);expect((await detail(id)).body.status).toBe('completed');expect((await stock(item)).body.balance).toBe('7.500');
    expect((await provider.get(`/api/clinic/appointments/${id}/consumption`)).body).toMatchObject({recorded:true,canRecord:false,lines:[{id:item,quantity:'2.500',unit:'ml'}]});
  });
  it('concurrent duplicate completion requests deduct once',async()=>{
    const id=await inService(),item=await createItem();await movement(item);const a=await detail(id),body={status:'completed',consumptionApproved:true,expectedVersion:a.body.version,consumption:materials(item),idempotencyKey:key()};
    const results=await Promise.all([provider.post(`/api/clinic/appointments/${id}/status`).send(body),provider.post(`/api/clinic/appointments/${id}/status`).send(body)]);expect(results.map(r=>r.status)).toEqual([200,200]);expect((await stock(item)).body.balance).toBe('7.500');
  });
  it('insufficient stock rolls back completion status, history and all material lines',async()=>{
    const id=await inService(),first=await createItem(),second=await createItem();await movement(first);const before=await detail(id);
    const r=await change(id,'completed',{consumption:{items:[{itemId:first,quantity:'1'},{itemId:second,quantity:'1'}],confirmNoItems:false}});expect(r.status).toBe(409);expect(r.body.error).toBe('insufficient_stock');
    const after=await detail(id);expect(after.body.status).toBe('in_service');expect(after.body.history).toHaveLength(before.body.history.length);expect((await stock(first)).body.balance).toBe('10.000');expect((await manager.get(`/api/clinic/appointments/${id}/consumption`)).body.recorded).toBe(false);
  });
  it('rejects actual consumption from a different branch and rolls back completion',async()=>{
    const id=await inService(),item=await createItem({branchId:branchTwo});await movement(item);const r=await change(id,'completed',{consumption:materials(item)});expect(r.status).toBe(400);expect(r.body.error).toBe('inventory_branch_mismatch');expect((await detail(id)).body.status).toBe('in_service');
  });
  it('completion without materials remains unrecorded, never silently zero actual use',async()=>{const id=await inService();expect((await change(id,'completed')).status).toBe(200);expect((await manager.get(`/api/clinic/appointments/${id}/consumption`)).body).toMatchObject({recorded:false,canRecord:true});});
  it('explicit no-materials completion creates an immutable zero-line record',async()=>{
    const id=await inService();expect((await change(id,'completed',{consumption:{items:[],confirmNoItems:true}})).status).toBe(200);expect((await manager.get(`/api/clinic/appointments/${id}/consumption`)).body).toMatchObject({recorded:true,lines:[],canRecord:false});
  });
  it('post-completion semantic retry with a different key also deducts once',async()=>{
    const id=await inService(),item=await createItem();await movement(item);await change(id,'completed');expect((await consume(id,item)).status).toBe(200);expect((await consume(id,item,{consumption:materials(item,'2.5')})).status).toBe(200);expect((await stock(item)).body.balance).toBe('7.500');
  });
  it('changed actual quantities cannot rewrite a submitted consumption record',async()=>{
    const id=await inService(),item=await createItem();await movement(item);await change(id,'completed');await consume(id,item);const r=await consume(id,item,{consumption:materials(item,'3')});expect(r.status).toBe(409);expect(r.body.error).toBe('consumption_locked');expect((await stock(item)).body.balance).toBe('7.500');
  });
  it('rejects pre-completion use and duplicate item lines',async()=>{
    const id=await inService(),item=await createItem();await movement(item);expect((await consume(id,item)).status).toBe(409);
    expect((await change(id,'completed',{consumption:{items:[{itemId:item,quantity:'1'},{itemId:item,quantity:'2'}],confirmNoItems:false}})).status).toBe(400);
  });
  it('unassigned provider with global read cannot record someone else actual use',async()=>{
    const id=await inService(),item=await createItem();await movement(item);await change(id,'completed');expect((await broaderReader.post(`/api/clinic/appointments/${id}/consumption`).send({consumption:materials(item),idempotencyKey:key()})).status).toBe(403);
  });
  it('revoked stock permission is rechecked before replaying a prior successful completion',async()=>{
    const id=await inService(),item=await createItem();await movement(item);const a=await detail(id),body={status:'completed',consumptionApproved:true,expectedVersion:a.body.version,consumption:materials(item),idempotencyKey:key()};
    expect((await provider.post(`/api/clinic/appointments/${id}/status`).send(body)).status).toBe(200);await db.update(usersTable).set({permissions:['customers.read']}).where(eq(usersTable.id,providerId));expect((await provider.post(`/api/clinic/appointments/${id}/status`).send(body)).status).toBe(403);
  });
  it('service totals keep distinct item units and exclude receipts/adjustments',async()=>{
    const id=await inService(),ml=await createItem(),piece=await createItem({unit:'piece'});await movement(ml);await movement(piece);await movement(ml,{kind:'adjustment',quantity:'1'});
    await change(id,'completed',{consumption:{items:[{itemId:ml,quantity:'1.125'},{itemId:piece,quantity:'2'}],confirmNoItems:false}});
    const r=await reader.get(`/api/clinic/services/${service}/actual-use`);expect(r.status).toBe(200);expect(r.body.items).toHaveLength(2);expect(r.body.items).toEqual(expect.arrayContaining([expect.objectContaining({id:ml,unit:'ml',quantity:'1.125'}),expect.objectContaining({id:piece,unit:'piece',quantity:'2.000'})]));expect(r.body.items[0]).not.toHaveProperty('customerId');
  });
  it('movement history hides appointment navigation from inventory-only staff',async()=>{
    const id=await inService(),item=await createItem();await movement(item);await change(id,'completed',{consumption:materials(item)});const r=await stockClerk.get(`/api/clinic/inventory/items/${item}`);expect(r.status).toBe(200);expect(r.body.movements.every((m:{canOpenAppointment:boolean})=>!m.canOpenAppointment)).toBe(true);
  });
  it('no API update/delete endpoints can mutate ledger history',async()=>{
    const item=await createItem(),r=await movement(item);expect((await manager.patch(`/api/clinic/inventory/movements/${r.body.id}`).send({quantity:'999'})).status).toBe(404);expect((await manager.delete(`/api/clinic/inventory/movements/${r.body.id}`)).status).toBe(404);expect((await stock(item)).body.balance).toBe('10.000');
  });
  it('PostgreSQL itself rejects UPDATE, DELETE and TRUNCATE of inventory movements',async()=>{
    const item=await createItem();await movement(item);
    for(const [index,q] of [sql`update inventory_movements set quantity=quantity where clinic_id=${clinic} and item_id=${item}`,sql`delete from inventory_movements where clinic_id=${clinic} and item_id=${item}`,sql`truncate inventory_movements`].entries()){
      const error=await db.execute(q).then(()=>null,e=>e);if(index===2)expect(['55000','0A000']).toContain(code(error));else expect(code(error)).toBe('55000');
    }
    expect((await stock(item)).body.balance).toBe('10.000');
  });
  it('PostgreSQL itself refuses changed unit identity and negative balances',async()=>{
    const item=await createItem();await movement(item);
    expect(code(await db.update(inventoryItemsTable).set({unit:'piece'}).where(eq(inventoryItemsTable.id,item)).then(()=>null,e=>e))).toBe('55000');
    const err=await db.insert(inventoryMovementsTable).values({clinicId:clinic,branchId:branch,itemId:item,unit:'ml',kind:'adjustment',quantity:'-11',actorId:managerId,reason:'Synthetic direct guard check'}).then(()=>null,e=>e);expect(code(err)).toBe('23514');
  });
  it('PostgreSQL blocks header rewrites and any later extra consumption line',async()=>{
    const id=await inService(),first=await createItem(),second=await createItem();await movement(first);await movement(second);await change(id,'completed',{consumption:materials(first)});
    const [header]=await db.select().from(inventoryConsumptionsTable).where(eq(inventoryConsumptionsTable.appointmentId,id));
    expect(code(await db.update(inventoryConsumptionsTable).set({lineCount:2}).where(eq(inventoryConsumptionsTable.id,header!.id)).then(()=>null,e=>e))).toBe('55000');
    const err=await db.insert(inventoryMovementsTable).values({clinicId:clinic,branchId:branch,itemId:second,unit:'ml',kind:'consumption',quantity:'-1',actorId:managerId,consumptionId:header!.id,appointmentId:id,serviceId:service}).then(()=>null,e=>e);expect(code(err)).toBe('23514');expect((await stock(second)).body.balance).toBe('10.000');
  });
  it('PostgreSQL rejects a header with missing promised material lines',async()=>{
    const id=await inService();const contextError=await db.insert(inventoryConsumptionsTable).values({clinicId:clinic,branchId:branch,appointmentId:id,serviceId:service,actorId:managerId,payloadHash:'synthetic-context-test',lineCount:0}).then(()=>null,e=>e);expect(code(contextError)).toBe('23514');
    await change(id,'completed');const err=await db.insert(inventoryConsumptionsTable).values({clinicId:clinic,branchId:branch,appointmentId:id,serviceId:service,actorId:managerId,payloadHash:'synthetic-guard-test',lineCount:1}).then(()=>null,e=>e);expect(code(err)).toBe('23514');
  });
});
