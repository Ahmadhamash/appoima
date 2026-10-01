import { activeBranch, activeEmployee } from './branch-scope';
import {and,eq,sql,asc} from 'drizzle-orm';
import {db,clinicsTable,clinicWorkspacesTable,managerOnboardingTable,usersTable,servicesTable,type User} from '@workspace/db';
import {defaultWorkspace,parseWorkspaceProfile,type WorkspaceRecord,type WorkspaceDraft} from '@workspace/service-definition';
import {forbidden,conflict,notFound} from '../lib/errors';
import {hasPermission} from '../domain/permissions';
import {recordAudit} from './audit';
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor=Tx|typeof db;
/** Derive tenant exclusively from the authenticated, still-active database user. */
export async function workspaceActor(actor:User,executor:Executor=db,manage=false):Promise<User> {
 if(!actor.clinicId||!actor.isActive||actor.mustChangePassword)throw forbidden();
 const [fresh]=await executor.select().from(usersTable).where(and(eq(usersTable.id,actor.id),and(eq(usersTable.clinicId,actor.clinicId), activeEmployee())));
 const [clinic]=await executor.select().from(clinicsTable).where(eq(clinicsTable.id,actor.clinicId));
 if(!fresh?.isActive||fresh.mustChangePassword||clinic?.status!=='active')throw forbidden();
 if(manage&&(fresh.role!=='manager'||!hasPermission(fresh,'settings.manage')))throw forbidden();
 return fresh;
}
export async function readWorkspace(clinicId:number,executor:Executor=db):Promise<WorkspaceRecord> {
 const [record]=await executor.select().from(clinicWorkspacesTable).where(eq(clinicWorkspacesTable.clinicId,clinicId));
 if(record)return {revision:record.revision,profile:parseWorkspaceProfile(record.profile),sources:record.sources};
 const [clinic]=await executor.select().from(clinicsTable).where(eq(clinicsTable.id,clinicId));
 if(!clinic)throw notFound();
 return defaultWorkspace(clinic.name,clinic.nameLang);
}
export async function getMyWorkspace(actor:User){
 const fresh=await workspaceActor(actor);
 const record=await readWorkspace(fresh.clinicId!);
 // Branch-bound staff never receive other branch services through the dashboard.
 const services=hasPermission(fresh,'services.read')?await db.select({id:servicesTable.id,name:servicesTable.name,definition:servicesTable.definition,branchId:servicesTable.branchId}).from(servicesTable).where(and(and(eq(servicesTable.clinicId,fresh.clinicId!), activeBranch(servicesTable.branchId)),eq(servicesTable.isActive,true),fresh.branchId===null?undefined:sql`(${servicesTable.branchId} is null or ${servicesTable.branchId}=${fresh.branchId})`)).orderBy(asc(servicesTable.id)).limit(201):[];
 const map=new Map<string,{name:string;serviceIds:number[];serviceNames:string[]}>();
 for(const s of services.slice(0,200)){const name=s.definition?.section??'';const group=map.get(name)??{name,serviceIds:[],serviceNames:[]};group.serviceIds.push(s.id);group.serviceNames.push(s.name);map.set(name,group);}
 const [onboarding]=fresh.role==='manager'?await db.select({state:managerOnboardingTable.state}).from(managerOnboardingTable).where(and(eq(managerOnboardingTable.clinicId,fresh.clinicId!),eq(managerOnboardingTable.userId,fresh.id))).limit(1):[];
 const state=onboarding?.state as {importApproved?:boolean;draft?:{services?:{name?:string|null}[]}}|undefined;
 const pendingServices=state?.importApproved?state.draft?.services?.map(item=>item.name?.trim()).filter((name):name is string=>!!name).slice(0,50)??[]:[];
 return {...record,sections:[...map.values()],truncated:services.length>200,pendingServices};
}
/** Caller holds the same tenant setup advisory lock. This transaction includes service apply. */
export async function applyWorkspace(tx:Tx,actor:User,draft:WorkspaceDraft):Promise<WorkspaceRecord> {
 await workspaceActor(actor,tx,true);
 const current=await readWorkspace(actor.clinicId!,tx);
 if(!draft.dirty)return current;
 if(current.revision!==draft.baseRevision)throw conflict('workspace_stale');
 const profile=parseWorkspaceProfile(draft.profile),revision=current.revision+1;
 await tx.insert(clinicWorkspacesTable).values({clinicId:actor.clinicId!,revision,profile,sources:draft.sources}).onConflictDoUpdate({target:clinicWorkspacesTable.clinicId,set:{revision,profile,sources:draft.sources,updatedAt:new Date()}});
 await recordAudit({clinicId:actor.clinicId,actorUserId:actor.id,action:'workspace.identity_saved',entityType:'clinic_workspace',entityId:actor.clinicId!,details:{revision}},tx);
 return {revision,profile,sources:draft.sources};
}
