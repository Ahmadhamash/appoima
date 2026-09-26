import { z } from 'zod';
import { validDate } from './scheduling-rules';
import { INVENTORY_UNITS, WAITING_STATUSES, validQuantity } from './operations-rules';
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
export const inventoryCreateSchema=z.object({branchId:id,name:z.string().trim().min(1).max(120),nameLang:lang,unit:z.enum(INVENTORY_UNITS),idempotencyKey:key}).strict();
export const inventoryListSchema=z.object({...page,branchId:z.coerce.number().int().positive().optional(),search:z.string().trim().max(120).default('')}).strict();
export const movementSchema=z.object({kind:z.enum(['receipt','adjustment']),quantity:z.string().refine(v=>validQuantity(v),'invalid_quantity'),
  reason:z.string().trim().max(1000).default(''),reasonLang:lang.default('en'),idempotencyKey:key}).strict()
  .refine(v=>v.kind!=='receipt'||validQuantity(v.quantity,true),'invalid_quantity').refine(v=>v.kind!=='adjustment'||v.reason.length>0,'reason_required');
export const consumptionPayloadSchema=z.object({items:z.array(z.object({itemId:id,quantity:z.string().refine(v=>validQuantity(v,true),'invalid_quantity')}).strict()).max(100),confirmNoItems:z.boolean().default(false)}).strict()
  .refine(v=>new Set(v.items.map(l=>l.itemId)).size===v.items.length,'duplicate_inventory_item')
  .refine(v=>v.items.length>0?!v.confirmNoItems:v.confirmNoItems,'confirm_consumption_required');
export const consumptionSchema=z.object({consumption:consumptionPayloadSchema,idempotencyKey:key}).strict();
export type WaitingCreateInput=z.infer<typeof waitingCreateSchema>;
export type WaitingListInput=z.infer<typeof waitingListSchema>;
export type InventoryCreateInput=z.infer<typeof inventoryCreateSchema>;
export type InventoryListInput=z.infer<typeof inventoryListSchema>;
export type MovementInput=z.infer<typeof movementSchema>;
export type ConsumptionPayload=z.infer<typeof consumptionPayloadSchema>;
