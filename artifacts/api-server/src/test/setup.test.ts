import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, usersTable, auditEventsTable, serviceEmployeesTable, servicesTable } from "@workspace/db";
import { createDefinition } from "@workspace/service-definition";
import { Fixture, agent, login, uniqueEmail } from "./helpers";
import { ROLE_PRESETS } from "../domain/permissions";
import { normalizeWeek } from "../domain/setup-rules";

const fx = new Fixture();
afterAll(() => fx.cleanup());
const hours = normalizeWeek({ mon: [{open:"09:00",close:"12:00"},{open:"13:00",close:"17:00"}], tue: {open:"09:00",close:"17:00"} });
const empty = () => normalizeWeek({});
const branchBody = (name="Main branch") => ({name,nameLang:"en",timeZone:"Asia/Amman",openingHours:hours});
const serviceBody = (branchId:number, employeeIds:number[]=[]) => ({name:"Skin care",nameLang:"en",branchId,durationMinutes:45,price:"25.000",currency:"JOD",category:"Skin",isActive:true,requiresRoom:true,employeeIds});
const roomBody = (branchId:number, serviceIds:number[]=[]) => ({name:"Treatment room",nameLang:"en",branchId,capacity:1,status:"available",serviceIds});
const customerBody = (branchId:number) => ({name:"Customer A",nameLang:"en",branchId,phone:"+962790000001",email:null,notes:"Call after noon",sensitiveNotes:"Restricted test note"});
const employeeBody = (branchId:number, serviceIds:number[]=[]) => ({name:"New provider",nameLang:"en",branchId,email:uniqueEmail("provider"),initialPassword:"staff-initial-123",role:"service_provider",permissions:[...ROLE_PRESETS.service_provider],phone:null,jobTitle:"Provider",isActive:true,serviceIds,workingHours:hours,breaks:empty(),timeOff:[]});
let a:ReturnType<typeof agent>, b:ReturnType<typeof agent>;
let clinicA:number, clinicB:number, managerA:number;
let branchA:number, branchB:number, serviceA:number, serviceB:number, roomA:number, roomB:number, customerA:number, customerB:number, employeeA:number, employeeB:number;
beforeAll(async()=>{
  const ca=await fx.createClinic("Phase 2 A"), cb=await fx.createClinic("Phase 2 B");clinicA=ca.id;clinicB=cb.id;
  const ua=await fx.createUser({clinicId:clinicA,role:"manager",permissions:[...ROLE_PRESETS.manager]});managerA=ua.id;
  const ub=await fx.createUser({clinicId:clinicB,role:"manager",permissions:[...ROLE_PRESETS.manager]});
  a=agent();b=agent();await login(a,ua.email,ua.password);await login(b,ub.email,ub.password);
  const ba=await a.post("/api/clinic/branches").send(branchBody("A main")),bb=await b.post("/api/clinic/branches").send(branchBody("B main"));
  expect(ba.status).toBe(201);expect(bb.status).toBe(201);branchA=ba.body.item.id;branchB=bb.body.item.id;
  const ea=await a.post("/api/clinic/employees").send(employeeBody(branchA)),eb=await b.post("/api/clinic/employees").send(employeeBody(branchB));
  expect(ea.status).toBe(201);expect(eb.status).toBe(201);employeeA=ea.body.item.id;employeeB=eb.body.item.id;
  const sa=await a.post("/api/clinic/services").send(serviceBody(branchA,[employeeA])),sb=await b.post("/api/clinic/services").send(serviceBody(branchB,[employeeB]));
  expect(sa.status).toBe(201);expect(sb.status).toBe(201);serviceA=sa.body.item.id;serviceB=sb.body.item.id;
  const ra=await a.post("/api/clinic/rooms").send(roomBody(branchA,[serviceA])),rb=await b.post("/api/clinic/rooms").send(roomBody(branchB,[serviceB]));
  expect(ra.status).toBe(201);expect(rb.status).toBe(201);roomA=ra.body.item.id;roomB=rb.body.item.id;
  const cua=await a.post("/api/clinic/customers").send(customerBody(branchA)),cub=await b.post("/api/clinic/customers").send(customerBody(branchB));
  expect(cua.status).toBe(201);expect(cub.status).toBe(201);customerA=cua.body.item.id;customerB=cub.body.item.id;
},30000);

describe("Phase 2 tenant isolation",()=>{
  const cases=[
    {resource:"branches",id:()=>branchB,body:()=>branchBody("Foreign")},
    {resource:"services",id:()=>serviceB,body:()=>serviceBody(branchA)},
    {resource:"rooms",id:()=>roomB,body:()=>roomBody(branchA)},
    {resource:"employees",id:()=>employeeB,body:()=>{const {initialPassword,...body}=employeeBody(branchA);return body;}},
    {resource:"customers",id:()=>customerB,body:()=>customerBody(branchA)},
  ];
  for(const test of cases){
    it(`denies reading clinic B ${test.resource}`,async()=>expect((await a.get(`/api/clinic/${test.resource}/${test.id()}`)).status).toBe(404));
    it(`denies changing clinic B ${test.resource}`,async()=>expect((await a.put(`/api/clinic/${test.resource}/${test.id()}`).send(test.body())).status).toBe(404));
    it(`never lists clinic B ${test.resource}`,async()=>{const r=await a.get(`/api/clinic/${test.resource}`);expect(r.status).toBe(200);expect(r.body.items.some((i:{id:number})=>i.id===test.id())).toBe(false);});
  }
  it("does not trust clinicId supplied in a create body",async()=>{const r=await a.post('/api/clinic/customers').send({...customerBody(branchA),clinicId:clinicB});expect(r.status).toBe(400);});
  it("rejects foreign branch references",async()=>expect((await a.post('/api/clinic/customers').send(customerBody(branchB))).status).toBe(404));
  it("rejects foreign service references",async()=>expect((await a.post('/api/clinic/rooms').send(roomBody(branchA,[serviceB]))).status).toBe(404));
  it("rejects foreign employee references",async()=>expect((await a.post('/api/clinic/services').send(serviceBody(branchA,[employeeB]))).status).toBe(404));
  it("blocks owners from clinic operational data",async()=>{const owner=await fx.createUser({clinicId:null,role:'platform_owner'});const c=agent();await login(c,owner.email,owner.password);for(const resource of ['branches','services','rooms','employees','customers'])expect((await c.get(`/api/clinic/${resource}`)).status).toBe(403);});
  it("denies unauthenticated setup routes",async()=>{for(const resource of ['branches','services','rooms','employees','customers'])expect((await agent().get(`/api/clinic/${resource}`)).status).toBe(401);});
});

describe("Phase 2 access and account controls",()=>{
  it("blocks grant escalation, including a manager role without the required permissions",async()=>{
    const u=await fx.createUser({clinicId:clinicA,role:'manager',permissions:['employees.manage','customers.read']});const c=agent();await login(c,u.email,u.password);
    const r=await c.post('/api/clinic/employees').send({...employeeBody(branchA),role:'manager',permissions:['settings.manage']});expect(r.status).toBe(403);expect(r.body.error).toBe('permission_escalation');
    const options=await c.get('/api/clinic/options?for=employees');expect(options.body.grantablePermissions).not.toContain('settings.manage');expect(options.body.rolePresets.manager).not.toContain('settings.manage');
  });
  it("never creates a platform owner through staff creation",async()=>expect((await a.post('/api/clinic/employees').send({...employeeBody(branchA),role:'platform_owner'})).status).toBe(400));
  it("cannot take over a stronger account by edit, password reset or activation",async()=>{
    const u=await fx.createUser({clinicId:clinicA,role:'manager',permissions:['employees.manage']});const c=agent();await login(c,u.email,u.password);
    const {initialPassword,...body}=employeeBody(branchA);
    expect((await c.put(`/api/clinic/employees/${managerA}`).send({...body,permissions:[]})).status).toBe(403);
    expect((await c.post(`/api/clinic/employees/${managerA}/password`).send({initialPassword:'reset-initial-123'})).status).toBe(403);
    expect((await c.patch(`/api/clinic/employees/${managerA}/active`).send({isActive:false})).status).toBe(403);
  });
  it("cannot reset or deactivate oneself via staff administration",async()=>{
    expect((await a.post(`/api/clinic/employees/${managerA}/password`).send({initialPassword:'reset-initial-123'})).body.error).toBe('cannot_edit_self');
    expect((await a.patch(`/api/clinic/employees/${managerA}/active`).send({isActive:false})).status).toBe(403);
  });
  it("rejects short initial passwords",async()=>expect((await a.post('/api/clinic/employees').send({...employeeBody(branchA),initialPassword:'short'})).status).toBe(400));
  it("creates a hashed password without returning it and requires a first-login change",async()=>{
    const body=employeeBody(branchA),r=await a.post('/api/clinic/employees').send(body);expect(r.status).toBe(201);
    expect(r.body.item).toEqual({id:expect.any(Number)});
    const [u]=await db.select().from(usersTable).where(eq(usersTable.id,r.body.item.id));expect(u!.passwordHash).not.toBe(body.initialPassword);expect(u!.passwordHash).toMatch(/^\$2/);expect(u!.mustChangePassword).toBe(true);
    const c=agent();expect((await login(c,body.email,body.initialPassword)).status).toBe(200);expect((await c.get('/api/me/clinic')).body.error).toBe('password_change_required');
    const detail=await a.get(`/api/clinic/employees/${u!.id}`);expect(detail.body.item.passwordHash).toBeUndefined();expect(detail.body.item.initialPassword).toBeUndefined();
  });
  it("reset invalidates old sessions and forces a new first-login change",async()=>{
    const body=employeeBody(branchA),r=await a.post('/api/clinic/employees').send(body),id=r.body.item.id,c=agent();await login(c,body.email,body.initialPassword);
    expect((await c.post('/api/auth/change-password').send({currentPassword:body.initialPassword,newPassword:'staff-personal-123'})).status).toBe(200);
    const reset=await a.post(`/api/clinic/employees/${id}/password`).send({initialPassword:'reset-secret-123'});expect(reset.status).toBe(200);expect(reset.body.mustChangePassword).toBe(true);
    expect((await c.get('/api/auth/me')).status).toBe(401);
    expect((await login(agent(),body.email,'staff-personal-123')).status).toBe(401);
    const next=agent();expect((await login(next,body.email,'reset-secret-123')).body.user.mustChangePassword).toBe(true);
    expect((await next.get('/api/me/clinic')).status).toBe(403);
    expect((await next.post('/api/auth/change-password').send({currentPassword:'reset-secret-123',newPassword:'another-personal-123'})).status).toBe(200);
  });
  it("deactivation invalidates existing sessions",async()=>{
    const u=await fx.createUser({clinicId:clinicA,role:'other_staff',permissions:['customers.read']});const c=agent();await login(c,u.email,u.password);
    expect((await a.patch(`/api/clinic/employees/${u.id}/active`).send({isActive:false})).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(401);expect((await login(agent(),u.email,u.password)).status).toBe(401);
  });
  it("read permissions cannot write and customer sensitive notes are omitted",async()=>{
    const u=await fx.createUser({clinicId:clinicA,role:'other_staff',permissions:['customers.read','services.read']});const c=agent();await login(c,u.email,u.password);
    const detail=await c.get(`/api/clinic/customers/${customerA}`);expect(detail.status).toBe(200);expect(detail.body.item.notes).toBe('Call after noon');expect('sensitiveNotes' in detail.body.item).toBe(false);
    expect((await c.put(`/api/clinic/customers/${customerA}`).send(customerBody(branchA))).status).toBe(403);
    expect((await c.post('/api/clinic/services').send(serviceBody(branchA))).status).toBe(403);
    expect((await c.get('/api/clinic/employees')).status).toBe(403);
    const labels=await c.get('/api/clinic/options?for=services');expect(labels.status).toBe(200);for(const e of labels.body.employees){expect(e.email).toBeUndefined();expect(e.permissions).toBeUndefined();expect(e.passwordHash).toBeUndefined();}
  });
  it("records sensitive-note access without putting note content in the audit event",async()=>{
    expect((await a.get(`/api/clinic/customers/${customerA}`)).body.item.sensitiveNotes).toBe('Restricted test note');
    const events=await db.select().from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinicA),eq(auditEventsTable.action,'customer.sensitive_notes_read'),eq(auditEventsTable.entityId,customerA)));
    expect(events.length).toBeGreaterThan(0);expect(JSON.stringify(events)).not.toContain('Restricted test note');
  });
});

describe("Phase 2 validation, persistence and checklist",()=>{
  it("creates a main service with subservices together and rolls back invalid batches",async()=>{
    const definition={...createDefinition('custom','ar'),section:'الليزر',medicalScope:'medical' as const};
    const first={...serviceBody(branchA,[employeeA]),name:'ليزر الوجه',nameLang:'ar',definition};
    const second={...serviceBody(branchA,[employeeA]),name:'ليزر اليدين',nameLang:'ar',definition};
    const created=await a.post('/api/clinic/services/batch').send({services:[first,second]});
    expect(created.status).toBe(201);expect(created.body.ids).toHaveLength(2);
    const saved=await db.select().from(servicesTable).where(eq(servicesTable.clinicId,clinicA));
    expect(saved.filter(row=>created.body.ids.includes(row.id)).map(row=>row.name).sort()).toEqual(['ليزر اليدين','ليزر الوجه'].sort());
    const before=saved.length;
    const invalid=await a.post('/api/clinic/services/batch').send({services:[first,{...second,employeeIds:[employeeB]}]});
    expect(invalid.status).toBe(404);
    expect((await db.select().from(servicesTable).where(eq(servicesTable.clinicId,clinicA))).length).toBe(before);
  });
  it("persists split hours and the entered name language",async()=>{const body={...branchBody('فرع عربي'),nameLang:'ar'};const r=await a.post('/api/clinic/branches').send(body);expect(r.status).toBe(201);const found=await a.get(`/api/clinic/branches/${r.body.item.id}`);expect(found.body.item.name).toBe('فرع عربي');expect(found.body.item.nameLang).toBe('ar');expect(found.body.item.openingHours.mon).toHaveLength(2);});
  it("rejects overlap and invalid time zones",async()=>{
    expect((await a.post('/api/clinic/branches').send({...branchBody(),timeZone:'Invalid/Planet'})).status).toBe(400);
    expect((await a.post('/api/clinic/branches').send({...branchBody(),openingHours:{...hours,mon:[{open:'09:00',close:'14:00'},{open:'13:00',close:'17:00'}]}})).status).toBe(400);
  });
  it("rejects invalid category, duration, currency and negative price",async()=>{for(const change of [{category:'Invented'},{durationMinutes:0},{currency:'XYZ'},{price:'-1'}])expect((await a.post('/api/clinic/services').send({...serviceBody(branchA),...change})).status).toBe(400);});
  it("rejects customer without a contact method",async()=>expect((await a.post('/api/clinic/customers').send({...customerBody(branchA),phone:'',email:null})).status).toBe(400));
  it("rejects breaks outside working hours and invalid time off",async()=>{
    expect((await a.post('/api/clinic/employees').send({...employeeBody(branchA),breaks:{...empty(),mon:[{open:'08:00',close:'09:00'}]}})).status).toBe(400);
    expect((await a.post('/api/clinic/employees').send({...employeeBody(branchA),timeOff:[{startsAt:'2026-10-01T11:00:00Z',endsAt:'2026-10-01T10:00:00Z',note:''}] })).status).toBe(400);
  });
  it("does not fabricate history or inventory usage",async()=>{
    const service=await a.get(`/api/clinic/services/${serviceA}`);expect(service.body.item.actualConsumption).toEqual([]);expect(service.body.item.actualConsumptionAvailable).toBe(false);
    const customer=await a.get(`/api/clinic/customers/${customerA}`);expect(customer.body.item.historyAvailable).toBe(true);
    const history=await a.get(`/api/clinic/customers/${customerA}/appointments`);expect(history.status).toBe(200);expect(history.body.items).toEqual([]);
  });
  it("validates branch compatibility within the same clinic",async()=>{
    const branch=await a.post('/api/clinic/branches').send(branchBody('Another branch'));const id=branch.body.item.id;
    expect((await a.post('/api/clinic/rooms').send(roomBody(id,[serviceA]))).body.error).toBe('branch_mismatch');
    expect((await a.post('/api/clinic/services').send(serviceBody(id,[employeeA]))).body.error).toBe('branch_mismatch');
  });
  it("maintains assignments from the employee editor",async()=>{
    const body=employeeBody(branchA,[serviceA]),created=await a.post('/api/clinic/employees').send(body),id=created.body.item.id;
    expect(created.status).toBe(201);const before=await a.get(`/api/clinic/services/${serviceA}`);expect(before.body.item.employeeIds).toContain(id);
    const {initialPassword,...edit}=body;expect((await a.put(`/api/clinic/employees/${id}`).send({...edit,serviceIds:[]})).status).toBe(200);
    const links=await db.select().from(serviceEmployeesTable).where(eq(serviceEmployeesTable.employeeId,id));expect(links).toHaveLength(0);
  });
  it("searches customer name, phone and email and paginates",async()=>{
    const mark=`Paging${Date.now()}`;
    for(let i=0;i<23;i++)expect((await a.post('/api/clinic/customers').send({...customerBody(branchA),name:`${mark} ${String(i).padStart(2,'0')}`,phone:`+962791234${String(i).padStart(3,'0')}`,email:`${mark.toLowerCase()}.${i}@test.local`})).status).toBe(201);
    const first=await a.get('/api/clinic/customers').query({search:mark,page:1,pageSize:20}),second=await a.get('/api/clinic/customers').query({search:mark,page:2,pageSize:20});
    expect(first.body.total).toBe(23);expect(first.body.items).toHaveLength(20);expect(second.body.items).toHaveLength(3);
    expect(first.body.items.some((r:{id:number})=>second.body.items.some((v:{id:number})=>v.id===r.id))).toBe(false);
    expect((await a.get('/api/clinic/customers').query({search:'+962791234000'})).body.items.length).toBe(1);
    expect((await a.get('/api/clinic/customers').query({search:`${mark.toLowerCase()}.0@test.local`})).body.items.length).toBe(1);
    expect(first.body.items[0].sensitiveNotes).toBeUndefined();
  });
  it("uses real setup data and leaves first booking incomplete in Phase 2",async()=>{
    const r=await a.get('/api/me/clinic');expect(r.status).toBe(200);expect(r.body.clinic.progress).toMatchObject({hasBranchHours:true,hasCatalog:true,hasStaff:true,hasFirstAppointment:false});
  });
});
