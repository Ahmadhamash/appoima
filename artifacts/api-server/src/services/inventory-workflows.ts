import { activeBranch } from './branch-scope';
import {and,asc,desc,eq,inArray,sql} from 'drizzle-orm';
import {branchesTable,roomsTable,inventoryItemsTable,inventoryMovementsTable,inventoryPurchaseOrdersTable,inventoryPurchaseOrderLinesTable,inventoryTransfersTable,type User} from '@workspace/db';
import {hasPermission} from '../domain/permissions';
import {quantityMilli,quantityString} from '../domain/operations-rules';
import type {PurchaseOrderCreateInput,PurchaseOrderReceiveInput,TransferStockInput} from '../domain/operations-validation';
import {badRequest,conflict,forbidden,notFound} from '../lib/errors';
import {recordAudit} from './audit';
import {operatingClinic,operationsCommand,withOperations} from './operations-context';
import {locationBalance,validateInventoryLocation} from './inventory-locations';

const authorize=(actor:User,manage=false)=>{if(!hasPermission(actor,manage?'inventory.manage':'inventory.read'))throw forbidden();};
export async function listPurchaseOrders(actor:User,filter:{branchId?:number;status?:string}){return withOperations(actor,false,async(tx,fresh)=>{
 authorize(fresh);const clinicId=operatingClinic(fresh);
 const rows=await tx.select({order:inventoryPurchaseOrdersTable,branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang}})
  .from(inventoryPurchaseOrdersTable).innerJoin(branchesTable,and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,inventoryPurchaseOrdersTable.branchId)))
  .where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),filter.branchId?eq(inventoryPurchaseOrdersTable.branchId,filter.branchId):undefined,filter.status?eq(inventoryPurchaseOrdersTable.status,filter.status):undefined))
  .orderBy(desc(inventoryPurchaseOrdersTable.id)).limit(500);
 const ids=rows.map(row=>row.order.id),lines=ids.length?await tx.select().from(inventoryPurchaseOrderLinesTable).where(and(and(eq(inventoryPurchaseOrderLinesTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrderLinesTable.branchId)),inArray(inventoryPurchaseOrderLinesTable.orderId,ids))):[];
 return {orders:rows.map(({order,branch})=>({...order,branch,lines:lines.filter(line=>line.orderId===order.id),total:lines.filter(line=>line.orderId===order.id).reduce((sum,line)=>sum+Number(line.orderedQuantity)*Number(line.unitCost),0).toFixed(3)})),canManage:hasPermission(fresh,'inventory.manage')};
});}
export async function purchaseOrderDetail(actor:User,id:number){return withOperations(actor,false,async(tx,fresh)=>{
 authorize(fresh);const clinicId=operatingClinic(fresh),[order]=await tx.select().from(inventoryPurchaseOrdersTable).where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,id)));
 if(!order)throw notFound('record_not_found');
 const lines=await tx.select({line:inventoryPurchaseOrderLinesTable,item:{id:inventoryItemsTable.id,name:inventoryItemsTable.name,nameLang:inventoryItemsTable.nameLang,unit:inventoryItemsTable.unit}})
  .from(inventoryPurchaseOrderLinesTable).innerJoin(inventoryItemsTable,and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),eq(inventoryItemsTable.id,inventoryPurchaseOrderLinesTable.itemId)))
  .where(and(and(eq(inventoryPurchaseOrderLinesTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrderLinesTable.branchId)),eq(inventoryPurchaseOrderLinesTable.orderId,id))).orderBy(asc(inventoryPurchaseOrderLinesTable.id));
 return {...order,lines:lines.map(({line,item})=>({...line,item})),canManage:hasPermission(fresh,'inventory.manage')};
});}
export async function createPurchaseOrder(actor:User,input:PurchaseOrderCreateInput){return operationsCommand(actor,'inventory:purchase:create',input,async(_tx,fresh)=>authorize(fresh,true),async(tx,fresh)=>{
 const clinicId=operatingClinic(fresh),[branch]=await tx.select({id:branchesTable.id}).from(branchesTable).where(and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,input.branchId)));
 if(!branch)throw notFound('record_not_found');
 const items=await tx.select({id:inventoryItemsTable.id,branchId:inventoryItemsTable.branchId}).from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),eq(inventoryItemsTable.isAvailable,1),inArray(inventoryItemsTable.id,input.lines.map(line=>line.itemId))));
 if(items.length!==input.lines.length||items.some(item=>item.branchId!==input.branchId))throw badRequest('branch_mismatch');
 const [order]=await tx.insert(inventoryPurchaseOrdersTable).values({clinicId,branchId:input.branchId,supplier:input.supplier,notes:input.notes,createdBy:fresh.id}).returning({id:inventoryPurchaseOrdersTable.id});
 await tx.insert(inventoryPurchaseOrderLinesTable).values(input.lines.map(line=>({clinicId,branchId:input.branchId,orderId:order!.id,itemId:line.itemId,orderedQuantity:quantityString(quantityMilli(line.quantity)),unitCost:line.unitCost})));
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.purchase_order_created',entityType:'inventory_purchase_order',entityId:order!.id,details:{lines:input.lines.length}},tx);
 return order!.id;
});}
export async function receivePurchaseOrder(actor:User,id:number,input:PurchaseOrderReceiveInput){return operationsCommand(actor,`inventory:purchase:receive:${id}`,input,async(tx,fresh)=>{
 authorize(fresh,true);const [order]=await tx.select({id:inventoryPurchaseOrdersTable.id}).from(inventoryPurchaseOrdersTable).where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,operatingClinic(fresh)), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,id)));if(!order)throw notFound('record_not_found');
},async(tx,fresh)=>{
 const clinicId=operatingClinic(fresh),[order]=await tx.select().from(inventoryPurchaseOrdersTable).where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,id)));
 if(!order||order.status==='received'||order.status==='cancelled')throw conflict('operation_changed');
 const lines=await tx.select().from(inventoryPurchaseOrderLinesTable).where(and(and(eq(inventoryPurchaseOrderLinesTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrderLinesTable.branchId)),eq(inventoryPurchaseOrderLinesTable.orderId,id)));
 for(const entry of input.lines){const line=lines.find(item=>item.itemId===entry.itemId);if(!line||quantityMilli(line.receivedQuantity)+quantityMilli(entry.quantity)>quantityMilli(line.orderedQuantity))throw badRequest('invalid_quantity');
  const [item]=await tx.select({unit:inventoryItemsTable.unit}).from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),eq(inventoryItemsTable.id,entry.itemId)));
  await tx.update(inventoryPurchaseOrderLinesTable).set({receivedQuantity:quantityString(quantityMilli(line.receivedQuantity)+quantityMilli(entry.quantity))}).where(eq(inventoryPurchaseOrderLinesTable.id,line.id));
  await tx.insert(inventoryMovementsTable).values({clinicId,branchId:order.branchId,itemId:entry.itemId,unit:item!.unit,kind:'receipt',batchExpiryDate:entry.expiryDate??null,quantity:quantityString(quantityMilli(entry.quantity)),reason:`PO-${id}`,reasonLang:'en',actorId:fresh.id});
  line.receivedQuantity=quantityString(quantityMilli(line.receivedQuantity)+quantityMilli(entry.quantity));
 }
 const complete=lines.every(line=>quantityMilli(line.receivedQuantity)===quantityMilli(line.orderedQuantity));
 await tx.update(inventoryPurchaseOrdersTable).set({status:complete?'received':'partial',receivedAt:complete?new Date():null}).where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,id)));
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.purchase_order_received',entityType:'inventory_purchase_order',entityId:id,details:{lines:input.lines.length,complete}},tx);
 return id;
});}
export async function cancelPurchaseOrder(actor:User,id:number){return withOperations(actor,true,async(tx,fresh)=>{
 authorize(fresh,true);const clinicId=operatingClinic(fresh),[order]=await tx.select().from(inventoryPurchaseOrdersTable).where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,id)));
 if(!order)throw notFound('record_not_found');if(order.status!=='pending')throw conflict('operation_changed');
 await tx.update(inventoryPurchaseOrdersTable).set({status:'cancelled'}).where(and(and(eq(inventoryPurchaseOrdersTable.clinicId,clinicId), activeBranch(inventoryPurchaseOrdersTable.branchId)),eq(inventoryPurchaseOrdersTable.id,id)));
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.purchase_order_cancelled',entityType:'inventory_purchase_order',entityId:id},tx);return {id};
});}
export async function transferStock(actor:User,input:TransferStockInput){return operationsCommand(actor,'inventory:transfer',input,async(_tx,fresh)=>authorize(fresh,true),async(tx,fresh)=>{
 const clinicId=operatingClinic(fresh),items=await tx.select().from(inventoryItemsTable).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),inArray(inventoryItemsTable.id,[input.fromItemId,input.toItemId])));
 const source=items.find(item=>item.id===input.fromItemId),target=items.find(item=>item.id===input.toItemId);
 if(!source||!target||source.isAvailable!==1||target.isAvailable!==1)throw notFound('inventory_item_not_found');
 // Matching legacy branch records remain transferable; new catalog items use their shared product identity.
 if(source.unit!==target.unit||source.productId!==target.productId&&source.name.trim().toLowerCase()!==target.name.trim().toLowerCase())throw badRequest('invalid_transfer');
 await validateInventoryLocation(tx,clinicId,source.branchId,input.fromRoomId);await validateInventoryLocation(tx,clinicId,target.branchId,input.toRoomId);
 if(await locationBalance(tx,clinicId,source.id,input.fromRoomId)<quantityMilli(input.quantity))throw conflict('insufficient_stock');
 const [transfer]=await tx.insert(inventoryTransfersTable).values({clinicId,fromItemId:source.id,toItemId:target.id,fromRoomId:input.fromRoomId,toRoomId:input.toRoomId,quantity:quantityString(quantityMilli(input.quantity)),notes:input.notes,createdBy:fresh.id}).returning({id:inventoryTransfersTable.id});
 await tx.insert(inventoryMovementsTable).values([{clinicId,branchId:source.branchId,itemId:source.id,unit:source.unit,roomId:input.fromRoomId,kind:'adjustment' as const,transferId:transfer!.id,quantity:quantityString(-quantityMilli(input.quantity)),reason:`Transfer #${transfer!.id}${input.notes?`: ${input.notes}`:''}`,reasonLang:'en' as const,actorId:fresh.id},
  {clinicId,branchId:target.branchId,itemId:target.id,unit:target.unit,roomId:input.toRoomId,kind:'receipt' as const,transferId:transfer!.id,quantity:quantityString(quantityMilli(input.quantity)),reason:`Transfer #${transfer!.id}${input.notes?`: ${input.notes}`:''}`,reasonLang:'en' as const,actorId:fresh.id}]);
 await recordAudit({clinicId,actorUserId:fresh.id,action:'inventory.stock_transferred',entityType:'inventory_transfer',entityId:transfer!.id,details:{fromItemId:source.id,toItemId:target.id,quantity:input.quantity}},tx);
 return transfer!.id;
});}
export async function listTransfers(actor:User){return withOperations(actor,false,async(tx,fresh)=>{
 authorize(fresh);const clinicId=operatingClinic(fresh),rows=await tx.select().from(inventoryTransfersTable).where(eq(inventoryTransfersTable.clinicId,clinicId)).orderBy(desc(inventoryTransfersTable.id)).limit(200);
 const ids=[...new Set(rows.flatMap(row=>[row.fromItemId,row.toItemId]))];
 const items=ids.length?await tx.select({id:inventoryItemsTable.id,name:inventoryItemsTable.name,branchId:inventoryItemsTable.branchId,branchName:branchesTable.name}).from(inventoryItemsTable)
  .innerJoin(branchesTable,and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,inventoryItemsTable.branchId))).where(and(and(eq(inventoryItemsTable.clinicId,clinicId), activeBranch(inventoryItemsTable.branchId)),inArray(inventoryItemsTable.id,ids))):[];
 const roomIds=[...new Set(rows.flatMap(row=>[row.fromRoomId,row.toRoomId]).filter((id):id is number=>id!==null))];
 const rooms=roomIds.length?await tx.select({id:roomsTable.id,name:roomsTable.name}).from(roomsTable).where(and(and(eq(roomsTable.clinicId,clinicId), activeBranch(roomsTable.branchId)),inArray(roomsTable.id,roomIds))):[];
 const location=(itemId:number,roomId:number|null)=>{const item=items.find(item=>item.id===itemId);return {itemId,itemName:item?.name??'',branchId:item?.branchId??null,branchName:item?.branchName??'',roomId,roomName:rooms.find(room=>room.id===roomId)?.name??null};};
 return {transfers:rows.map(row=>({...row,from:location(row.fromItemId,row.fromRoomId),to:location(row.toItemId,row.toRoomId)}))};
});}
