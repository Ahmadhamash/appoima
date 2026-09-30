import {z} from 'zod';
import type {AppointmentProductCharge} from '@workspace/db';
import {decimal,milli,materialCost,money} from './costing';

export const productSelectionsSchema=z.array(z.object({
  itemId:z.number().int().positive(),quantity:money.refine(v=>milli(v)>0n,'invalid_quantity'),expectedUnitPrice:money.optional(),
}).strict()).max(100).refine(v=>new Set(v.map(line=>line.itemId)).size===v.length,'duplicate_inventory_item');
export const appointmentProductsSchema=z.object({items:productSelectionsSchema,expectedVersion:z.number().int().positive(),idempotencyKey:z.string().uuid()}).strict();
export const patientPricingSchema=z.object({branchId:z.coerce.number().int().positive(),serviceId:z.coerce.number().int().positive(),appointmentType:z.enum(['standard','follow_up']).default('standard')}).strict();
export type ProductSelection=z.infer<typeof productSelectionsSchema>[number];
export function paymentSummary(serviceFee:string|null,products:AppointmentProductCharge[],basis:'planned'|'actual'|'manual'='planned'){
  const productTotal=products.reduce((sum,line)=>sum+milli(line.amount),0n);
  return {currency:'JOD' as const,serviceFee,productTotal:decimal(productTotal),total:serviceFee===null?null:decimal(milli(serviceFee)+productTotal),products,basis};
}
export function productCharge(item:{id:number;name:string;nameLang:'en'|'ar';unit:string},quantity:string,unitPrice:string):AppointmentProductCharge{
  return {itemId:item.id,name:item.name,nameLang:item.nameLang,unit:item.unit,quantity:decimal(milli(quantity)),unitPrice:decimal(milli(unitPrice)),amount:decimal(materialCost(quantity,unitPrice))};
}
