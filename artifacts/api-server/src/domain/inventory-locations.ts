import {z} from 'zod';
const id=z.number().int().positive();
export const availabilityFields={availability:z.enum(['all','selected']).optional(),branchIds:z.array(id).min(1).max(500).refine(ids=>new Set(ids).size===ids.length,'duplicate_branch').optional()};
export const inventoryAvailabilitySchema=z.object({...availabilityFields,idempotencyKey:z.string().uuid()}).strict().refine(v=>v.availability==='all'||v.availability==='selected'&&Boolean(v.branchIds?.length),'inventory_branches_required');
export const inventorySettingsSchema=z.object({movementMode:z.enum(['branch','room']),expectedVersion:z.number().int().min(0),idempotencyKey:z.string().uuid()}).strict();
