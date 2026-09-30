import {and,asc,eq,inArray} from 'drizzle-orm';
import {servicesTable,serviceCostProfilesTable,serviceMaterialCostsTable} from '@workspace/db';
import {badRequest} from '../lib/errors';
import {quantityMilli,quantityString} from '../domain/operations-rules';
import type {OperationsTx} from './operations-context';

/** Inventory and service costing share the same estimated material recipe. */
export async function saveInventoryServiceUsage(tx:OperationsTx,clinicId:number,items:{id:number;branchId:number}[],lines:{serviceId:number;quantity:string}[]){
  const services=lines.length?await tx.select().from(servicesTable).where(and(eq(servicesTable.clinicId,clinicId),eq(servicesTable.isActive,true),inArray(servicesTable.id,lines.map(line=>line.serviceId)))):[];
  if(lines.some(line=>!services.some(service=>service.id===line.serviceId&&items.some(item=>service.branchId===null||service.branchId===item.branchId))))throw badRequest('inventory_service_invalid');
  if(!items.length)return;
  await tx.delete(serviceMaterialCostsTable).where(and(eq(serviceMaterialCostsTable.clinicId,clinicId),inArray(serviceMaterialCostsTable.itemId,items.map(item=>item.id))));
  for(const item of items)for(const line of lines){
    const service=services.find(service=>service.id===line.serviceId)!;
    if(service.branchId!==null&&service.branchId!==item.branchId)continue;
    await tx.insert(serviceCostProfilesTable).values({clinicId,branchId:item.branchId,serviceId:service.id}).onConflictDoNothing();
    await tx.insert(serviceMaterialCostsTable).values({clinicId,branchId:item.branchId,serviceId:service.id,itemId:item.id,quantity:quantityString(quantityMilli(line.quantity))});
  }
}
export async function readInventoryServiceUsage(tx:OperationsTx,clinicId:number,itemId:number){
  return tx.select({serviceId:servicesTable.id,name:servicesTable.name,nameLang:servicesTable.nameLang,quantity:serviceMaterialCostsTable.quantity})
    .from(serviceMaterialCostsTable).innerJoin(servicesTable,and(eq(servicesTable.clinicId,clinicId),eq(servicesTable.id,serviceMaterialCostsTable.serviceId)))
    .where(and(eq(serviceMaterialCostsTable.clinicId,clinicId),eq(serviceMaterialCostsTable.itemId,itemId))).orderBy(asc(servicesTable.name));
}
