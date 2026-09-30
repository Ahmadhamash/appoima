import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {eq,inArray} from 'drizzle-orm';
import {db,branchesTable,servicesTable,usersTable,customersTable,serviceEmployeesTable,appointmentsTable,type WeeklyHours} from '@workspace/db';
import {Fixture,agent,login} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {productCharge,paymentSummary} from '../domain/patient-billing';

const f=new Fixture(),manager=agent(),doctor=agent(),otherDoctor=agent(),secretary=agent(),outsider=agent(),key=()=>randomUUID();
const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{open:'00:00',close:'23:59'}]])) as WeeklyHours;
let clinicId:number,branchId:number,foreignBranch:number,serviceId:number,employeeId:number,customerId:number,fillerId:number,gloveId:number,sequence=0;
const supplier={supplier:'Supplier fixture',supplierPhone:'+962790000001',supplierEmail:'orders@example.test',supplierLocation:'Amman warehouse',supplierContactPerson:'Contact fixture',supplierContactPhone:'+962790000002',supplierContactEmail:'contact@example.test',supplierWebsite:'https://example.test',supplierNotes:'Delivery days and other known details'};
beforeAll(async()=>{
  if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw Error('Requires a migrated disposable test database');
  const c=await f.createClinic('Patient billing fixture');clinicId=c.id;
  const m=await f.createUser({clinicId,role:'manager',permissions:ROLE_PRESETS.manager});await login(manager,m.email,m.password);
  const d=await f.createUser({clinicId,role:'doctor',permissions:ROLE_PRESETS.doctor});employeeId=d.id;await login(doctor,d.email,d.password);
  const other=await f.createUser({clinicId,role:'doctor',permissions:ROLE_PRESETS.doctor});await login(otherDoctor,other.email,other.password);
  const s=await f.createUser({clinicId,role:'secretary',permissions:ROLE_PRESETS.secretary});await login(secretary,s.email,s.password);
  const foreign=await f.createClinic(),fm=await f.createUser({clinicId:foreign.id,role:'manager',permissions:ROLE_PRESETS.manager});await login(outsider,fm.email,fm.password);
  const [fb]=await db.insert(branchesTable).values({clinicId:foreign.id,name:'Foreign',timeZone:'UTC',openingHours:week}).returning();foreignBranch=fb!.id;
  const [b]=await db.insert(branchesTable).values({clinicId,name:'Main',timeZone:'UTC',openingHours:week}).returning();branchId=b!.id;
  await db.update(usersTable).set({workingHours:week}).where(eq(usersTable.id,employeeId));
  const [service]=await db.insert(servicesTable).values({clinicId,branchId,name:'Filler Injection',nameLang:'en',durationMinutes:30,price:'50',currency:'JOD',category:'Skin',requiresRoom:false,followUpEnabled:true}).returning();serviceId=service!.id;
  await db.insert(serviceEmployeesTable).values({clinicId,serviceId,employeeId});
  const [customer]=await db.insert(customersTable).values({clinicId,name:'Patient fixture',phone:'0000000'}).returning();customerId=customer!.id;
  const filler=await manager.post('/api/clinic/inventory/items').send({name:'Filler',nameLang:'en',branchId,unit:'ml',initialQuantity:'100',extra:{unitCost:'80',billingType:'patient_charge',sellingPrice:'150',...supplier},idempotencyKey:key()});expect(filler.status).toBe(201);fillerId=filler.body.id;
  const gloves=await manager.post('/api/clinic/inventory/items').send({name:'Gloves',nameLang:'en',branchId,unit:'pair',initialQuantity:'100',extra:{unitCost:'0.5',billingType:'clinic_cost'},idempotencyKey:key()});expect(gloves.status).toBe(201);gloveId=gloves.body.id;
  expect((await manager.put(`/api/clinic/costing/services/${serviceId}`).send({branchId,overhead:'0',materials:[{itemId:fillerId,quantity:'1.5'},{itemId:gloveId,quantity:'2'}],equipment:[]})).status).toBe(200);
  expect((await manager.put(`/api/clinic/costing/rates/employees/${employeeId}`).send({value:'40'})).status).toBe(200);
});
// Immutable stock and cost ledgers stay in the disposable database, which the runner drops.
afterAll(async()=>{if(f.clinicIds.length)await db.update(usersTable).set({isActive:false}).where(inArray(usersTable.clinicId,f.clinicIds));});
async function book(extra:Record<string,unknown>={}){
  const startsAt=new Date(Date.parse('2032-01-05T08:00:00Z')+(sequence++)*3600000).toISOString();
  return manager.post('/api/clinic/appointments').send({branchId,customerId,serviceId,employeeId,startsAt,idempotencyKey:key(),...extra});
}
async function detail(id:number){return (await manager.get(`/api/clinic/appointments/${id}`)).body;}
async function complete(id:number){
  for(const status of ['confirmed','checked_in','in_service','completed']){const a=await detail(id);expect((await manager.post(`/api/clinic/appointments/${id}/status`).send({status,expectedVersion:a.version,idempotencyKey:key()})).status).toBe(200);}
}
describe('Optional supplier details and inventory selling prices',()=>{
  it('creates clinic consumables with all supplier fields and selling price omitted',async()=>{
    const result=await manager.post('/api/clinic/inventory/items').send({name:'Syringes',nameLang:'en',branchId,unit:'piece',idempotencyKey:key()});expect(result.status).toBe(201);
    const item=(await manager.get(`/api/clinic/inventory/items/${result.body.id}`)).body;expect(item.extra.sellingPrice).toBeUndefined();
  });
  it('persists every optional supplier field and supports completing details later',async()=>{
    expect((await manager.get(`/api/clinic/inventory/items/${fillerId}`)).body.extra).toMatchObject(supplier);
    expect((await manager.patch(`/api/clinic/inventory/items/${gloveId}`).send({extra:{supplierContactEmail:'',supplierNotes:'Known details only'}})).status).toBe(200);
    const item=(await manager.get(`/api/clinic/inventory/items/${gloveId}`)).body;expect(item.extra.unitCost).toBe('0.5');expect(item.extra.supplierNotes).toBe('Known details only');
  });
  it('requires a selling price only for products explicitly charged to patients',async()=>{
    for(const sellingPrice of [undefined,null,''])expect((await manager.post('/api/clinic/inventory/items').send({name:'Unpriced filler',nameLang:'en',branchId,unit:'ml',extra:{billingType:'patient_charge',sellingPrice},idempotencyKey:key()})).status).toBe(400);
    expect((await manager.patch(`/api/clinic/inventory/items/${gloveId}`).send({extra:{billingType:'patient_charge'}})).status).toBe(400);
    expect((await manager.patch(`/api/clinic/inventory/items/${fillerId}`).send({extra:{supplierPhone:'',supplierEmail:'',supplierLocation:'',supplierContactPerson:''}})).status).toBe(200);
  });
  it('accepts purchase orders without supplier information',async()=>{
    const result=await manager.post('/api/clinic/inventory/orders').send({branchId,lines:[{itemId:gloveId,quantity:'2',unitCost:'0.5'}],idempotencyKey:key()});expect(result.status).toBe(201);
  });
});
describe('Patient payment = product selling prices plus doctor’s work fee',()=>{
  it('quotes only billable products, never clinic consumables or confidential purchase costs',async()=>{
    const result=await manager.get(`/api/clinic/scheduling/pricing?branchId=${branchId}&serviceId=${serviceId}`);expect(result.status).toBe(200);
    expect(result.body).toMatchObject({serviceFee:'50.000',productTotal:'225.000',total:'275.000'});expect(result.body.products).toHaveLength(1);expect(result.body.products[0]).toMatchObject({itemId:fillerId,quantity:'1.500',unitPrice:'150.000'});
    expect(result.body.options.some((item:{id:number})=>item.id===gloveId)).toBe(false);expect(JSON.stringify(result.body)).not.toContain('unitCost');expect(JSON.stringify(result.body)).not.toContain('supplier');
  });
  it('automatically adds the linked product quantities when booking, with stable agreed prices',async()=>{
    const result=await book();expect(result.status).toBe(201);const id=result.body.id;
    expect((await detail(id)).billing.total).toBe('275.000');
    await manager.patch(`/api/clinic/inventory/items/${fillerId}`).send({extra:{sellingPrice:'200'}});
    expect((await detail(id)).billing.total).toBe('275.000');
    await manager.patch(`/api/clinic/inventory/items/${fillerId}`).send({extra:{sellingPrice:'150'}});
  });
  it('prevents silent booking when a reviewed product price changes',async()=>{
    const result=await book({productItems:[{itemId:fillerId,quantity:'1',expectedUnitPrice:'149'}]});expect(result.status).toBe(409);expect(result.body.error).toBe('billing_price_changed');
    expect((await book({expectedServicePrice:'49'})).status).toBe(409);
  });
  it('allows explicit product quantities or no additional products at booking',async()=>{
    const result=await book({productItems:[{itemId:fillerId,quantity:'2'}]});expect(result.status).toBe(201);expect((await detail(result.body.id)).billing.total).toBe('350.000');
    const none=await book({productItems:[]});expect(none.status).toBe(201);expect((await detail(none.body.id)).billing.total).toBe('50.000');
  });
  it('lets the assigned doctor and secretary edit quantities and the work fee without allowing other doctors',async()=>{
    const result=await book();expect(result.status).toBe(201);const id=result.body.id,a=await detail(id),body={items:[{itemId:fillerId,quantity:'2'}],expectedVersion:a.version,idempotencyKey:key()};
    expect((await otherDoctor.post(`/api/clinic/appointments/${id}/products`).send(body)).status).toBe(404);
    expect((await doctor.get(`/api/clinic/appointments/${id}/product-options`)).status).toBe(200);
    expect((await doctor.post(`/api/clinic/appointments/${id}/products`).send(body)).status).toBe(200);
    const next=await detail(id);expect((await secretary.post(`/api/clinic/appointments/${id}/charge`).send({price:'60',expectedVersion:next.version,idempotencyKey:key()})).status).toBe(200);expect((await detail(id)).billing.total).toBe('360.000');
    const current=await detail(id);expect((await manager.post(`/api/clinic/appointments/${id}/products`).send({items:[{itemId:gloveId,quantity:'2'}],expectedVersion:current.version,idempotencyKey:key()})).body.error).toBe('billing_clinic_consumable');
  });
  it('updates charges from actual consumption, uses all materials for clinic cost, and freezes the final payment',async()=>{
    const result=await book();expect(result.status).toBe(201);const id=result.body.id;await complete(id);
    const consumption={items:[{itemId:fillerId,quantity:'2'},{itemId:gloveId,quantity:'2'}],confirmNoItems:false};
    expect((await manager.post(`/api/clinic/appointments/${id}/consumption`).send({consumption,idempotencyKey:key()})).status).toBe(200);
    expect((await detail(id)).billing).toMatchObject({total:'350.000',productTotal:'300.000',basis:'actual'});
    const actual={actualMinutes:30,equipment:[]},frozen=await manager.post(`/api/clinic/costing/appointments/${id}/finalize`).send(actual);expect(frozen.status).toBe(200);expect(frozen.body.breakdown).toMatchObject({price:'350.000',total:'181.000',profit:'169.000'});
    const a=await detail(id);expect(a.canEditCharge).toBe(false);expect((await manager.post(`/api/clinic/appointments/${id}/products`).send({items:[],expectedVersion:a.version,idempotencyKey:key()})).status).toBe(409);
    expect((await manager.post(`/api/clinic/appointments/${id}/consumption`).send({consumption,idempotencyKey:key()})).status).toBe(200);expect((await detail(id)).billing.total).toBe('350.000');
  });
  it('keeps follow-up appointments at zero by default unless products are explicitly selected',async()=>{
    const result=await manager.get(`/api/clinic/scheduling/pricing?branchId=${branchId}&serviceId=${serviceId}&appointmentType=follow_up`);expect(result.status).toBe(200);expect(result.body.total).toBe('0.000');expect(result.body.products).toEqual([]);
  });
  it('isolates clinic pricing and prevents unauthenticated reads',async()=>{
    expect((await manager.get(`/api/clinic/scheduling/pricing?branchId=${foreignBranch}&serviceId=${serviceId}`)).status).toBe(404);
    expect((await outsider.get(`/api/clinic/scheduling/pricing?branchId=${branchId}&serviceId=${serviceId}`)).status).toBe(404);
    expect((await agent().get(`/api/clinic/scheduling/pricing?branchId=${branchId}&serviceId=${serviceId}`)).status).toBe(401);
  });
  it('rounds fractional products exactly to thousandths before summing',()=>{
    const line=productCharge({id:1,name:'Product',nameLang:'en',unit:'ml'},'1.111','0.333');expect(line.amount).toBe('0.370');expect(paymentSummary('0.001',[line]).total).toBe('0.371');
  });
});
