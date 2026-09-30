import {randomUUID} from 'node:crypto';
import {beforeAll,describe,expect,it} from 'vitest';
import {db,branchesTable} from '@workspace/db';
import {ROLE_PRESETS} from '../domain/permissions';
import {Fixture,agent,login} from './helpers';

const fixture=new Fixture(),manager=agent(),key=()=>randomUUID();
let branchA:number,branchB:number;
const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{open:'09:00',close:'17:00'}]])) as Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun',{open:string;close:string}[]>;

describe('rooms and inventory workflows on PostgreSQL',()=>{
 beforeAll(async()=>{
  if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw new Error('A disposable database is required');
  const clinic=await fixture.createClinic('Workflow test clinic');
  const user=await fixture.createUser({clinicId:clinic.id,role:'manager',permissions:ROLE_PRESETS.manager});
  expect((await login(manager,user.email,user.password)).status).toBe(200);
  const branches=await db.insert(branchesTable).values([{clinicId:clinic.id,name:'First',nameLang:'en' as const,timeZone:'UTC',openingHours:week},{clinicId:clinic.id,name:'Second',nameLang:'en' as const,timeZone:'UTC',openingHours:week}]).returning();
  branchA=branches[0]!.id;branchB=branches[1]!.id;
 });
 it('saves room metadata and blocks unavailable time',async()=>{
  const created=await manager.post('/api/clinic/rooms').send({name:'Treatment A',nameLang:'en',branchId:branchA,capacity:2,status:'available',serviceIds:[],extra:{roomType:'treatment',equipment:['Laser Device'],color:'#4ea7dd',openingHours:week,breaks:Object.fromEntries(Object.keys(week).map(day=>[day,[{open:'13:00',close:'14:00'}]]))}});
  expect(created.status).toBe(201);
  const id=created.body.item.id;
  const overview=await manager.get('/api/clinic/rooms/overview');
  expect(overview.status).toBe(200);
  expect(overview.body.rooms.find((room:{id:number})=>room.id===id)?.extra.equipment).toEqual(['Laser Device']);
  const startsAt='2030-01-01T10:00:00.000Z',endsAt='2030-01-01T11:00:00.000Z';
  const block=await manager.post(`/api/clinic/rooms/${id}/blocks`).send({startsAt,endsAt,kind:'maintenance',reason:'Device service',notes:'',idempotencyKey:key()});
  expect(block.status).toBe(201);
  expect((await manager.post(`/api/clinic/rooms/${id}/blocks`).send({startsAt,endsAt,kind:'maintenance',reason:'Duplicate',notes:'',idempotencyKey:key()})).status).toBe(409);
  const schedule=await manager.get('/api/clinic/rooms/schedule').query({from:'2030-01-01T00:00:00.000Z',to:'2030-01-02T00:00:00.000Z'});
  expect(schedule.status).toBe(200);
  expect(schedule.body.blocks.some((row:{id:number})=>row.id===block.body.id)).toBe(true);
 });
 it('creates stock, receives a purchase order, and transfers between branches',async()=>{
  const create=async(branchId:number)=>{
   const result=await manager.post('/api/clinic/inventory/items').send({branchId,name:'Gloves',nameLang:'en',unit:'box',initialQuantity:branchId===branchA?'5':'0',extra:{category:'Consumables',minimumStock:'2',unitCost:'1'},idempotencyKey:key()});
   expect(result.status).toBe(201);return result.body.id as number;
  };
  const from=await create(branchA),to=await create(branchB);
  const order=await manager.post('/api/clinic/inventory/orders').send({branchId:branchA,supplier:'Supplier A',notes:'',lines:[{itemId:from,quantity:'2',unitCost:'1'}],idempotencyKey:key()});
  expect(order.status).toBe(201);
  const received=await manager.post(`/api/clinic/inventory/orders/${order.body.id}/receive`).send({lines:[{itemId:from,quantity:'2'}],idempotencyKey:key()});
  expect(received.status).toBe(200);
  const transferred=await manager.post('/api/clinic/inventory/transfers').send({fromItemId:from,toItemId:to,quantity:'2',notes:'Test transfer',idempotencyKey:key()});
  expect(transferred.status).toBe(201);
  const source=await manager.get(`/api/clinic/inventory/items/${from}`),target=await manager.get(`/api/clinic/inventory/items/${to}`);
  expect(source.body.balance).toBe('5.000');expect(target.body.balance).toBe('2.000');
  expect((await manager.get('/api/clinic/inventory/dashboard')).body.total).toBe(2);
  expect((await manager.get('/api/clinic/inventory/orders')).body.orders[0].status).toBe('received');
 });
});
