import { z } from 'zod';
import { validDate } from './scheduling-rules';
import { INVENTORY_UNITS, WAITING_STATUSES, validQuantity,quantityMilli } from './operations-rules';
import {availabilityFields} from './inventory-locations';
const id=z.number().int().positive(), key=z.string().uuid(), lang=z.enum(['en','ar']);
const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const page={page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20)};
export const waitingCreateSchema=z.object({branchId:id,customerId:id,serviceId:id,preferredEmployeeId:id.nullable().default(null),
  preferredDate:z.string().refine(validDate,'invalid_date'),fromTime:clock.optional(),toTime:clock.optional(),
  note:z.string().trim().max(1000).default(''),noteLang:lang.default('en'),idempotencyKey:key}).strict()
  .refine(v=>Boolean(v.fromTime)===Boolean(v.toTime),'window_pair_required').refine(v=>!v.fromTime||v.toTime!>v.fromTime,'invalid_waiting_window');
export const waitingListSchema=z.object({...page,branchId:z.coerce.number().int().positive().optional(),status:z.enum(WAITING_STATUSES).optional()}).strict();
export const waitingDecisionSchema=z.object({idempotencyKey:key,expectedVersion:id,reason:z.string().trim().min(1).max(1000)}).strict();
export const suggestionSchema=z.object({idempotencyKey:key}).strict();
export const confirmReplacementSchema=z.object({idempotencyKey:key,confirmed:z.literal(true)}).strict();
export const optionalExpiryDate=z.string().refine(validDate,'invalid_date').nullable().optional();
const nonnegative=z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/);
const stockQuantity=nonnegative.refine(value=>{try{return quantityMilli(value)>=0n;}catch{return false;}},'invalid_quantity');
const optionalEmail=z.union([z.string().trim().email().max(200),z.literal('')]).optional();
export const inventoryExtraSchema=z.object({
 category:z.string().trim().max(80).optional(),brand:z.string().trim().max(120).optional(),sku:z.string().trim().max(80).optional(),description:z.string().trim().max(1500).optional(),
 minimumStock:nonnegative.optional(),unitCost:nonnegative.optional(),sellingPrice:nonnegative.nullable().optional(),billingType:z.enum(['clinic_cost','patient_charge']).optional(),expiryDate:z.string().refine(validDate,'invalid_date').nullable().optional(),tracksExpiry:z.boolean().optional(),
 storageConditions:z.string().trim().max(500).optional(),supplier:z.string().trim().max(120).optional(),notes:z.string().trim().max(1500).optional(),isActive:z.boolean().optional(),requiresPrescription:z.boolean().optional(),
 supplierPhone:z.string().trim().max(50).optional(),supplierEmail:optionalEmail,supplierLocation:z.string().trim().max(500).optional(),
 supplierContactPerson:z.string().trim().max(120).optional(),supplierContactPhone:z.string().trim().max(50).optional(),supplierContactEmail:optionalEmail,
 supplierWebsite:z.string().trim().max(500).optional(),supplierNotes:z.string().trim().max(3000).optional(),
 imageDataUrl:z.string().regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/).max(2900000).nullable().optional(),
}).strict();
export const inventoryBillingExtraSchema=inventoryExtraSchema.refine(v=>v.billingType!=='patient_charge'||typeof v.sellingPrice==='string',{path:['sellingPrice'],message:'billing_selling_price_required'});
export const inventoryServiceUsageSchema=z.array(z.object({serviceId:id,quantity:z.string().refine(v=>validQuantity(v,true),'invalid_quantity')}).strict()).max(100).refine(lines=>new Set(lines.map(line=>line.serviceId)).size===lines.length,'duplicate_service');
export const inventoryCreateSchema=z.object({branchId:id,...availabilityFields,branchStocks:z.array(z.object({branchId:id,quantity:stockQuantity,expiryDate:optionalExpiryDate}).strict()).max(500).refine(lines=>new Set(lines.map(line=>line.branchId)).size===lines.length,'duplicate_branch').optional(),name:z.string().trim().min(1).max(120),nameLang:lang,unit:z.enum(INVENTORY_UNITS),serviceUsage:inventoryServiceUsageSchema.optional(),extra:inventoryBillingExtraSchema.optional(),initialQuantity:stockQuantity.default('0'),idempotencyKey:key}).strict();
export const inventoryUpdateSchema=z.object({extra:inventoryExtraSchema,serviceUsage:inventoryServiceUsageSchema.optional()}).strict();
export const inventoryListSchema=z.object({...page,branchId:z.coerce.number().int().positive().optional(),roomId:z.coerce.number().int().positive().optional(),location:z.enum(['store']).optional(),search:z.string().trim().max(120).default(''),category:z.string().trim().max(80).optional(),status:z.enum(['in_stock','low','out','expired','expiring']).optional()}).strict();
export const purchaseOrderCreateSchema=z.object({branchId:id,supplier:z.string().trim().max(120).default(''),notes:z.string().trim().max(1000).default(''),lines:z.array(z.object({itemId:id,quantity:z.string().refine(v=>validQuantity(v,true),'invalid_quantity'),unitCost:nonnegative.default('0')}).strict()).min(1).max(100).refine(lines=>new Set(lines.map(line=>line.itemId)).size===lines.length,'duplicate_inventory_item'),idempotencyKey:key}).strict();
export const purchaseOrderReceiveSchema=z.object({lines:z.array(z.object({itemId:id,expiryDate:optionalExpiryDate,quantity:z.string().refine(v=>validQuantity(v,true),'invalid_quantity')}).strict()).min(1).max(100).refine(lines=>new Set(lines.map(line=>line.itemId)).size===lines.length,'duplicate_inventory_item'),idempotencyKey:key}).strict();
export const transferStockSchema=z.object({fromItemId:id,toItemId:id,fromRoomId:id.nullable().default(null),toRoomId:id.nullable().default(null),quantity:z.string().refine(v=>validQuantity(v,true),'invalid_quantity'),notes:z.string().trim().max(1000).default(''),idempotencyKey:key}).strict().refine(value=>value.fromItemId!==value.toItemId||value.fromRoomId!==value.toRoomId,'invalid_transfer');
export const movementSchema=z.object({expiryDate:optionalExpiryDate,kind:z.enum(['receipt','adjustment']),quantity:z.string().refine(v=>validQuantity(v),'invalid_quantity'),
  reason:z.string().trim().max(1000).default(''),reasonLang:lang.default('en'),roomId:id.nullable().default(null),appointmentReferenceId:id.optional(),idempotencyKey:key}).strict()
  .refine(v=>v.kind!=='receipt'||validQuantity(v.quantity,true),'invalid_quantity').refine(v=>v.kind!=='adjustment'||v.reason.length>0,'reason_required');
export const consumptionPayloadSchema=z.object({items:z.array(z.object({itemId:id,quantity:z.string().refine(v=>validQuantity(v,true),'invalid_quantity')}).strict()).max(100),confirmNoItems:z.boolean().default(false)}).strict()
  .refine(v=>new Set(v.items.map(l=>l.itemId)).size===v.items.length,'duplicate_inventory_item')
  .refine(v=>v.items.length>0?!v.confirmNoItems:v.confirmNoItems,'confirm_consumption_required');
export const consumptionSchema=z.object({consumption:consumptionPayloadSchema,idempotencyKey:key}).strict();
export type WaitingCreateInput=z.infer<typeof waitingCreateSchema>;
export type WaitingListInput=z.infer<typeof waitingListSchema>;
export type InventoryCreateInput=z.infer<typeof inventoryCreateSchema>;
export type InventoryListInput=z.infer<typeof inventoryListSchema>;
export type InventoryUpdateInput=z.infer<typeof inventoryUpdateSchema>;
export type PurchaseOrderCreateInput=z.infer<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderReceiveInput=z.infer<typeof purchaseOrderReceiveSchema>;
export type TransferStockInput=z.infer<typeof transferStockSchema>;
export type MovementInput=z.infer<typeof movementSchema>;
export type ConsumptionPayload=z.infer<typeof consumptionPayloadSchema>;
