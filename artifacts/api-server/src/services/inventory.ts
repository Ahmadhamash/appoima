import {itemBatches,batchExpirySQL} from './inventory-batches';
import {saveInventoryServiceUsage,readInventoryServiceUsage} from './inventory-service-usage';
import {syncAppointmentInvoice} from './packages';
import {inventorySettingsInTx,inventoryBranches,productBreakdowns,locationBalance,validateInventoryLocation,stockMilli} from './inventory-locations';
import { createHash } from 'node:crypto';
import {inventoryBillingExtraSchema} from '../domain/operations-validation';
import {resolveProductCharges} from './patient-billing';
import { and, asc, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import { db, branchesTable, roomsTable, inventoryProductsTable, serviceMaterialCostsTable, inventoryItemsTable, inventoryMovementsTable, inventoryConsumptionsTable, inventoryPurchaseOrdersTable, appointmentsTable, servicesTable, usersTable, type User, type Appointment } from '@workspace/db';
import { hasPermission } from '../domain/permissions';
import { canonicalJson, canReadAppointment } from '../domain/scheduling-rules';
import { canRecordConsumption, normalizedLines, quantityMilli, quantityString } from '../domain/operations-rules';
import type { InventoryCreateInput, InventoryListInput, InventoryUpdateInput, MovementInput, ConsumptionPayload } from '../domain/operations-validation';
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
    return {services:await tx.select({id:servicesTable.id,name:servicesTable.name,nameLang:servicesTable.nameLang,branchId:servicesTable.branchId}).from(servicesTable).where(and(eq(servicesTable.clinicId,operatingClinic(fresh)),eq(servicesTable.isActive,true))).orderBy(asc(servicesTable.name)),movementMode:(await inventorySettingsInTx(tx,operatingClinic(fresh))).movementMode,rooms:await tx.select({id:roomsTable.id,name:roomsTable.name,nameLang:roomsTable.nameLang,branchId:roomsTable.branchId}).from(roomsTable).where(eq(roomsTable.clinicId,operatingClinic(fresh))).orderBy(asc(roomsTable.name)),branches:await tx.select({id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone})
      .from(branchesTable).where(eq(branchesTable.clinicId,operatingClinic(fresh))).orderBy(asc(branchesTable.name)),canManage:hasPermission(fresh,'inventory.manage')};
  });
}
export async function createInventoryItem(actor:User,input:InventoryCreateInput) {
  return operationsCommand(actor,'inventory:create',input,async(_tx,fresh)=>requireInventory(fresh,true),async(tx,fresh)=>{
    const clinicId=operatingClinic(fresh),availability=input.availability??'selected';
    const branches=await inventoryBranches(tx,clinicId,availability,input.branchIds??[input.branchId]);
    if(!branches.some(branch=>branch.id===input.branchId)||input.branchStocks?.some(stock=>!branches.some(branch=>branch.id===stock.branchId)))throw badRequest('inventory_branches_required');
    if(input.branchStocks&&quantityMilli(input.initialQuantity)>0n)throw badRequest('invalid_quantity');
    if(input.extra?.sku){const [duplicate]=await tx.select({id:inventoryItemsTable.id}).from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),sql`${inventoryItemsTable.branchId} in (${sql.join(branches.map(branch=>sql`${branch.id}`),sql`,`)})`,sql`lower(${inventoryItemsTable.extra}->>'sku')=lower(${input.extra.sku})`)).limit(1);if(duplicate)throw conflict('duplicate_record');}
    const [product]=await tx.insert(inventoryProductsTable).values({clinicId,name:input.name,nameLang:input.nameLang,unit:input.unit,extra:input.extra??{},availability,createdBy:fresh.id}).returning();
    let id=0;const createdItems:{id:number;branchId:number}[]=[];
    for(const branch of branches){
      const [item]=await tx.insert(inventoryItemsTable).values({clinicId,productId:product!.id,branchId:branch.id,name:input.name,nameLang:input.nameLang,unit:input.unit,extra:input.extra??{},createdBy:fresh.id}).returning();
      createdItems.push({id:item!.id,branchId:branch.id});
      if(branch.id===input.branchId)id=item!.id;
      const quantity=input.branchStocks?.find(stock=>stock.branchId===branch.id)?.quantity??(input.branchStocks?'0':branch.id===input.branchId?input.initialQuantity:'0');
      if(quantityMilli(quantity)>0n)await tx.insert(inventoryMovementsTable).values({clinicId,branchId:branch.id,itemId:item!.id,unit:item!.unit,kind:'receipt',batchExpiryDate:input.branchStocks?.find(stock=>stock.branchId===branch.id)?.expiryDate??(typeof input.extra?.expiryDate==='string'?input.extra.expiryDate:null),quantity:quantityString(quantityMilli(quantity)),reason:'Initial stock',reasonLang:'en',actorId:fresh.id});
    }
    if(input.serviceUsage!==undefined)await saveInventoryServiceUsage(tx,clinicId,createdItems,input.serviceUsage);
    await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.item_created',entityType:'inventory_item',entityId:id,details:{productId:product!.id,availability,branchIds:branches.map(branch=>branch.id)}},tx);return id;
  });
}
export async function listInventory(actor:User,input:InventoryListInput) {
  return withOperations(actor,false,async(tx,fresh)=>{
    requireInventory(fresh);const clinicId=operatingClinic(fresh);
    if(input.roomId){if(!input.branchId)throw badRequest('inventory_room_branch_mismatch');await validateInventoryLocation(tx,clinicId,input.branchId,input.roomId);}
    const location=input.roomId?sql`and m.room_id=${input.roomId}`:input.location==='store'?sql`and m.room_id is null`:sql``;
    const balance=sql`(select coalesce(sum(m.quantity),0) from inventory_movements m where m.clinic_id=${clinicId} and m.item_id=${inventoryItemsTable.id} ${location})`;
    const minimum=sql`coalesce(nullif(${inventoryItemsTable.extra}->>'minimumStock','')::numeric,0)`;
    const expiry=sql`${batchExpirySQL(clinicId,sql`a.item_id=${inventoryItemsTable.id}`)}::date`;
    const pattern=`%${input.search.replace(/[\\%_]/g,'\\$&')}%`;
    const where=and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.isAvailable,1),input.branchId?eq(inventoryItemsTable.branchId,input.branchId):undefined,
      input.search?or(ilike(inventoryItemsTable.name,pattern),sql`${inventoryItemsTable.extra}->>'brand' ilike ${pattern}`,sql`${inventoryItemsTable.extra}->>'sku' ilike ${pattern}`):undefined,
      input.category?sql`${inventoryItemsTable.extra}->>'category' = ${input.category}`:undefined,
      input.status==='out'?sql`${balance}<=0`:input.status==='low'?sql`${balance}>0 and ${balance}<${minimum}`:input.status==='in_stock'?sql`${balance}>0 and (${minimum}=0 or ${balance}>=${minimum})`:input.status==='expired'?sql`${expiry}<current_date`:input.status==='expiring'?sql`${expiry}>=current_date and ${expiry}<=current_date+30`:undefined);
    const items=await tx.select({item:inventoryItemsTable,branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone},
      balance:sql<string>`(select coalesce(sum(m.quantity),0)::text from inventory_movements m where m.clinic_id=${clinicId} and m.item_id=${inventoryItemsTable.id} ${location})`})
      .from(inventoryItemsTable).innerJoin(branchesTable,and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,inventoryItemsTable.branchId)))
      .where(where).orderBy(asc(inventoryItemsTable.name),asc(inventoryItemsTable.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
    const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(inventoryItemsTable).where(where);
    return {items:items.map(({item,...rest})=>({...item,...rest})),total:count!.total,page:input.page,pageSize:input.pageSize,canManage:hasPermission(fresh,'inventory.manage')};
  });
}
export async function inventoryDashboard(actor:User){return withOperations(actor,false,async(tx,fresh)=>{
 requireInventory(fresh);const clinicId=operatingClinic(fresh),today=new Date().toISOString().slice(0,10),soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const rows=await tx.select({item:inventoryItemsTable,expiryDate:batchExpirySQL(clinicId,sql`a.item_id=${inventoryItemsTable.id}`),expiredDate:batchExpirySQL(clinicId,sql`a.item_id=${inventoryItemsTable.id}`,'expired'),expiringDate:batchExpirySQL(clinicId,sql`a.item_id=${inventoryItemsTable.id}`,'expiring'),balance:sql<string>`(select coalesce(sum(m.quantity),0)::text from inventory_movements m where m.clinic_id=${clinicId} and m.item_id=${inventoryItemsTable.id})`})
  .from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.isAvailable,1))).orderBy(asc(inventoryItemsTable.id)).limit(1001);
 const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.isAvailable,1)));
 const items=rows.slice(0,1000).map(({item,balance,expiryDate,expiredDate,expiringDate})=>({expiredDate,expiringDate,id:item.id,name:item.name,nameLang:item.nameLang,branchId:item.branchId,unit:item.unit,extra:{...item.extra,expiryDate} as Record<string,unknown>,balance}));
 const low=items.filter(item=>Number(item.balance)>0&&Number(item.balance)<Number(item.extra['minimumStock']??0));
 const out=items.filter(item=>Number(item.balance)<=0);
 const expired=items.filter(item=>item.expiredDate).map(item=>({...item,extra:{...item.extra,expiryDate:item.expiredDate}}));
 const expiring=items.filter(item=>item.expiringDate).map(item=>({...item,extra:{...item.extra,expiryDate:item.expiringDate}}));
 const [orders]=await tx.select({total:sql<number>`count(*)::int`}).from(inventoryPurchaseOrdersTable).where(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId),sql`${inventoryPurchaseOrdersTable.status} in ('pending','partial')`));
 const [products]=await tx.select({total:sql<number>`count(*)::int`,inStock:sql<number>`(select count(*)::int from (select i.product_id from inventory_items i left join inventory_movements m on m.item_id=i.id and m.clinic_id=i.clinic_id where i.clinic_id=${clinicId} and i.is_available=1 group by i.product_id having coalesce(sum(m.quantity),0)>0) stock)`}).from(inventoryProductsTable).where(eq(inventoryProductsTable.clinicId,clinicId));
 return {total:products!.total,inStock:products!.inStock,low:low.length,out:out.length,expired:expired.length,expiring:expiring.length,pendingOrders:orders!.total,alerts:{low,out,expired,expiring},truncated:count!.total>1000};
});}
export async function inventoryReports(actor:User,from:string,to:string){return withOperations(actor,false,async(tx,fresh)=>{
 requireInventory(fresh);const clinicId=operatingClinic(fresh),start=new Date(`${from}T00:00:00Z`),end=new Date(Date.parse(`${to}T00:00:00Z`)+86400000);
 const items=await tx.select({id:inventoryItemsTable.id,productId:inventoryItemsTable.productId,extra:inventoryItemsTable.extra,balance:sql<string>`(select coalesce(sum(m.quantity),0)::text from inventory_movements m where m.clinic_id=${clinicId} and m.item_id=${inventoryItemsTable.id})`})
  .from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.isAvailable,1))).limit(2000);
 const movements=await tx.select({kind:inventoryMovementsTable.kind,quantity:inventoryMovementsTable.quantity,createdAt:inventoryMovementsTable.createdAt,itemId:inventoryMovementsTable.itemId,reason:inventoryMovementsTable.reason})
  .from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.clinicId,clinicId),gte(inventoryMovementsTable.createdAt,start),lt(inventoryMovementsTable.createdAt,end))).orderBy(desc(inventoryMovementsTable.createdAt)).limit(10000);
 const orders=await tx.select({id:inventoryPurchaseOrdersTable.id,status:inventoryPurchaseOrdersTable.status}).from(inventoryPurchaseOrdersTable)
  .where(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId),gte(inventoryPurchaseOrdersTable.createdAt,start),lt(inventoryPurchaseOrdersTable.createdAt,end))).limit(2000);
 const categories=Object.entries(items.reduce<Record<string,{products:Set<number>;value:number}>>((out,item)=>{const category=String(item.extra['category']||'Other'),row=out[category]??{products:new Set<number>(),value:0};row.products.add(item.productId);row.value+=Number(item.balance)*Number(item.extra['unitCost']??0);out[category]=row;return out;},{}));
 const external=movements.filter(m=>!m.reason.startsWith('Transfer #'));
 return {totalItems:new Set(items.map(item=>item.productId)).size,stockValue:items.reduce((sum,item)=>sum+Number(item.balance)*Number(item.extra['unitCost']??0),0),
  receipts:external.filter(m=>m.kind==='receipt').reduce((sum,m)=>sum+Number(m.quantity),0),
  usage:external.filter(m=>m.kind==='consumption'||m.kind==='adjustment'&&Number(m.quantity)<0).reduce((sum,m)=>sum-Math.min(0,Number(m.quantity)),0),
  adjustments:external.filter(m=>m.kind==='adjustment').length,purchaseOrders:orders.length,categories:categories.map(([name,values])=>({name,count:values.products.size,value:values.value})),movements:movements.slice(0,200),truncated:items.length===2000||movements.length===10000||orders.length===2000};
});}
export async function updateInventoryItem(actor:User,id:number,input:InventoryUpdateInput){return withOperations(actor,true,async(tx,fresh)=>{
 requireInventory(fresh,true);const clinicId=operatingClinic(fresh),item=await findItem(tx,fresh,id);
 const extra=inventoryBillingExtraSchema.parse({...item.extra,...input.extra});
 if(extra['sku']){const [duplicate]=await tx.select({id:inventoryItemsTable.id}).from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),sql`${inventoryItemsTable.branchId} in (select branch_id from inventory_items where clinic_id=${clinicId} and product_id=${item.productId})`,sql`lower(${inventoryItemsTable.extra}->>'sku')=lower(${String(extra['sku'])})`,sql`${inventoryItemsTable.productId}<>${item.productId}`)).limit(1);if(duplicate)throw conflict('duplicate_record');}
 await tx.update(inventoryItemsTable).set({extra}).where(and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.productId,item.productId)));
 await tx.update(inventoryProductsTable).set({extra}).where(and(eq(inventoryProductsTable.clinicId,clinicId),eq(inventoryProductsTable.id,item.productId)));
 if(input.serviceUsage!==undefined)await saveInventoryServiceUsage(tx,clinicId,[item],input.serviceUsage);
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.item_updated',entityType:'inventory_item',entityId:id},tx);
 return {id};
});}
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
    const settings=await inventorySettingsInTx(tx,clinicId),[product]=await tx.select().from(inventoryProductsTable).where(and(eq(inventoryProductsTable.clinicId,clinicId),eq(inventoryProductsTable.id,item.productId)));
    const hierarchy=(await productBreakdowns(tx,clinicId,[item.productId],settings.movementMode==='room')).get(item.productId)??[];
    return {...item,batches:await itemBatches(tx,clinicId,id),serviceUsage:await readInventoryServiceUsage(tx,clinicId,id),movementMode:settings.movementMode,availability:product!.availability,branches:hierarchy,totalQuantity:quantityString(hierarchy.reduce((sum,branch)=>sum+stockMilli(branch.quantity),0n)),branch,balance:quantityString(await balanceFor(tx,clinicId,id)),movements:rows.map(({movement,actor,appointment})=>({...movement,actor,canOpenAppointment:Boolean(appointment&&canReadAppointment(fresh,appointment))})),total:count!.total,page,pageSize,canManage:hasPermission(fresh,'inventory.manage')};
  });
}
export async function recordMovement(actor:User,id:number,input:MovementInput) {
  return operationsCommand(actor,`inventory:movement:${id}`,input,async(tx,fresh)=>{requireInventory(fresh,true);await findItem(tx,fresh,id);},async(tx,fresh)=>{
    const clinicId=operatingClinic(fresh),item=await findItem(tx,fresh,id),quantity=quantityMilli(input.quantity);
    if(input.appointmentReferenceId){
      const [appointment]=await tx.select({id:appointmentsTable.id,branchId:appointmentsTable.branchId}).from(appointmentsTable)
        .where(and(eq(appointmentsTable.clinicId,clinicId),eq(appointmentsTable.id,input.appointmentReferenceId)));
      if(!appointment||appointment.branchId!==item.branchId)throw notFound('appointment_not_found');
    }
    if(item.isAvailable!==1)throw notFound('inventory_item_not_found');
    await validateInventoryLocation(tx,clinicId,item.branchId,input.roomId);
    if(await locationBalance(tx,clinicId,id,input.roomId)+quantity<0n)throw conflict('insufficient_stock');
    const [movement]=await tx.insert(inventoryMovementsTable).values({clinicId,branchId:item.branchId,itemId:id,unit:item.unit,kind:input.kind,batchExpiryDate:quantity>0n?input.expiryDate??null:null,
      roomId:input.roomId,quantity:quantityString(quantity),reason:input.appointmentReferenceId?`${input.reason} (Appointment #${input.appointmentReferenceId})`:input.reason,reasonLang:input.reasonLang,actorId:fresh.id}).returning();
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
  const roomId=(await inventorySettingsInTx(tx,clinicId)).movementMode==='room'?appointment.roomId:null;
  if(!lines.length&&!payload.confirmNoItems)throw badRequest('confirm_consumption_required');
  const payloadHash=createHash('sha256').update(canonicalJson({lines})).digest('hex');
  const [existing]=await tx.select().from(inventoryConsumptionsTable).where(and(eq(inventoryConsumptionsTable.clinicId,clinicId),eq(inventoryConsumptionsTable.appointmentId,appointment.id)));
  if(existing){if(existing.payloadHash!==payloadHash)throw conflict('consumption_locked');return existing.id;}
  // Validate all lines before writing any; a later failure still rolls everything back.
  const prepared=[];
  for(const line of lines){
    const item=await findItem(tx,actor,line.itemId);
    if(item.branchId!==appointment.branchId||item.isAvailable!==1)throw badRequest('inventory_branch_mismatch');
    if(await locationBalance(tx,clinicId,item.id,roomId)<quantityMilli(line.quantity))throw conflict('insufficient_stock');
    prepared.push({item,quantity:quantityString(-quantityMilli(line.quantity))});
  }
  const [record]=await tx.insert(inventoryConsumptionsTable).values({clinicId,branchId:appointment.branchId,appointmentId:appointment.id,
    serviceId:appointment.serviceId,actorId:actor.id,payloadHash,lineCount:prepared.length}).returning();
  for(const {item,quantity} of prepared)await tx.insert(inventoryMovementsTable).values({clinicId,branchId:appointment.branchId,itemId:item.id,unit:item.unit,
    kind:'consumption',roomId,quantity,actorId:actor.id,consumptionId:record!.id,appointmentId:appointment.id,serviceId:appointment.serviceId});
  const productCharges=await resolveProductCharges(tx,clinicId,appointment.branchId,lines,appointment.productCharges,true);
  const priceChanged=canonicalJson(productCharges)!==canonicalJson(appointment.productCharges);
  await tx.update(appointmentsTable).set({productCharges,productChargesBasis:'actual',...(priceChanged?{version:sql`${appointmentsTable.version}+1`}:{}),updatedAt:new Date()}).where(and(eq(appointmentsTable.clinicId,clinicId),eq(appointmentsTable.id,appointment.id)));
  await syncAppointmentInvoice(tx,actor,{...appointment,productCharges});
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
    const defaults=record?[]:await tx.select({id:inventoryItemsTable.id,name:inventoryItemsTable.name,nameLang:inventoryItemsTable.nameLang,unit:inventoryItemsTable.unit,quantity:serviceMaterialCostsTable.quantity}).from(serviceMaterialCostsTable).innerJoin(inventoryItemsTable,and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.branchId,a.branchId),eq(inventoryItemsTable.id,serviceMaterialCostsTable.itemId),eq(inventoryItemsTable.isAvailable,1))).where(and(eq(serviceMaterialCostsTable.clinicId,clinicId),eq(serviceMaterialCostsTable.branchId,a.branchId),eq(serviceMaterialCostsTable.serviceId,a.serviceId))).orderBy(asc(inventoryItemsTable.name));
    for(const charge of a.productCharges){const existing=defaults.find(line=>line.id===charge.itemId);if(existing)existing.quantity=charge.quantity;else defaults.push({id:charge.itemId,name:charge.name,nameLang:charge.nameLang,unit:charge.unit as (typeof inventoryItemsTable.$inferSelect)['unit'],quantity:charge.quantity});}
    return {defaults,recorded:Boolean(record),recordedAt:record?.createdAt??null,lines,canRecord:a.status==='completed'&&canRecordConsumption(fresh,a)&&!record};
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
