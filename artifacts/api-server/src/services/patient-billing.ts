import {and,asc,eq,inArray} from 'drizzle-orm';
import {db,inventoryItemsTable,serviceMaterialCostsTable,type AppointmentProductCharge} from '@workspace/db';
import {badRequest,conflict} from '../lib/errors';
import {money,milli} from '../domain/costing';
import {productCharge,type ProductSelection} from '../domain/patient-billing';
type Executor=Pick<Parameters<Parameters<typeof db.transaction>[0]>[0],'select'>;

export async function patientProductOptions(tx:Executor,clinicId:number,branchId:number){
  const items=await tx.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.branchId,branchId),eq(inventoryItemsTable.isAvailable,1))).orderBy(asc(inventoryItemsTable.name));
  return items.filter(item=>item.extra['billingType']==='patient_charge'&&item.extra['isActive']!==false).map(item=>({
    id:item.id,name:item.name,nameLang:item.nameLang,unit:item.unit,unitPrice:money.safeParse(item.extra['sellingPrice']).success?String(item.extra['sellingPrice']):null,
  }));
}
export async function plannedProductSelections(tx:Executor,clinicId:number,branchId:number,serviceId:number):Promise<ProductSelection[]>{
  const lines=await tx.select({itemId:serviceMaterialCostsTable.itemId,quantity:serviceMaterialCostsTable.quantity,extra:inventoryItemsTable.extra}).from(serviceMaterialCostsTable)
    .innerJoin(inventoryItemsTable,and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.branchId,branchId),eq(inventoryItemsTable.id,serviceMaterialCostsTable.itemId)))
    .where(and(eq(serviceMaterialCostsTable.clinicId,clinicId),eq(serviceMaterialCostsTable.branchId,branchId),eq(serviceMaterialCostsTable.serviceId,serviceId)));
  return lines.filter(line=>line.extra['billingType']==='patient_charge').map(({itemId,quantity})=>({itemId,quantity}));
}
/** Preserve already agreed unit prices. Client-supplied prices are expectations, never authoritative prices. */
export async function resolveProductCharges(tx:Executor,clinicId:number,branchId:number,selections:ProductSelection[],previous:AppointmentProductCharge[]=[],actual=false){
  if(!selections.length)return [];
  const items=await tx.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.clinicId,clinicId),eq(inventoryItemsTable.branchId,branchId),inArray(inventoryItemsTable.id,selections.map(line=>line.itemId))));
  if(items.length!==selections.length)throw badRequest('billing_invalid_product');
  const result:AppointmentProductCharge[]=[];
  for(const selection of selections){
    const item=items.find(item=>item.id===selection.itemId)!,saved=previous.find(line=>line.itemId===item.id);
    if(!saved&&item.extra['billingType']!=='patient_charge'){if(actual)continue;throw badRequest('billing_clinic_consumable');}
    if(!actual&&(item.isAvailable!==1||item.extra['isActive']===false)&&!saved)throw badRequest('billing_product_inactive');
    const price=saved?.unitPrice??item.extra['sellingPrice'];
    if(!money.safeParse(price).success)throw badRequest('billing_selling_price_required');
    if(selection.expectedUnitPrice!==undefined&&milli(selection.expectedUnitPrice)!==milli(String(price)))throw conflict('billing_price_changed');
    result.push(productCharge(saved?{id:saved.itemId,name:saved.name,nameLang:saved.nameLang,unit:saved.unit}:item,selection.quantity,String(price)));
  }
  return result;
}
