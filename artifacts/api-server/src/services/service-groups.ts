import {createHash} from 'node:crypto';
import {and,asc,eq,ilike,inArray,isNull,ne,or,sql} from 'drizzle-orm';
import {z} from 'zod';
import {createDefinition} from '@workspace/service-definition';
import {db,servicesTable,serviceEmployeesTable,roomServicesTable,type User} from '@workspace/db';
import {serviceGroupEditSchema,serviceGroupPageSchema} from '../domain/setup-validation';
import {hasPermission} from '../domain/permissions';
import {badRequest,conflict,forbidden,notFound} from '../lib/errors';
import {activeBranch} from './branch-scope';
import {withOperations,operatingClinic,type OperationsTx} from './operations-context';
import {saveServiceInTx} from './setup';
import {recordAudit} from './audit';

// Match the catalog's grouping, including services created before sections were added.
const groupName=sql<string>`coalesce(nullif(${servicesTable.definition}->>'section',''),nullif(${servicesTable.category},''),${servicesTable.name})`;
const liveServices=(clinicId:number)=>and(eq(servicesTable.clinicId,clinicId),activeBranch(servicesTable.branchId),isNull(servicesTable.deletedAt));
function allow(actor:User,manage=false){if(!hasPermission(actor,manage?'services.manage':'services.read'))throw forbidden();}

export async function listServiceGroups(actor:User,p:z.infer<typeof serviceGroupPageSchema>){
  return withOperations(actor,false,async(tx,fresh)=>{
    allow(fresh);const clinicId=operatingClinic(fresh);
    const selected=and(liveServices(clinicId),p.status?eq(servicesTable.isActive,p.status==='active'):undefined,p.pageServiceIds!==undefined?inArray(servicesTable.id,p.pageServiceIds):undefined);
    const matching=()=>tx.select({name:groupName.as('name'),id:sql<number>`min(${servicesTable.id})::int`.as('id'),count:sql<number>`count(*)::int`.as('count')}).from(servicesTable).where(selected).groupBy(groupName).having(p.search?or(ilike(groupName,`%${p.search}%`),sql`bool_or(${ilike(servicesTable.name,`%${p.search}%`)})`):undefined);
    const [serviceSummary]=await tx.select({active:sql<number>`count(*) filter(where ${servicesTable.isActive})::int`,inactive:sql<number>`count(*) filter(where not ${servicesTable.isActive})::int`}).from(servicesTable).where(liveServices(clinicId));
    const summary=matching().as('matching_service_groups');
    const [totals]=await tx.select({total:sql<number>`coalesce(sum(${summary.count}),0)::int`,groupTotal:sql<number>`count(*)::int`}).from(summary);
    const groups=await matching().orderBy(asc(groupName)).limit(p.pageSize).offset((p.page-1)*p.pageSize);
    const rows=groups.length?await tx.select().from(servicesTable).where(and(selected,inArray(groupName,groups.map(group=>group.name)))).orderBy(asc(groupName),asc(servicesTable.name),asc(servicesTable.id)):[];
    const links=rows.length?await tx.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId,clinicId),inArray(serviceEmployeesTable.serviceId,rows.map(row=>row.id)))).orderBy(asc(serviceEmployeesTable.employeeId)):[];
    return {items:rows.map(row=>({...row,employeeIds:links.filter(link=>link.serviceId===row.id).map(link=>link.employeeId),actualConsumptionAvailable:true})),total:totals!.total,page:p.page,pageSize:p.pageSize,serviceSummary,serviceGroupTotal:totals!.groupTotal,serviceGroups:groups.map((group,index)=>({...group,number:(p.page-1)*p.pageSize+index+1}))};
  });
}
async function groupInTx(tx:OperationsTx,clinicId:number,id:number){
  const [anchor]=await tx.select({name:groupName}).from(servicesTable).where(and(liveServices(clinicId),eq(servicesTable.id,id)));
  if(!anchor)throw notFound('record_not_found');
  const rows=await tx.select().from(servicesTable).where(and(liveServices(clinicId),eq(groupName,anchor.name))).orderBy(asc(servicesTable.id));
  const links=await tx.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId,clinicId),inArray(serviceEmployeesTable.serviceId,rows.map(row=>row.id)))).orderBy(asc(serviceEmployeesTable.employeeId));
  const items=rows.map(row=>({...row,employeeIds:links.filter(link=>link.serviceId===row.id).map(link=>link.employeeId)}));
  return {id,name:anchor.name,items,revision:createHash('sha256').update(JSON.stringify({name:anchor.name,items})).digest('hex')};
}
export async function getServiceGroup(actor:User,id:number){
  return withOperations(actor,false,async(tx,fresh)=>{allow(fresh);return groupInTx(tx,operatingClinic(fresh),id);});
}
export async function saveServiceGroup(actor:User,id:number,input:z.infer<typeof serviceGroupEditSchema>){
  return withOperations(actor,true,async(tx,fresh)=>{
    allow(fresh,true);const clinicId=operatingClinic(fresh),group=await groupInTx(tx,clinicId,id);
    if(input.revision!==group.revision)throw conflict('operation_changed');
    const ids=group.items.map(item=>item.id);
    if(input.services.length!==ids.length||input.services.some(item=>!ids.includes(item.id)))throw badRequest('invalid_reference');
    if(input.name!==group.name){const [existing]=await tx.select({id:servicesTable.id}).from(servicesTable).where(and(liveServices(clinicId),eq(groupName,input.name),ne(groupName,group.name))).limit(1);if(existing)throw conflict('duplicate_record');}
    const names=input.services.map(item=>`${item.service.branchId??'all'}:${item.service.name.toLocaleLowerCase()}`);
    if(new Set(names).size!==names.length)throw conflict('duplicate_record');
    for(const item of input.services){
      const original=group.items.find(row=>row.id===item.id)!;
      const definition=item.service.definition??original.definition??{...createDefinition('custom',item.service.nameLang),medicalScope:'medical' as const};
      await saveServiceInTx(tx,clinicId,fresh,{...item.service,definition:{...definition,section:input.name}},item.id);
    }
    await recordAudit({clinicId,actorUserId:fresh.id,action:'service_group.updated',entityType:'service',entityId:id,details:{previousName:group.name,name:input.name,serviceIds:ids}},tx);
    return {id,name:input.name,ids};
  });
}
export async function deleteServiceGroup(actor:User,id:number,revision:string){
  return withOperations(actor,true,async(tx,fresh)=>{
    allow(fresh,true);const clinicId=operatingClinic(fresh),group=await groupInTx(tx,clinicId,id);
    if(revision!==group.revision)throw conflict('operation_changed');
    const ids=group.items.map(item=>item.id),deletedAt=new Date();
    await tx.update(servicesTable).set({deletedAt,isActive:false}).where(and(liveServices(clinicId),inArray(servicesTable.id,ids)));
    await tx.delete(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId,clinicId),inArray(serviceEmployeesTable.serviceId,ids)));
    await tx.delete(roomServicesTable).where(and(eq(roomServicesTable.clinicId,clinicId),inArray(roomServicesTable.serviceId,ids)));
    await recordAudit({clinicId,actorUserId:fresh.id,action:'service_group.deleted',entityType:'service',entityId:id,details:{name:group.name,serviceIds:ids,recordsPreserved:true}},tx);
    return {id,ids,deletedAt:deletedAt.toISOString()};
  });
}
