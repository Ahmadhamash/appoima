import { createHash } from 'node:crypto';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { db, branchesTable, inventoryItemsTable, inventoryMovementsTable, inventoryConsumptionsTable, appointmentsTable, servicesTable, usersTable, type User, type Appointment } from '@workspace/db';
import { hasPermission } from '../domain/permissions';
import { canonicalJson, canReadAppointment } from '../domain/scheduling-rules';
import { canRecordConsumption, normalizedLines, quantityMilli, quantityString } from '../domain/operations-rules';
import type { InventoryCreateInput, InventoryListInput, MovementInput, ConsumptionPayload } from '../domain/operations-validation';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { recordAudit } from './audit';
import { operatingClinic, withOperations, operationsCommand, type OperationsTx as Tx } from './operations-context';
function requireInventory(actor:User,manage=false) {
  operatingClinic(actor);if(!hasPermission(actor,manage?'inventory.manage':'inventory.read'))throw forbidden();
}
async function findItem(tx:Tx,actor:User,id:number) {
  const [item]=await tx.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,operatingClinic(actor)),eq(inventoryItemsTable.id,id)));
  if(!item)throw notFound('inventory_item_not_found');return item;
}
async function findConsumptionAppointment(tx:Tx,actor:User,id:number) {
  const [a]=await tx.select().from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,operatingClinic(actor)),eq(appointmentsTable.id,id)));
  if(!a||!canReadAppointment(actor,a))throw notFound('appointment_not_found');return a;
}
async function balanceFor(tx:Tx,clinicId:number,itemId:number):Promise<bigint> {
  const [row]=await tx.select({quantity:sql<string>`coalesce(sum(${inventoryMovementsTable.quantity}),0)::text`}).from(inventoryMovementsTable)
    .where(and(eq(inventoryMovementsTable.clinicId,clinicId),eq(inventoryMovementsTable.itemId,itemId)));
  // SUM can exceed an individual movement's range; parse exact 3-decimal SQL output without imposing the input cap.
  const [whole,fraction='']=row!.quantity.split('.');return BigInt(whole!)*1000n+BigInt(fraction.padEnd(3,'0'));
}
export async function inventoryCatalog(actor:User) {
  return withOperations(actor,false,async(tx,fresh)=>{requireInventory(fresh);
    return {branches:await tx.select({id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone})
      .from(branchesTable).where(eq(branchesTable.clinicId,operatingClinic(fresh))).orderBy(asc(branchesTable.name)),canManage:hasPermission(fresh,'inventory.manage')};
  });
}
export async function createInventoryItem(actor:User,input:InventoryCreateInput) {
  return operationsCommand(actor,'inventory:create',input,async(_tx,fresh)=>requireInventory(fresh,true),async(tx,fresh)=>{
    const clinicId=operatingClinic(fresh),[branch]=await tx.select({id:branchesTable.id}).from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,input.branchId)));
    if(!branch)throw notFound('record_not_found');
    const [item]=await tx.insert(inventoryItemsTable).values({clinicId,branchId:branch.id,name:input.name,nameLang:input.nameLang,unit:input.unit,createdBy:fresh.id}).returning();
    await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.item_created',entityType:'inventory_item',entityId:item!.id},tx);return item!.id;
  });
}
export async function listInventory(actor:User,input:InventoryListInput) {
  return withOperations(actor,false,async(tx,fresh)=>{
    requireInventory(fresh);const clinicId=operatingClinic(fresh);
    const where=and(eq(inventoryItemsTable.clinicId,clinicId),input.branchId?eq(inventoryItemsTable.branchId,input.branchId):undefined,
      input.search?ilike(inventoryItemsTable.name,`%${input.search.replace(/[\\%_]/g,'\\$&')}%`):undefined);
    const items=await tx.select({item:inventoryItemsTable,branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone},
      balance:sql<string>`(select coalesce(sum(m.quantity),0)::text from inventory_movements m where m.clinic_id=${clinicId} and m.item_id=${inventoryItemsTable.id})`})
      .from(inventoryItemsTable).innerJoin(branchesTable,and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,inventoryItemsTable.branchId)))
      .where(where).orderBy(asc(inventoryItemsTable.name),asc(inventoryItemsTable.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
    const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(inventoryItemsTable).where(where);
    return {items:items.map(({item,...rest})=>({...item,...rest})),total:count!.total,page:input.page,pageSize:input.pageSize,canManage:hasPermission(fresh,'inventory.manage')};
  });
}
export async function inventoryDetail(actor:User,id:number,page:number,pageSize:number) {
  return withOperations(actor,false,async(tx,fresh)=>{
    requireInventory(fresh);const clinicId=operatingClinic(fresh),item=await findItem(tx,fresh,id);
    const [branch]=await tx.select({id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone}).from(branchesTable)
      .where(and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,item.branchId)));
    const rows=await tx.select({movement:inventoryMovementsTable,actor:{id:usersTable.id,name:usersTable.name,nameLang:usersTable.nameLang},
      appointment:{clinicId:appointmentsTable.clinicId,employeeId:appointmentsTable.employeeId,status:appointmentsTable.status}})
      .from(inventoryMovementsTable).innerJoin(usersTable,and(eq(usersTable.clinicId,clinicId),eq(usersTable.id,inventoryMovementsTable.actorId)))
      .leftJoin(appointmentsTable,and(eq(appointmentsTable.clinicId,clinicId),eq(appointmentsTable.id,inventoryMovementsTable.appointmentId)))
      .where(and(eq(inventoryMovementsTable.clinicId,clinicId),eq(inventoryMovementsTable.itemId,id))).orderBy(desc(inventoryMovementsTable.id)).limit(pageSize).offset((page-1)*pageSize);
    const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.clinicId,clinicId),eq(inventoryMovementsTable.itemId,id)));
    return {...item,branch,balance:quantityString(await balanceFor(tx,clinicId,id)),movements:rows.map(({movement,actor,appointment})=>({...movement,actor,canOpenAppointment:Boolean(appointment&&canReadAppointment(fresh,appointment))})),total:count!.total,page,pageSize,canManage:hasPermission(fresh,'inventory.manage')};
  });
}
export async function recordMovement(actor:User,id:number,input:MovementInput) {
  return operationsCommand(actor,`inventory:movement:${id}`,input,async(tx,fresh)=>{requireInventory(fresh,true);await findItem(tx,fresh,id);},async(tx,fresh)=>{
    const clinicId=operatingClinic(fresh),item=await findItem(tx,fresh,id),quantity=quantityMilli(input.quantity);
    if(await balanceFor(tx,clinicId,id)+quantity<0n)throw conflict('insufficient_stock');
    const [movement]=await tx.insert(inventoryMovementsTable).values({clinicId,branchId:item.branchId,itemId:id,unit:item.unit,kind:input.kind,
      quantity:quantityString(quantity),reason:input.reason,reasonLang:input.reasonLang,actorId:fresh.id}).returning();
    await recordAudit({clinicId,actorUserId:fresh.id,action:`inventory.${input.kind}_recorded`,entityType:'inventory_movement',entityId:movement!.id,
      details:{itemId:id,quantity:quantityString(quantity),unit:item.unit,reasonRecorded:Boolean(input.reason)}},tx);return movement!.id;
  });
}
/** Completion status, header and every deduction use the caller's ONE transaction.
 * The immutable header exists even for an explicitly confirmed zero-material service.
 * A semantic replay with a different transport key cannot deduct twice.
 */
export async function recordConsumptionInTx(tx:Tx,actor:User,appointment:Appointment,payload:ConsumptionPayload) {
  if(!canRecordConsumption(actor,appointment))throw forbidden();
  if(appointment.status!=='completed')throw conflict('consumption_requires_completed');
  const clinicId=operatingClinic(actor),lines=normalizedLines(payload.items);
  if(!lines.length&&!payload.confirmNoItems)throw badRequest('confirm_consumption_required');
  const payloadHash=createHash('sha256').update(canonicalJson({lines})).digest('hex');
  const [existing]=await tx.select().from(inventoryConsumptionsTable).where(and(eq(inventoryConsumptionsTable.clinicId,clinicId),eq(inventoryConsumptionsTable.appointmentId,appointment.id)));
  if(existing){if(existing.payloadHash!==payloadHash)throw conflict('consumption_locked');return existing.id;}
  // Validate all lines before writing any; a later failure still rolls everything back.
  const prepared=[];
  for(const line of lines){
    const item=await findItem(tx,actor,line.itemId);
    if(item.branchId!==appointment.branchId)throw badRequest('inventory_branch_mismatch');
    if(await balanceFor(tx,clinicId,item.id)<quantityMilli(line.quantity))throw conflict('insufficient_stock');
    prepared.push({item,quantity:quantityString(-quantityMilli(line.quantity))});
  }
  const [record]=await tx.insert(inventoryConsumptionsTable).values({clinicId,branchId:appointment.branchId,appointmentId:appointment.id,
    serviceId:appointment.serviceId,actorId:actor.id,payloadHash,lineCount:prepared.length}).returning();
  for(const {item,quantity} of prepared)await tx.insert(inventoryMovementsTable).values({clinicId,branchId:appointment.branchId,itemId:item.id,unit:item.unit,
    kind:'consumption',quantity,actorId:actor.id,consumptionId:record!.id,appointmentId:appointment.id,serviceId:appointment.serviceId});
  await recordAudit({clinicId,actorUserId:actor.id,action:'inventory.actual_consumption_recorded',entityType:'appointment',entityId:appointment.id,
    details:{consumptionId:record!.id,itemCount:prepared.length,explicitNoMaterials:prepared.length===0}},tx);return record!.id;
}
export async function recordAppointmentConsumption(actor:User,id:number,input:{idempotencyKey:string;consumption:ConsumptionPayload}) {
  return operationsCommand(actor,`inventory:consumption:${id}`,input,async(tx,fresh)=>{
    const a=await findConsumptionAppointment(tx,fresh,id);if(!canRecordConsumption(fresh,a))throw forbidden();
  },async(tx,fresh)=>{await recordConsumptionInTx(tx,fresh,await findConsumptionAppointment(tx,fresh,id),input.consumption);return id;});
}
export async function appointmentConsumption(actor:User,id:number) {
  return withOperations(actor,false,async(tx,fresh)=>{
    const a=await findConsumptionAppointment(tx,fresh,id);requireInventory(fresh);
    const clinicId=operatingClinic(fresh),[record]=await tx.select().from(inventoryConsumptionsTable).where(and(eq(inventoryConsumptionsTable.clinicId,clinicId),eq(inventoryConsumptionsTable.appointmentId,id)));
    const lines=record?await tx.select({id:inventoryMovementsTable.itemId,name:inventoryItemsTable.name,nameLang:inventoryItemsTable.nameLang,
      unit:inventoryMovementsTable.unit,quantity:sql<string>`(-${inventoryMovementsTable.quantity})::text`}).from(inventoryMovementsTable)
      .innerJoin(inventoryItemsTable,and(eq(inventoryItemsTable.id,inventoryMovementsTable.itemId),eq(inventoryItemsTable.clinicId,clinicId)))
      .where(and(eq(inventoryMovementsTable.clinicId,clinicId),eq(inventoryMovementsTable.consumptionId,record.id))).orderBy(asc(inventoryMovementsTable.itemId)):[];
    return {recorded:Boolean(record),recordedAt:record?.createdAt??null,lines,canRecord:a.status==='completed'&&canRecordConsumption(fresh,a)&&!record};
  });
}
/** No appointment/customer identifiers leave this aggregate, so services.read is sufficient. */
export async function serviceActualUse(actor:User,id:number,page:number,pageSize:number) {
  return withOperations(actor,false,async(tx,fresh)=>{
    if(!hasPermission(fresh,'services.read'))throw forbidden();const clinicId=operatingClinic(fresh);
    const [service]=await tx.select({id:servicesTable.id}).from(servicesTable).where(and(eq(servicesTable.clinicId,clinicId),eq(servicesTable.id,id)));
    if(!service)throw notFound('record_not_found');
    const where=and(eq(inventoryMovementsTable.clinicId,clinicId),eq(inventoryMovementsTable.serviceId,id),eq(inventoryMovementsTable.kind,'consumption'));
    const items=await tx.select({id:inventoryItemsTable.id,name:inventoryItemsTable.name,nameLang:inventoryItemsTable.nameLang,unit:inventoryMovementsTable.unit,
      branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang},quantity:sql<string>`(-sum(${inventoryMovementsTable.quantity}))::text`})
      .from(inventoryMovementsTable).innerJoin(inventoryItemsTable,and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.id,inventoryMovementsTable.itemId)))
      .innerJoin(branchesTable,and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,inventoryMovementsTable.branchId))).where(where)
      .groupBy(inventoryItemsTable.id,inventoryItemsTable.name,inventoryItemsTable.nameLang,inventoryMovementsTable.unit,branchesTable.id,branchesTable.name,branchesTable.nameLang)
      .orderBy(asc(inventoryItemsTable.name),asc(inventoryItemsTable.id)).limit(pageSize).offset((page-1)*pageSize);
    const [count]=await tx.select({total:sql<number>`count(distinct ${inventoryMovementsTable.itemId})::int`}).from(inventoryMovementsTable).where(where);
    return {items,total:count!.total,page,pageSize};
  });
}
export async function verifyInventoryGuards() {
  const result=await db.execute(sql`select c.relname as table_name, t.tgname as name, t.tgenabled as enabled, pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public' and c.relname in ('inventory_movements','inventory_consumptions','inventory_items')`);
  const required:[string,string,string[]][]=[
    ['inventory_movements','inventory_movements_immutable',['BEFORE','UPDATE','DELETE','TRUNCATE','jormall_inventory_immutable']],
    ['inventory_consumptions','inventory_consumptions_immutable',['BEFORE','UPDATE','DELETE','TRUNCATE','jormall_inventory_immutable']],
    ['inventory_movements','inventory_movements_insert_guard',['BEFORE INSERT','jormall_inventory_movement_guard']],
    ['inventory_consumptions','inventory_consumptions_context_guard',['BEFORE INSERT','jormall_inventory_consumption_guard']],
    ['inventory_items','inventory_items_identity_guard',['BEFORE UPDATE','jormall_inventory_item_identity']],
    ['inventory_movements','inventory_movements_lines_guard',['DEFERRABLE INITIALLY DEFERRED','jormall_inventory_lines_guard']],
    ['inventory_consumptions','inventory_consumptions_lines_guard',['DEFERRABLE INITIALLY DEFERRED','jormall_inventory_lines_guard']],
  ];
  for(const [table,name,fragments] of required){const row=result.rows.find(r=>r.table_name===table&&r.name===name);
    if(!row||!['O','A'].includes(String(row.enabled))||!fragments.every(f=>String(row.definition).includes(f)))throw new Error(`Missing or disabled Phase 4 inventory guard: ${name}. Apply/review migrations before starting the API.`);
  }
}
