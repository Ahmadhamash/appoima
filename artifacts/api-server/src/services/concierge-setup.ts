import { activeBranch, activeEmployee } from './branch-scope';
/** Allowlisted setup apply. Runs inside ONE caller-owned clinic-locked DB transaction. */
import { normalizeServiceName } from '@workspace/service-definition';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, branchesTable, servicesTable, roomsTable, usersTable, serviceEmployeesTable, roomServicesTable, type User } from '@workspace/db';
import { ROLE_PRESETS, ALL_PERMISSIONS, hasPermission } from '../domain/permissions';
import { withinGrantCeiling, compatibleBranch } from '../domain/setup-rules';
import { branchSchema, serviceSchema, roomSchema, newEmployeeSchema } from '../domain/setup-validation';
import { parseDraft, withDefaultStaffHours, draftIssues, nameLanguage, type Draft, type Issue } from '../domain/concierge-core';
import { badRequest, forbidden, conflict } from '../lib/errors';
import { validateStaffSchedules } from './staff-schedules';
import { staffScheduleIssue,staffWorksAt } from '../domain/staff-branches';
import { createStaffAccount } from './auth';
import { recordAudit } from './audit';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StaffProvision = {key:string;initialPassword:string;permissions:string[]};
const language=(r:{name:string|null;nameLang:'en'|'ar'|null})=>r.nameLang??nameLanguage(r.name??'');
const preset=(actor:User,role:keyof typeof ROLE_PRESETS)=>ROLE_PRESETS[role].filter(p=>actor.permissions.includes(p));
function parseIssues(key:string,result:{success:boolean;error?:{issues:{path:(string|number)[];message:string}[]}}):Issue[]{return result.success?[]:(result.error?.issues??[]).map(i=>({key,field:i.path.join('.'),code:i.message}));}
export function previewConciergeSetup(actor:User,draft:Draft) {
  const issues:Issue[]=[];
  for(const b of draft.branches)issues.push(...parseIssues(b.key,branchSchema.safeParse({name:b.name,nameLang:language(b),timeZone:b.timeZone,openingHours:b.openingHours})));
  for(const s of draft.services)issues.push(...parseIssues(s.key,serviceSchema.safeParse({name:s.name,nameLang:language(s),branchId:null,durationMinutes:s.durationMinutes,price:s.price,currency:s.currency,category:s.category,requiresRoom:s.requiresRoom,followUpEnabled:s.followUpEnabled ?? false,isActive:true,employeeIds:s.employeeIds??[],definition:s.definition??null})));
  for(const r of draft.rooms)issues.push(...parseIssues(r.key,roomSchema.safeParse({name:r.name,nameLang:language(r),branchId:1,capacity:r.capacity,status:'available',serviceIds:[]})));
  for(const p of draft.staff)issues.push(...parseIssues(p.key,newEmployeeSchema.safeParse({name:p.name,nameLang:language(p),email:p.email,phone:p.phone,jobTitle:p.jobTitle,role:p.role,branchId:null,workingHours:p.workingHours,breaks:p.breaks,serviceIds:[],permissions:p.role?preset(actor,p.role):[],initialPassword:'Validation-only-placeholder-NEVER-stored',isActive:true,timeOff:[]})));
  for(const [kind,permission] of Object.entries({branches:'settings.manage',services:'services.manage',rooms:'rooms.manage',staff:'employees.manage'} as const))if(draft[kind as keyof Draft].length&&!hasPermission(actor,permission))issues.push({key:kind,field:'permission',code:'forbidden'});
  const branchIds=new Map(draft.branches.map((b,i)=>[b.key,i+1]));
  for(const p of draft.staff)if(p.branchSchedules?.length){const problem=staffScheduleIssue(p.branchSchedules.map(s=>({...s,branchId:branchIds.get(s.branchKey)??0})),draft.branches.map((b,i)=>({id:i+1,timeZone:b.timeZone??'Asia/Amman'})));if(problem&&problem!=='invalid_reference')issues.push({key:p.key,field:'branchSchedules',code:problem});}
  return {issues,staffAccess:draft.staff.map(p=>({key:p.key,permissions:p.role?preset(actor,p.role):[]})),grantablePermissions:ALL_PERMISSIONS.filter(p=>actor.permissions.includes(p))};
}
export async function applyConciergeSetup(tx:Tx,actor:User,raw:Draft,basis:Record<string,string>,provision:StaffProvision[]) {
  let draft=parseDraft(raw);const clinicId=actor.clinicId!;
  if(actor.role!=='manager'||!clinicId)throw forbidden();
  for(const [kind,permission] of Object.entries({branches:'settings.manage',services:'services.manage',rooms:'rooms.manage',staff:'employees.manage'} as const))if(draft[kind as keyof Draft].length&&!hasPermission(actor,permission))throw forbidden();
  const existingBranches=await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)));
  draft=withDefaultStaffHours(draft,existingBranches.map(b=>({...b,key:`branch_${b.id}`})));
  const existingServices=await tx.select().from(servicesTable).where(and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId)));
  const branchMap=new Map(existingBranches.map(b=>[`branch_${b.id}`,b.id]));
  const serviceMap=new Map(existingServices.map(s=>[`existing_service_${s.id}`,{id:s.id,branchId:s.branchId}]));
  if(draftIssues(draft,[...branchMap.keys()],[...serviceMap.keys()]).length||previewConciergeSetup(actor,draft).issues.length)throw badRequest('concierge_missing_fields');
  if(provision.length!==draft.staff.length||new Set(provision.map(p=>p.key)).size!==provision.length||provision.some(p=>!draft.staff.some(s=>s.key===p.key)))throw badRequest('concierge_staff_passwords');
  for(const p of provision){if(p.initialPassword.length<10||p.initialPassword.length>200||!withinGrantCeiling(actor.permissions,p.permissions)||p.permissions.some(k=>!ALL_PERMISSIONS.includes(k as typeof ALL_PERMISSIONS[number]))||new Set(p.permissions).size!==p.permissions.length)throw forbidden('permission_escalation');}
  const out:Record<string,number[]>={branches:[],services:[],rooms:[],staff:[]};
  const audit=async(action:string,entityType:string,id:number)=>recordAudit({clinicId,actorUserId:actor.id,action,entityType,entityId:id,details:{source:'manager_concierge_confirmed'}},tx);
  const resolveBranch=(key:string|null):number|null=>{if(key===null)return null;const id=branchMap.get(key);if(!id)throw badRequest('concierge_invalid_reference');return id;};
  const resolveServices=(keys:string[],branchId:number|null)=>keys.map(key=>{const s=serviceMap.get(key);if(!s)throw badRequest('concierge_invalid_reference');if(!compatibleBranch(s.branchId,branchId))throw badRequest('branch_mismatch');return s.id;});
  for(const b of draft.branches){
    const fields=branchSchema.parse({... (b.address!==undefined?{address:b.address}:{}),... (b.mapUrl!==undefined?{mapUrl:b.mapUrl}:{}),name:b.name,nameLang:language(b),timeZone:b.timeZone,openingHours:b.openingHours});let id:number;
    if(b.existingId!==null){
      const existing=existingBranches.find(x=>x.id===b.existingId);if(!existing)throw forbidden('concierge_invalid_reference');
      const actual=createHash('sha256').update(JSON.stringify({name:existing.name,nameLang:existing.nameLang,timeZone:existing.timeZone,openingHours:existing.openingHours})).digest('hex');
      if(basis[String(existing.id)]!==actual)throw conflict('concierge_branch_changed');
      await tx.update(branchesTable).set(fields).where(and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,existing.id)));id=existing.id;
    }else{
      if(branchMap.has(b.key))throw badRequest('concierge_invalid_reference');
      const [duplicate]=await tx.select({id:branchesTable.id}).from(branchesTable).where(and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),sql`lower(trim(${branchesTable.name})) = lower(${fields.name})`)).limit(1);if(duplicate)throw conflict('concierge_duplicate');
      const [created]=await tx.insert(branchesTable).values({...fields,clinicId}).returning({id:branchesTable.id});id=created!.id;
    }
    branchMap.set(b.key,id);out.branches!.push(id);await audit(b.existingId?'branch.updated':'branch.created','branch',id);
  }
  for(const s of draft.services){
    if(serviceMap.has(s.key))throw badRequest('concierge_invalid_reference');
    const input=serviceSchema.parse({name:s.name,nameLang:language(s),branchId:resolveBranch(s.branchKey),durationMinutes:s.durationMinutes,price:s.price,currency:s.currency,category:s.category,requiresRoom:s.requiresRoom,followUpEnabled:s.followUpEnabled ?? false,isActive:true,employeeIds:s.employeeIds??[],definition:s.definition??null});
    if(existingServices.some(v=>v.branchId===input.branchId&&normalizeServiceName(v.name)===normalizeServiceName(input.name)))throw conflict('concierge_duplicate');
    const [duplicate]=await tx.select({id:servicesTable.id}).from(servicesTable).where(and(and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId)),sql`lower(trim(${servicesTable.name})) = lower(${input.name})`,input.branchId===null?sql`${servicesTable.branchId} is null`:eq(servicesTable.branchId,input.branchId))).limit(1);if(duplicate)throw conflict('concierge_duplicate');
    const {employeeIds,...fields}=input;const [created]=await tx.insert(servicesTable).values({...fields,clinicId}).returning();
    // IDs supplied by the model/client are untrusted; resolve them in this clinic transaction.
    if(employeeIds.length){
      const employees=await tx.select({id:usersTable.id,branchId:usersTable.branchId,branchSchedules:usersTable.branchSchedules,isActive:usersTable.isActive}).from(usersTable).where(and(eq(usersTable.clinicId,clinicId), activeEmployee()));
      for(const id of employeeIds){const employee=employees.find(e=>e.id===id);if(!employee?.isActive||(input.branchId!==null&&!staffWorksAt(employee,input.branchId)))throw badRequest('concierge_invalid_reference');}
      await tx.insert(serviceEmployeesTable).values(employeeIds.map(employeeId=>({clinicId,serviceId:created!.id,employeeId})));
    }
    if(s.roomIds?.length){
      if(!hasPermission(actor,'rooms.manage'))throw forbidden();
      const rooms=await tx.select({id:roomsTable.id,branchId:roomsTable.branchId,status:roomsTable.status}).from(roomsTable).where(and(eq(roomsTable.clinicId,clinicId), activeBranch(roomsTable.branchId)));
      for(const id of s.roomIds){const room=rooms.find(r=>r.id===id);if(!room||room.status!=='available'||!compatibleBranch(input.branchId,room.branchId))throw badRequest('concierge_invalid_reference');}
      await tx.insert(roomServicesTable).values(s.roomIds.map(roomId=>({clinicId,serviceId:created!.id,roomId})));
    }
    serviceMap.set(s.key,{id:created!.id,branchId:created!.branchId});out.services!.push(created!.id);await audit('service.created','service',created!.id);
  }
  for(const r of draft.rooms){
    const branchId=resolveBranch(r.branchKey);if(!branchId)throw badRequest('concierge_invalid_reference');
    const input=roomSchema.parse({name:r.name,nameLang:language(r),branchId,capacity:r.capacity,status:'available',serviceIds:resolveServices(r.serviceKeys!,branchId)});
    const [duplicate]=await tx.select({id:roomsTable.id}).from(roomsTable).where(and(and(eq(roomsTable.clinicId,clinicId), activeBranch(roomsTable.branchId)),eq(roomsTable.branchId,branchId),sql`lower(trim(${roomsTable.name})) = lower(${input.name})`)).limit(1);if(duplicate)throw conflict('concierge_duplicate');
    const {serviceIds,...fields}=input;const [created]=await tx.insert(roomsTable).values({...fields,clinicId}).returning({id:roomsTable.id});
    if(serviceIds.length)await tx.insert(roomServicesTable).values(serviceIds.map(serviceId=>({clinicId,roomId:created!.id,serviceId})));
    out.rooms!.push(created!.id);await audit('room.created','room',created!.id);
  }
  for(const p of draft.staff){
    const secure=provision.find(x=>x.key===p.key)!;
    const schedules=p.branchSchedules?.map(s=>({branchId:resolveBranch(s.branchKey)!,workingHours:s.workingHours,breaks:s.breaks}));
    if(schedules)await validateStaffSchedules(tx,clinicId,schedules);
    const branchId=schedules?.length===1?schedules[0]!.branchId:schedules?.length?null:resolveBranch(p.branchKey);
    const selectedBranches=schedules?.map(s=>s.branchId);
    for(const key of p.serviceKeys??[]){const service=serviceMap.get(key);if(service?.branchId!==null&&service?.branchId!==undefined&&selectedBranches&&!selectedBranches.includes(service.branchId))throw badRequest('branch_mismatch');}
    const input=newEmployeeSchema.parse({name:p.name,nameLang:language(p),email:p.email,phone:p.phone,jobTitle:p.jobTitle,branchId,branchSchedules:schedules,role:p.role,workingHours:p.workingHours,breaks:p.breaks,serviceIds:resolveServices(p.serviceKeys!,branchId),permissions:secure.permissions,initialPassword:secure.initialPassword,isActive:true,timeOff:[]});
    const created=await createStaffAccount({...input,clinicId,actorUserId:actor.id},tx);
    await tx.update(usersTable).set({branchSchedules:schedules??(branchId?[{branchId,workingHours:input.workingHours!,breaks:input.breaks}]:[]),workingHours:input.workingHours,breaks:input.breaks,timeOff:[]}).where(and(eq(usersTable.id,created.id),and(eq(usersTable.clinicId,clinicId), activeEmployee())));
    if(input.serviceIds.length)await tx.insert(serviceEmployeesTable).values(input.serviceIds.map(serviceId=>({clinicId,employeeId:created.id,serviceId})));
    out.staff!.push(created.id);
  }
  return out;
}
