import {randomUUID} from 'node:crypto';
import {beforeAll,describe,expect,it} from 'vitest';
import {db,branchesTable,roomsTable,servicesTable,customersTable,appointmentsTable,serviceMaterialCostsTable,serviceCostProfilesTable,type WeeklyHours} from '@workspace/db';
import {ROLE_PRESETS} from '../domain/permissions';
import {Fixture,agent,login} from './helpers';

const f=new Fixture(),manager=agent(),outsider=agent(),reader=agent(),key=()=>randomUUID();
const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{open:'09:00',close:'17:00'}]])) as WeeklyHours;
let clinicId:number,branchA:number,branchB:number,roomA:number,roomA2:number,roomB:number,foreignBranch:number,foreignRoom:number,productId:number,itemA:number,itemB:number,selectedProduct:number,roomServiceId:number,settingsVersion=0;
const overview=async()=>{const result=await manager.get('/api/clinic/inventory/overview');expect(result.status).toBe(200);return result.body;};
const product=async()=> (await overview()).items.find((row:{id:number})=>row.id===productId);
const move=async(itemId:number,roomId:number|null,quantity:string)=>manager.post(`/api/clinic/inventory/items/${itemId}/movements`).send({kind:'adjustment',quantity,roomId,reason:'Fixture usage',reasonLang:'en',idempotencyKey:key()});
const transfer=async(fromItemId:number,toItemId:number,quantity:string,fromRoomId:number|null=null,toRoomId:number|null=null)=>manager.post('/api/clinic/inventory/transfers').send({fromItemId,toItemId,fromRoomId,toRoomId,quantity,notes:'Fixture transfer',idempotencyKey:key()});
beforeAll(async()=>{
 if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw Error('Requires a migrated disposable test database');
 const c=await f.createClinic('Inventory locations fixture');clinicId=c.id;
 const m=await f.createUser({clinicId,role:'manager',permissions:ROLE_PRESETS.manager});await login(manager,m.email,m.password);
 const r=await f.createUser({clinicId,role:'other_staff',permissions:['inventory.read','settings.read']});await login(reader,r.email,r.password);
 const foreign=await f.createClinic(),foreignUser=await f.createUser({clinicId:foreign.id,role:'manager',permissions:ROLE_PRESETS.manager});await login(outsider,foreignUser.email,foreignUser.password);
 const branches=await db.insert(branchesTable).values([{clinicId,name:'A',openingHours:week,timeZone:'UTC'},{clinicId,name:'B',openingHours:week,timeZone:'UTC'},{clinicId:foreign.id,name:'Foreign',openingHours:week,timeZone:'UTC'}]).returning();
 branchA=branches[0]!.id;branchB=branches[1]!.id;foreignBranch=branches[2]!.id;
 const rooms=await db.insert(roomsTable).values([{clinicId,branchId:branchA,name:'A room'},{clinicId,branchId:branchA,name:'A second room'},{clinicId,branchId:branchB,name:'B room'},{clinicId:foreign.id,branchId:foreignBranch,name:'Foreign room'}]).returning();
 roomA=rooms[0]!.id;roomA2=rooms[1]!.id;roomB=rooms[2]!.id;foreignRoom=rooms[3]!.id;
});
describe('clinic → branch → optional room inventory',()=>{
 it('defaults to branch tracking and protects settings from read-only staff',async()=>{
  const result=await manager.get('/api/clinic/inventory/settings');expect(result.status).toBe(200);expect(result.body).toMatchObject({movementMode:'branch',version:0});
  expect((await reader.post('/api/clinic/inventory/settings').send({movementMode:'room',expectedVersion:0,idempotencyKey:key()})).status).toBe(403);
 });
 it('creates one catalog item with exact stock at all branches',async()=>{
  const result=await manager.post('/api/clinic/inventory/items').send({name:'Filler',nameLang:'en',unit:'ml',branchId:branchA,availability:'all',branchStocks:[{branchId:branchA,quantity:'10'},{branchId:branchB,quantity:'5'}],extra:{billingType:'patient_charge',sellingPrice:'150',unitCost:'90'},idempotencyKey:key()});expect(result.status).toBe(201);itemA=result.body.id;
  const detail=await manager.get(`/api/clinic/inventory/items/${itemA}`);expect(detail.status).toBe(200);productId=detail.body.productId;itemB=detail.body.branches.find((row:{id:number})=>row.id===branchB).itemId;
  expect((await product())).toMatchObject({totalQuantity:'15.000',availability:'all'});expect((await product()).branches.map((row:{quantity:string})=>row.quantity)).toEqual(['10.000','5.000']);
  expect((await manager.get('/api/clinic/inventory/dashboard')).body.total).toBe(1);expect((await overview()).total).toBe(1);
 });
 it('supports selected branches and rejects unavailable or foreign branch selections',async()=>{
  const result=await manager.post('/api/clinic/inventory/items').send({name:'Gloves',nameLang:'en',unit:'box',branchId:branchA,availability:'selected',branchIds:[branchA],initialQuantity:'0',idempotencyKey:key()});expect(result.status).toBe(201);selectedProduct=(await manager.get(`/api/clinic/inventory/items/${result.body.id}`)).body.productId;
  for(const branchIds of [[],[foreignBranch],[branchA,branchA]])expect((await manager.post('/api/clinic/inventory/items').send({name:'Invalid',nameLang:'en',unit:'box',branchId:branchA,availability:'selected',branchIds,idempotencyKey:key()})).status).toBe(400);
  expect((await manager.post('/api/clinic/inventory/items').send({name:'Invalid quantities',nameLang:'en',unit:'box',branchId:branchA,availability:'selected',branchIds:[branchA],branchStocks:[{branchId:branchB,quantity:'1'}],idempotencyKey:key()})).status).toBe(400);
 });
 it('automatically enables all-branch items at future branches with zero stock',async()=>{
  const [branch]=await db.insert(branchesTable).values({clinicId,name:'C',openingHours:week,timeZone:'UTC'}).returning();const p=await product();expect(p.branches.find((row:{id:number})=>row.id===branch!.id).quantity).toBe('0.000');expect(p.totalQuantity).toBe('15.000');
  expect((await overview()).items.find((row:{id:number})=>row.id===selectedProduct).branches).toHaveLength(1);
 });
 it('preserves clinic stock during branch transfers and replays safely',async()=>{
  const input={fromItemId:itemA,toItemId:itemB,quantity:'2',notes:'Branch transfer',idempotencyKey:key()};const first=await manager.post('/api/clinic/inventory/transfers').send(input);expect(first.status).toBe(201);expect((await manager.post('/api/clinic/inventory/transfers').send(input)).body.replayed).toBe(true);
  const p=await product();expect(p.totalQuantity).toBe('15.000');expect(p.branches.find((row:{id:number})=>row.id===branchA).quantity).toBe('8.000');expect(p.branches.find((row:{id:number})=>row.id===branchB).quantity).toBe('7.000');
  expect((await transfer(itemA,itemA,'1',null,roomA)).body.error).toBe('inventory_room_tracking_disabled');
 });
 it('enables room tracking with optimistic version protection',async()=>{
  expect((await manager.post('/api/clinic/inventory/settings').send({movementMode:'room',expectedVersion:0,idempotencyKey:key()})).status).toBe(200);settingsVersion=1;
  expect((await manager.post('/api/clinic/inventory/settings').send({movementMode:'branch',expectedVersion:0,idempotencyKey:key()})).status).toBe(409);
  expect((await product()).branches.find((row:{id:number})=>row.id===branchA).rooms).toHaveLength(2);
 });
 it('allocates to rooms and moves between rooms without changing parent totals',async()=>{
  expect((await transfer(itemA,itemA,'3',null,roomA)).status).toBe(201);expect((await transfer(itemA,itemA,'1',roomA,roomA2)).status).toBe(201);
  const p=await product(),a=p.branches.find((row:{id:number})=>row.id===branchA);expect(p.totalQuantity).toBe('15.000');expect(a).toMatchObject({quantity:'8.000',storeQuantity:'5.000'});expect(a.rooms.find((row:{id:number})=>row.id===roomA).quantity).toBe('2.000');expect(a.rooms.find((row:{id:number})=>row.id===roomA2).quantity).toBe('1.000');
 });
 it('tracks exact room usage and rejects withdrawals against another location’s balance',async()=>{
  expect((await move(itemA,roomA2,'-0.333')).status).toBe(201);expect((await product()).totalQuantity).toBe('14.667');
  expect((await move(itemA,null,'-6')).status).toBe(409);expect((await transfer(itemA,itemA,'0.1',roomA2,roomB)).body.error).toBe('inventory_room_branch_mismatch');expect((await move(itemA,foreignRoom,'-0.1')).status).toBe(400);
  expect((await product()).totalQuantity).toBe('14.667');
  expect((await manager.get('/api/clinic/inventory/items').query({branchId:branchA,roomId:roomA2})).body.items.find((row:{id:number})=>row.id===itemA).balance).toBe('0.667');
  expect((await manager.get('/api/clinic/inventory/items').query({branchId:branchA,location:'store'})).body.items.find((row:{id:number})=>row.id===itemA).balance).toBe('5.000');
 });
 it('moves between rooms at different branches while preserving clinic totals',async()=>{
  expect((await transfer(itemA,itemB,'2',roomA,roomB)).status).toBe(201);const p=await product();expect(p.totalQuantity).toBe('14.667');expect(p.branches.find((row:{id:number})=>row.id===branchB)).toMatchObject({quantity:'9.000',storeQuantity:'7.000'});
 });
 it('serializes competing deductions so a room never goes negative',async()=>{
  const results=await Promise.all([move(itemA,roomA2,'-0.5'),move(itemA,roomA2,'-0.5')]);expect(results.map(result=>result.status).sort()).toEqual([201,409]);
  expect((await product()).branches.find((row:{id:number})=>row.id===branchA).rooms.find((row:{id:number})=>row.id===roomA2).quantity).toBe('0.167');
 });
 it('deducts completed appointment consumption from its room once',async()=>{
  const doctor=await f.createUser({clinicId,role:'doctor',permissions:ROLE_PRESETS.doctor});
  const [service]=await db.insert(servicesTable).values({clinicId,branchId:branchB,name:'Filler procedure',durationMinutes:30,price:'50',currency:'JOD',category:'Skin',requiresRoom:true}).returning();
  roomServiceId=service!.id;
  const [customer]=await db.insert(customersTable).values({clinicId,name:'Patient fixture',phone:'0000000'}).returning();
  const [appointment]=await db.insert(appointmentsTable).values({clinicId,branchId:branchB,serviceId:service!.id,customerId:customer!.id,employeeId:doctor.id,roomId:roomB,startsAt:new Date('2035-01-01T09:00:00Z'),endsAt:new Date('2035-01-01T09:30:00Z'),durationMinutes:30,requiresRoom:true,status:'completed',createdBy:doctor.id,chargePrice:'50',chargeCurrency:'JOD'}).returning();
  const consumption={items:[{itemId:itemB,quantity:'0.500'}],confirmNoItems:false};
  expect((await manager.post(`/api/clinic/appointments/${appointment!.id}/consumption`).send({consumption,idempotencyKey:key()})).status).toBe(200);
  expect((await manager.post(`/api/clinic/appointments/${appointment!.id}/consumption`).send({consumption,idempotencyKey:key()})).status).toBe(200);
  const p=await product(),b=p.branches.find((row:{id:number})=>row.id===branchB);expect(b.storeQuantity).toBe('7.000');expect(b.rooms.find((row:{id:number})=>row.id===roomB).quantity).toBe('1.500');
  expect((await manager.get(`/api/clinic/appointments/${appointment!.id}`)).body.billing.total).toBe('125.000');
 });
 it('updates shared supplier and pricing details across branches',async()=>{
  expect((await manager.patch(`/api/clinic/inventory/items/${itemA}`).send({extra:{supplier:'Optional supplier',sellingPrice:'175'}})).status).toBe(200);
  expect((await manager.get(`/api/clinic/inventory/items/${itemB}`)).body.extra).toMatchObject({supplier:'Optional supplier',sellingPrice:'175'});expect((await product()).extra.supplier).toBe('Optional supplier');
 });
 it('lets clinics change availability while preventing stock loss or foreign branches',async()=>{
  expect((await manager.post(`/api/clinic/inventory/products/${productId}/availability`).send({availability:'selected',branchIds:[branchA],idempotencyKey:key()})).body.error).toBe('inventory_branch_in_use');
  expect((await manager.post(`/api/clinic/inventory/products/${selectedProduct}/availability`).send({availability:'selected',branchIds:[branchB],idempotencyKey:key()})).status).toBe(200);
  expect((await overview()).items.find((row:{id:number})=>row.id===selectedProduct).branches.map((row:{id:number})=>row.id)).toEqual([branchB]);
  expect((await manager.post(`/api/clinic/inventory/products/${selectedProduct}/availability`).send({availability:'selected',branchIds:[foreignBranch],idempotencyKey:key()})).status).toBe(400);
 });
 it('returns room stock to branch stores when disabling tracking, keeping totals and history',async()=>{
  const before=await product(),input={movementMode:'branch',expectedVersion:settingsVersion,idempotencyKey:key()};expect((await manager.post('/api/clinic/inventory/settings').send(input)).status).toBe(200);expect((await manager.post('/api/clinic/inventory/settings').send(input)).body.replayed).toBe(true);
  const after=await product();expect(after.totalQuantity).toBe(before.totalQuantity);for(const branch of after.branches){expect(branch.storeQuantity).toBe(branch.quantity);expect(branch.rooms).toEqual([]);}
  expect((await move(itemB,roomB,'-0.1')).body.error).toBe('inventory_room_tracking_disabled');
 });
 it('excludes internal branch and room transfers from receipts and usage reports',async()=>{
  const date=new Date().toISOString().slice(0,10),result=await manager.get('/api/clinic/inventory/reports').query({from:date,to:date});expect(result.status).toBe(200);expect(result.body.totalItems).toBe(2);expect(result.body.receipts).toBe(15);expect(result.body.usage).toBeCloseTo(1.333,3);
 });
 it('shows branch and room names in historical transfers after room tracking is disabled',async()=>{
  const result=await manager.get('/api/clinic/inventory/transfers');expect(result.status).toBe(200);expect(result.body.transfers.some((row:{from:{roomName:string;branchName:string};to:{roomName:string|null;branchName:string}})=>row.from.roomName==='B room'&&row.from.branchName==='B'&&row.to.roomName===null&&row.to.branchName==='B')).toBe(true);
 });
 it('keeps a zero-stock branch available while its purchase order or service recipe uses the item',async()=>{
  const result=await manager.post('/api/clinic/inventory/items').send({name:'Reserved supplies',nameLang:'en',unit:'piece',branchId:branchA,availability:'selected',branchIds:[branchA,branchB],idempotencyKey:key()});expect(result.status).toBe(201);
  const detail=(await manager.get(`/api/clinic/inventory/items/${result.body.id}`)).body,branchItem=detail.branches.find((row:{id:number})=>row.id===branchB).itemId;
  const order=await manager.post('/api/clinic/inventory/orders').send({branchId:branchB,lines:[{itemId:branchItem,quantity:'1'}],idempotencyKey:key()});expect(order.status).toBe(201);
  const remove=()=>manager.post(`/api/clinic/inventory/products/${detail.productId}/availability`).send({availability:'selected',branchIds:[branchA],idempotencyKey:key()});
  expect((await remove()).body.error).toBe('inventory_branch_in_use');expect((await manager.post(`/api/clinic/inventory/orders/${order.body.id}/cancel`)).status).toBe(200);
  await db.insert(serviceCostProfilesTable).values({clinicId,branchId:branchB,serviceId:roomServiceId});
  await db.insert(serviceMaterialCostsTable).values({clinicId,branchId:branchB,serviceId:roomServiceId,itemId:branchItem,quantity:'1'});
  expect((await remove()).body.error).toBe('inventory_branch_in_use');
 });
 it('isolates clinic totals, settings and item availability',async()=>{
  expect((await agent().get('/api/clinic/inventory/overview')).status).toBe(401);expect((await outsider.get(`/api/clinic/inventory/items/${itemA}`)).status).toBe(404);expect((await outsider.get('/api/clinic/inventory/overview')).body.items).toEqual([]);
  expect((await outsider.post(`/api/clinic/inventory/products/${productId}/availability`).send({availability:'all',idempotencyKey:key()})).status).toBe(404);
 });
});
