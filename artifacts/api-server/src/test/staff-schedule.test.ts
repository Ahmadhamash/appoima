import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {db,usersTable,branchesTable} from '@workspace/db';
import {Fixture,agent,login,uniqueEmail} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {normalizeWeek} from '../domain/setup-rules';
import {emptyDraft,withDefaultStaffHours,type Draft} from '../domain/concierge-core';

const fx=new Fixture(),week=normalizeWeek({mon:[{open:'08:30',close:'12:00'},{open:'13:00',close:'18:00'}],wed:[{open:'10:00',close:'16:00'}],sat:[{open:'09:00',close:'14:00'}]}),closed=normalizeWeek({});
let manager:ReturnType<typeof agent>,branchId:number,clinicId:number;
const body=(extra:Record<string,unknown>={})=>({name:'Schedule fixture',nameLang:'en',email:uniqueEmail('schedule'),initialPassword:'Schedule-fixture-123',branchId,role:'secretary',permissions:[],...extra});
beforeAll(async()=>{
  const clinic=await fx.createClinic('Staff schedule defaults');clinicId=clinic.id;
  const user=await fx.createUser({clinicId,role:'manager',permissions:[...ROLE_PRESETS.manager]});manager=agent();await login(manager,user.email,user.password);
  const branch=await manager.post('/api/clinic/branches').send({name:'Main',nameLang:'en',timeZone:'Asia/Amman',openingHours:week});expect(branch.status).toBe(201);branchId=branch.body.item.id;
});
afterAll(()=>fx.cleanup());
async function create(extra:Record<string,unknown>={}){
  const result=await manager.post('/api/clinic/employees').send(body(extra));expect(result.status).toBe(201);
  fx.userIds.push(result.body.item.id);return (await manager.get(`/api/clinic/employees/${result.body.item.id}`)).body.item;
}
describe('New staff inherit their branch schedule',()=>{
  for(const role of ['manager','secretary','doctor','service_provider','other_staff'])it(`defaults all days and split shifts for ${role}`,async()=>{
    const staff=await create({role});expect(staff.workingHours).toEqual(week);expect(staff.breaks).toEqual(closed);
  });
  it('uses the sole branch for an unassigned new employee',async()=>expect((await create({branchId:null})).workingHours).toEqual(week));
  it('preserves custom hours and explicitly closed weeks',async()=>{
    expect((await create({workingHours:closed})).workingHours).toEqual(closed);
    const custom={...closed,tue:[{open:'11:00',close:'15:00'}]};expect((await create({workingHours:custom})).workingHours).toEqual(custom);
  });
  it('validates breaks against the inherited hours before saving an account',async()=>{
    const input=body({breaks:{...closed,mon:[{open:'12:15',close:'12:45'}]}});
    const result=await manager.post('/api/clinic/employees').send(input);expect(result.status).toBe(400);
    expect(await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.email,input.email))).toHaveLength(0);
  });
  it('rejects a branch from another clinic',async()=>{
    const other=await fx.createClinic('Other schedule clinic'),[branch]=await db.insert(branchesTable).values({clinicId:other.id,name:'Foreign',nameLang:'en',timeZone:'UTC',openingHours:week}).returning();
    expect((await manager.post('/api/clinic/employees').send(body({branchId:branch!.id}))).status).toBe(404);
  });
  it('keeps an existing employee schedule editable and preserves it when changing branches',async()=>{
    const staff=await create(),other=await manager.post('/api/clinic/branches').send({name:'Evening',nameLang:'en',timeZone:'UTC',openingHours:{...closed,tue:[{open:'17:00',close:'20:00'}]}});expect(other.status).toBe(201);
    const {initialPassword,...input}=body({email:staff.email,branchId:other.body.item.id,workingHours:week,breaks:closed});
    expect((await manager.put(`/api/clinic/employees/${staff.id}`).send(input)).status).toBe(200);
    expect((await manager.get(`/api/clinic/employees/${staff.id}`)).body.item.workingHours).toEqual(week);
    expect((await create({branchId:null})).workingHours).toEqual(closed);
  });
});
describe('Setup draft schedule defaults',()=>{
  const draft=():Draft=>({...emptyDraft(),branches:[{key:'new_branch',existingId:null,name:'Draft branch',nameLang:'en',timeZone:'UTC',openingHours:week}],staff:[{key:'new_staff',name:'Draft staff',nameLang:'en',email:'draft@example.test',phone:null,jobTitle:null,branchKey:'new_branch',role:'secretary',serviceKeys:[],workingHours:null,breaks:closed}]});
  it('copies branch hours without changing the branch or requiring the hours again',()=>{
    const input=draft(),result=withDefaultStaffHours(input);expect(result.staff[0]!.workingHours).toEqual(week);
    result.staff[0]!.workingHours!.mon[0]!.open='10:00';expect(input.branches[0]!.openingHours).toEqual(week);expect(input.staff[0]!.workingHours).toBeNull();
  });
  it('uses an existing selected branch and preserves a deliberately closed staff week',()=>{
    const input=draft();input.branches=[];input.staff[0]!.branchKey='branch_1';const existing=[{id:1,key:'branch_1',openingHours:week}];
    expect(withDefaultStaffHours(input,existing).staff[0]!.workingHours).toEqual(week);
    input.staff[0]!.workingHours=closed;expect(withDefaultStaffHours(input,existing).staff[0]!.workingHours).toEqual(closed);
  });
  it('waits for a branch selection when several branches are available',()=>{
    const input=draft();input.branches=[];input.staff[0]!.branchKey=null;
    expect(withDefaultStaffHours(input,[{key:'branch_1',openingHours:week},{key:'branch_2',openingHours:closed}]).staff[0]!.workingHours).toBeNull();
  });
});
