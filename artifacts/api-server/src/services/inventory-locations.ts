import { activeBranch } from './branch-scope';
import {batchExpirySQL} from './inventory-batches';
import {and,asc,eq,inArray,isNull,sql} from 'drizzle-orm';
import {branchesTable,roomsTable,inventoryProductsTable,inventoryItemsTable,inventoryMovementsTable,inventorySettingsTable,inventoryTransfersTable,inventoryPurchaseOrdersTable,inventoryPurchaseOrderLinesTable,serviceMaterialCostsTable,type User} from '@workspace/db';
import {hasPermission} from '../domain/permissions';
import {quantityMilli,quantityString} from '../domain/operations-rules';
import {badRequest,conflict,forbidden,notFound} from '../lib/errors';
import {recordAudit} from './audit';
import {operatingClinic,withOperations,operationsCommand,type OperationsTx as Tx} from './operations-context';
import type {InventoryListInput} from '../domain/operations-validation';

export async function inventorySettingsInTx(tx:Tx,clinicId:number){
 const [settings]=await tx.select().from(inventorySettingsTable).where(eq(inventorySettingsTable.clinicId,clinicId));
 return settings??{clinicId,movementMode:'branch',version:0};
}
/** SQL stock aggregates are exact and can exceed the cap on a single user-entered movement. */
export function stockMilli(value:string){
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
 const quantity=BigInt(whole!)*1000n+BigInt(fraction.padEnd(3,'0'));return negative?-quantity:quantity;
}
export async function locationBalance(tx:Tx,clinicId:number,itemId:number,roomId:number|null){
 const [row]=await tx.select({value:sql<string>`coalesce(sum(${inventoryMovementsTable.quantity}),0)::text`}).from(inventoryMovementsTable)
  .where(and(and(eq(inventoryMovementsTable.clinicId,clinicId), activeBranch(inventoryMovementsTable.branchId)),eq(inventoryMovementsTable.itemId,itemId),roomId===null?isNull(inventoryMovementsTable.roomId):eq(inventoryMovementsTable.roomId,roomId)));
 // Aggregates may exceed the maximum allowed for a single movement.
 return stockMilli(row!.value);
}
export async function validateInventoryLocation(tx:Tx,clinicId:number,branchId:number,roomId:number|null){
 if(roomId===null)return;
 if((await inventorySettingsInTx(tx,clinicId)).movementMode!=='room')throw badRequest('inventory_room_tracking_disabled');
 const [room]=await tx.select({id:roomsTable.id}).from(roomsTable).where(and(and(eq(roomsTable.clinicId,clinicId), activeBranch(roomsTable.branchId)),eq(roomsTable.branchId,branchId),eq(roomsTable.id,roomId)));
 if(!room)throw badRequest('inventory_room_branch_mismatch');
}
export async function inventoryBranches(tx:Tx,clinicId:number,availability:'all'|'selected',branchIds:number[]){
 const branches=await tx.select().from(branchesTable).where(and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),availability==='selected'?inArray(branchesTable.id,branchIds):undefined)).orderBy(asc(branchesTable.id));
 if(!branches.length||availability==='selected'&&branches.length!==branchIds.length)throw badRequest('inventory_branches_required');
 return branches;
}
export async function productBreakdowns(tx:Tx,clinicId:number,productIds:number[],roomTracking:boolean){
 if(!productIds.length)return new Map<number,Awaited<ReturnType<typeof branchBreakdown>>[]>();
 const rows=await tx.select({item:inventoryItemsTable,branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone}}).from(inventoryItemsTable)
  .innerJoin(branchesTable,and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,inventoryItemsTable.branchId)))
  .where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),inArray(inventoryItemsTable.productId,productIds),eq(inventoryItemsTable.isAvailable,1))).orderBy(asc(branchesTable.name));
 const ids=rows.map(row=>row.item.id);
 const locations=ids.length?await tx.select({itemId:inventoryMovementsTable.itemId,roomId:inventoryMovementsTable.roomId,quantity:sql<string>`sum(${inventoryMovementsTable.quantity})::text`}).from(inventoryMovementsTable)
  .where(and(and(eq(inventoryMovementsTable.clinicId,clinicId), activeBranch(inventoryMovementsTable.branchId)),inArray(inventoryMovementsTable.itemId,ids))).groupBy(inventoryMovementsTable.itemId,inventoryMovementsTable.roomId):[];
 const branchIds=[...new Set(rows.map(row=>row.branch.id))];
 const rooms=roomTracking&&branchIds.length?await tx.select({id:roomsTable.id,name:roomsTable.name,nameLang:roomsTable.nameLang,branchId:roomsTable.branchId}).from(roomsTable).where(and(and(eq(roomsTable.clinicId,clinicId), activeBranch(roomsTable.branchId)),inArray(roomsTable.branchId,branchIds))).orderBy(asc(roomsTable.name)):[];
 const result=new Map<number,Awaited<ReturnType<typeof branchBreakdown>>[]>();
 for(const {item,branch} of rows){const list=result.get(item.productId)??[];list.push(branchBreakdown(item.id,branch,locations.filter(location=>location.itemId===item.id),rooms.filter(room=>room.branchId===branch.id)));result.set(item.productId,list);}
 return result;
}
function branchBreakdown(itemId:number,branch:{id:number;name:string;nameLang:'en'|'ar';timeZone:string},locations:{roomId:number|null;quantity:string}[],rooms:{id:number;name:string;nameLang:'en'|'ar'}[]){
 const total=locations.reduce((sum,location)=>sum+stockMilli(location.quantity),0n);
 return {...branch,itemId,quantity:quantityString(total),storeQuantity:locations.find(location=>location.roomId===null)?.quantity??'0.000',rooms:rooms.map(room=>({...room,quantity:locations.find(location=>location.roomId===room.id)?.quantity??'0.000'}))};
}
export async function inventoryOverview(actor:User,input:InventoryListInput){return withOperations(actor,false,async(tx,fresh)=>{
 if(!hasPermission(fresh,'inventory.read'))throw forbidden();const clinicId=operatingClinic(fresh),settings=await inventorySettingsInTx(tx,clinicId);
 const pattern=`%${input.search.replace(/[\\%_]/g,'\\$&')}%`;
 const total=sql`(select coalesce(sum(m.quantity),0) from inventory_items i left join inventory_movements m on m.clinic_id=i.clinic_id and m.item_id=i.id where i.clinic_id=${clinicId} and i.product_id=${inventoryProductsTable.id} and i.is_available=1 ${input.branchId?sql`and i.branch_id=${input.branchId}`:sql``})`;
 const minimum=sql`coalesce(nullif(${inventoryProductsTable.extra}->>'minimumStock','')::numeric,0)`;
 const expiry=sql`${batchExpirySQL(clinicId,sql`a.item_id in (select id from inventory_items where clinic_id=${clinicId} and product_id=${inventoryProductsTable.id} ${input.branchId?sql`and branch_id=${input.branchId}`:sql``})`)}::date`;
 const where=and(eq(inventoryProductsTable.clinicId,clinicId),sql`exists(select 1 from inventory_items i where i.clinic_id=${clinicId} and i.product_id=${inventoryProductsTable.id} and i.is_available=1 ${input.branchId?sql`and i.branch_id=${input.branchId}`:sql``})`,
  input.search?sql`(${inventoryProductsTable.name} ilike ${pattern} or ${inventoryProductsTable.extra}->>'sku' ilike ${pattern} or ${inventoryProductsTable.extra}->>'brand' ilike ${pattern})`:undefined,
  input.category?sql`${inventoryProductsTable.extra}->>'category'=${input.category}`:undefined,
  input.status==='out'?sql`${total}<=0`:input.status==='low'?sql`${total}>0 and ${total}<${minimum}`:input.status==='in_stock'?sql`${total}>0 and (${minimum}=0 or ${total}>=${minimum})`:input.status==='expired'?sql`${expiry}<current_date`:input.status==='expiring'?sql`${expiry}>=current_date and ${expiry}<=current_date+30`:undefined);
 const products=await tx.select().from(inventoryProductsTable).where(where).orderBy(asc(inventoryProductsTable.name),asc(inventoryProductsTable.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
 const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(inventoryProductsTable).where(where);
 const breakdowns=await productBreakdowns(tx,clinicId,products.map(product=>product.id),settings.movementMode==='room');
 return {items:products.map(product=>{const branches=breakdowns.get(product.id)??[];return {...product,branches,totalQuantity:quantityString(branches.reduce((sum,branch)=>sum+stockMilli(branch.quantity),0n))};}),total:count!.total,page:input.page,pageSize:input.pageSize,movementMode:settings.movementMode,canManage:hasPermission(fresh,'inventory.manage')};
});}
export async function getInventorySettings(actor:User){return withOperations(actor,false,async(tx,fresh)=>{
 if(!hasPermission(fresh,'settings.read'))throw forbidden();return {...await inventorySettingsInTx(tx,operatingClinic(fresh)),canManage:hasPermission(fresh,'settings.manage')};
});}
export async function saveInventorySettings(actor:User,input:{movementMode:'branch'|'room';expectedVersion:number;idempotencyKey:string}){return operationsCommand(actor,'inventory:settings',input,async(_tx,fresh)=>{if(!hasPermission(fresh,'settings.manage'))throw forbidden();},async(tx,fresh)=>{
 const clinicId=operatingClinic(fresh),old=await inventorySettingsInTx(tx,clinicId);if(old.version!==input.expectedVersion)throw conflict('operation_changed');
 // Flatten room stock before disabling tracking. No quantity or historical movement is lost.
 if(old.movementMode==='room'&&input.movementMode==='branch'){
  const locations=await tx.select({itemId:inventoryMovementsTable.itemId,roomId:inventoryMovementsTable.roomId,quantity:sql<string>`sum(${inventoryMovementsTable.quantity})::text`}).from(inventoryMovementsTable)
   .where(and(and(eq(inventoryMovementsTable.clinicId,clinicId), activeBranch(inventoryMovementsTable.branchId)),sql`${inventoryMovementsTable.roomId} is not null`)).groupBy(inventoryMovementsTable.itemId,inventoryMovementsTable.roomId).having(sql`sum(${inventoryMovementsTable.quantity})>0`);
  for(const location of locations){const [item]=await tx.select().from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),eq(inventoryItemsTable.id,location.itemId)));
   const quantity=quantityString(stockMilli(location.quantity));
   const [transfer]=await tx.insert(inventoryTransfersTable).values({clinicId,fromItemId:item!.id,toItemId:item!.id,fromRoomId:location.roomId,toRoomId:null,quantity,notes:'Room tracking disabled: returned to branch store',createdBy:fresh.id}).returning();
   await tx.insert(inventoryMovementsTable).values([{clinicId,branchId:item!.branchId,itemId:item!.id,unit:item!.unit,roomId:location.roomId,kind:'adjustment' as const,transferId:transfer!.id,quantity:quantityString(-stockMilli(quantity)),reason:`Transfer #${transfer!.id}: room tracking disabled`,reasonLang:'en' as const,actorId:fresh.id},
    {clinicId,branchId:item!.branchId,itemId:item!.id,unit:item!.unit,roomId:null,kind:'receipt' as const,transferId:transfer!.id,quantity,reason:`Transfer #${transfer!.id}: room tracking disabled`,reasonLang:'en' as const,actorId:fresh.id}]);
  }
 }
 await tx.insert(inventorySettingsTable).values({clinicId,movementMode:input.movementMode,version:old.version+1}).onConflictDoUpdate({target:inventorySettingsTable.clinicId,set:{movementMode:input.movementMode,version:old.version+1}});
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.settings_updated',entityType:'clinic',entityId:clinicId,details:{before:old.movementMode,after:input.movementMode}},tx);return clinicId;
});}
export async function saveInventoryAvailability(actor:User,productId:number,input:{availability?:'all'|'selected';branchIds?:number[];idempotencyKey:string}){return operationsCommand(actor,`inventory:availability:${productId}`,input,async(_tx,fresh)=>{if(!hasPermission(fresh,'inventory.manage'))throw forbidden();},async(tx,fresh)=>{
 const clinicId=operatingClinic(fresh),[product]=await tx.select().from(inventoryProductsTable).where(and(eq(inventoryProductsTable.clinicId,clinicId),eq(inventoryProductsTable.id,productId)));
 if(!product)throw notFound('inventory_item_not_found');const branches=await inventoryBranches(tx,clinicId,input.availability!,input.branchIds??[]),ids=branches.map(branch=>branch.id);
 const existing=await tx.select().from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),eq(inventoryItemsTable.productId,productId)));
 if(product.extra['sku']){const [duplicate]=await tx.select({id:inventoryItemsTable.id}).from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),inArray(inventoryItemsTable.branchId,ids),sql`${inventoryItemsTable.productId}<>${productId}`,sql`lower(${inventoryItemsTable.extra}->>'sku')=lower(${String(product.extra['sku'])})`)).limit(1);if(duplicate)throw conflict('duplicate_record');}
 for(const item of existing.filter(item=>item.isAvailable===1&&!ids.includes(item.branchId))){
  const [stock]=await tx.select({quantity:sql<string>`coalesce(sum(${inventoryMovementsTable.quantity}),0)::text`}).from(inventoryMovementsTable).where(and(and(eq(inventoryMovementsTable.clinicId,clinicId), activeBranch(inventoryMovementsTable.branchId)),eq(inventoryMovementsTable.itemId,item.id)));
  const [recipe]=await tx.select({id:serviceMaterialCostsTable.itemId}).from(serviceMaterialCostsTable).where(and(and(eq(serviceMaterialCostsTable.clinicId,clinicId), activeBranch(serviceMaterialCostsTable.branchId)),eq(serviceMaterialCostsTable.itemId,item.id))).limit(1);
  const [order]=await tx.select({id:inventoryPurchaseOrdersTable.id}).from(inventoryPurchaseOrderLinesTable).innerJoin(inventoryPurchaseOrdersTable,and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,inventoryPurchaseOrderLinesTable.orderId)))
   .where(and(and(eq(inventoryPurchaseOrderLinesTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrderLinesTable.branchId)),eq(inventoryPurchaseOrderLinesTable.itemId,item.id),inArray(inventoryPurchaseOrdersTable.status,['pending','partial']))).limit(1);
  if(stockMilli(stock!.quantity)>0n||recipe||order)throw conflict('inventory_branch_in_use');
 }
 for(const branch of branches){const item=existing.find(item=>item.branchId===branch.id);if(item)await tx.update(inventoryItemsTable).set({isAvailable:1}).where(eq(inventoryItemsTable.id,item.id));
  else await tx.insert(inventoryItemsTable).values({clinicId,productId,branchId:branch.id,name:product.name,nameLang:product.nameLang,unit:product.unit,extra:product.extra,createdBy:fresh.id});}
 for(const item of existing.filter(item=>!ids.includes(item.branchId)))await tx.update(inventoryItemsTable).set({isAvailable:0}).where(eq(inventoryItemsTable.id,item.id));
 await tx.update(inventoryProductsTable).set({availability:input.availability!}).where(and(eq(inventoryProductsTable.clinicId,clinicId),eq(inventoryProductsTable.id,productId)));
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.availability_updated',entityType:'inventory_product',entityId:productId,details:{availability:input.availability,branchIds:ids}},tx);return productId;
});}
