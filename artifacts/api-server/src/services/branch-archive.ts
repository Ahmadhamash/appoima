import { and, eq, desc, sql, type SQL } from 'drizzle-orm';
import { db, branchesTable, usersTable, servicesTable, roomsTable, customersTable, appointmentsTable, inventoryItemsTable, inventoryMovementsTable, inventoryConsumptionsTable, roomBlocksTable, equipmentAssetsTable, inventoryPurchaseOrdersTable, waitingEntriesTable, branchDraftArchivesTable, type User } from '@workspace/db';
import { hasPermission, type Permission } from '../domain/permissions';
import { forbidden, notFound } from '../lib/errors';
import { withOperations, type OperationsTx } from './operations-context';
import { recordAudit } from './audit';
import { normalizeWeek, branchListPage } from '../domain/setup-rules';
import type { BranchPageInput } from '../domain/setup-validation';

const ensureArchiveManager=(actor:User)=>{if(actor.role!=='manager'||!actor.clinicId||!hasPermission(actor,'settings.manage'))throw forbidden();return actor.clinicId;};
export async function archiveBranchInTx(tx:OperationsTx,actor:User,id:number){
 const clinicId=ensureArchiveManager(actor);
 const [branch]=await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,id)));
 if(!branch)throw notFound('record_not_found');
 if(branch.archivedAt)return {id,archivedAt:branch.archivedAt.toISOString()};
 const archivedAt=new Date();
 await tx.update(branchesTable).set({archivedAt}).where(eq(branchesTable.id,id));
 const all=await tx.select().from(branchesTable).where(eq(branchesTable.clinicId,clinicId)),activeIds=new Set(all.filter(b=>!b.archivedAt).map(b=>b.id));
 const staff=await tx.select().from(usersTable).where(and(eq(usersTable.clinicId,clinicId),sql`(${usersTable.branchId}=${id} or exists (select 1 from jsonb_array_elements(${usersTable.branchSchedules}) s where (s->>'branchId')::int=${id}))`));
 for(const person of staff){
  const remaining=person.branchSchedules.filter(s=>activeIds.has(s.branchId));
  const inactive=person.role!=='manager'&&!remaining.length&&(person.branchId===id||person.branchSchedules.length>0);
  const changes={...(person.branchId===id?{branchId:inactive?id:remaining[0]?.branchId??null}:{}),...(inactive?{isActive:false}:{})};
  if(Object.keys(changes).length)await tx.update(usersTable).set(changes).where(eq(usersTable.id,person.id));
  if(inactive)await tx.execute(sql`delete from "session" where sess->>'userId'=${String(person.id)}`);
 }
 await recordAudit({clinicId,actorUserId:actor.id,action:'branch.archived',entityType:'branch',entityId:id,details:{recordsPreserved:true}},tx);
 return {id,archivedAt:archivedAt.toISOString()};
}
export const archiveBranch=(actor:User,id:number)=>withOperations(actor,true,(tx,fresh)=>archiveBranchInTx(tx,fresh,id));
export async function archivedBranches(actor:User,p:BranchPageInput){
 const clinicId=ensureArchiveManager(actor);
 const rows=await db.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),sql`${branchesTable.archivedAt} is not null`)).orderBy(desc(branchesTable.archivedAt));
 return branchListPage(rows.map(row=>({...row,openingHours:normalizeWeek(row.openingHours)})),p);
}
export async function branchArchive(actor:User,id:number,page=1){
 const clinicId=ensureArchiveManager(actor);
 const [branch]=await db.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,id),sql`${branchesTable.archivedAt} is not null`));
 if(!branch)throw notFound('record_not_found');
 const records:Record<string,unknown[]>={},counts:Record<string,number>={};
 const collect=async(key:string,permission:Permission,table:any,condition?:SQL)=>{
  if(!hasPermission(actor,permission))return;
  const where=and(eq(table.clinicId,clinicId),condition??eq(table.branchId,id));
  const [total]=await db.select({n:sql<number>`count(*)::int`}).from(table).where(where);counts[key]=total!.n;
  // Resource pages retain all data; this read-only preview is bounded.
  records[key]=await db.select().from(table).where(where).limit(50).offset((page-1)*50);
 };
 await collect('services','services.read',servicesTable);await collect('rooms','rooms.read',roomsTable);
 if(hasPermission(actor,'customers.read')){
  const where=and(eq(customersTable.clinicId,clinicId),eq(customersTable.branchId,id));
  counts.customers=(await db.select({n:sql<number>`count(*)::int`}).from(customersTable).where(where))[0]!.n;
  records.customers=await db.select({id:customersTable.id,name:customersTable.name,phone:customersTable.phone,email:customersTable.email}).from(customersTable).where(where).limit(50).offset((page-1)*50);
 }
 if(hasPermission(actor,'employees.read')){
  const staff=await db.select({id:usersTable.id,name:usersTable.name,email:usersTable.email,role:usersTable.role,branchSchedules:usersTable.branchSchedules,workingHours:usersTable.workingHours,breaks:usersTable.breaks,isActive:usersTable.isActive}).from(usersTable).where(and(eq(usersTable.clinicId,clinicId),sql`(${usersTable.branchId}=${id} or exists (select 1 from jsonb_array_elements(${usersTable.branchSchedules}) s where (s->>'branchId')::int=${id}))`));
  counts.staff=staff.length;records.staff=staff.slice((page-1)*50,page*50).map(person=>({...person,branchSchedules:person.branchSchedules.filter(s=>s.branchId===id)}));
 }
 await collect('appointments','appointments.read',appointmentsTable);await collect('waitingList','appointments.read',waitingEntriesTable);
 await collect('inventory','inventory.read',inventoryItemsTable);await collect('stockMovements','inventory.read',inventoryMovementsTable);await collect('consumptions','inventory.read',inventoryConsumptionsTable);
 await collect('purchaseOrders','inventory.read',inventoryPurchaseOrdersTable);await collect('equipment','inventory.read',equipmentAssetsTable);await collect('roomBlocks','rooms.read',roomBlocksTable);
 return {branch:{...branch,openingHours:normalizeWeek(branch.openingHours)},counts,records,page,pageSize:50};
}
export async function draftBranchArchives(actor:User){
 const clinicId=ensureArchiveManager(actor);
 const rows=await db.select().from(branchDraftArchivesTable).where(eq(branchDraftArchivesTable.clinicId,clinicId)).orderBy(desc(branchDraftArchivesTable.archivedAt));
 return rows.map(row=>({...row.snapshot,id:row.id}));
}
