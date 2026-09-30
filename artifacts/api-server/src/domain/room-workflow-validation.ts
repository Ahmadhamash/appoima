import {z} from 'zod';
const instant=z.string().datetime({offset:true});
export const roomRangeSchema=z.object({from:instant,to:instant,roomId:z.coerce.number().int().positive().optional()}).strict().refine(value=>Date.parse(value.to)>Date.parse(value.from)&&Date.parse(value.to)-Date.parse(value.from)<=93*86400000,'invalid_date_range');
export const roomBlockSchema=z.object({startsAt:instant,endsAt:instant,kind:z.enum(['maintenance','block']),reason:z.string().trim().min(1).max(120),notes:z.string().trim().max(1000).default(''),idempotencyKey:z.string().uuid()}).strict().refine(value=>Date.parse(value.endsAt)>Date.parse(value.startsAt)&&Date.parse(value.endsAt)-Date.parse(value.startsAt)<=31*86400000,'invalid_time_range');
export type RoomRange=z.infer<typeof roomRangeSchema>;
export type RoomBlockInput=z.infer<typeof roomBlockSchema>;
