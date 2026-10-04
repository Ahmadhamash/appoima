import { z } from 'zod';
import { money, milli, decimal } from './costing';
import { validDate } from './scheduling-rules';
const id = z.number().int().positive();
export const eligibilitySchema = z.object({
  customerType: z.enum(['all', 'new', 'existing']).default('all'), minimumSpend: money.default('0'),
  maxPerPatient: z.number().int().min(1).max(1000).nullable().default(null), conditions: z.string().trim().max(2000).default(''),
}).strict();
export const offerInputSchema = z.object({
  name: z.string().trim().min(1).max(160), serviceIds: z.array(id).max(100).default([]), packageIds: z.array(id).max(100).default([]),
  kind: z.enum(['percent', 'amount', 'price']), value: money,
  startsOn: z.string().refine(validDate), endsOn: z.string().refine(validDate), eligibility: eligibilitySchema.default({}),
  idempotencyKey: z.string().uuid(),
}).strict().refine(v => v.serviceIds.length + v.packageIds.length > 0, 'offer_target_required')
  .refine(v => new Set(v.serviceIds).size === v.serviceIds.length && new Set(v.packageIds).size === v.packageIds.length, 'duplicate_target')
  .refine(v => v.endsOn >= v.startsOn, 'offer_invalid_period')
  .refine(v => v.kind !== 'percent' || milli(v.value) <= 100000n, 'offer_invalid_percent');
export const catalogStatusSchema = z.object({ isActive: z.boolean(), idempotencyKey: z.string().uuid() }).strict();
export const quoteSchema = z.object({ customerId: id, serviceId: id, templateId: id.optional(), offerId: id.optional() }).strict();
export const purchasePackageSchema = z.object({
  templateId: id, offerId: id.optional(), expectedPrice: money, eligibilityConfirmed: z.boolean().default(false), rulesAccepted: z.boolean().default(false),
  payment: z.object({ method: z.enum(['cash','visa','cliq','bank','online','other','wallet']), amount: money, reference: z.string().trim().max(200).default('') }).strict().optional(),
}).strict();
export function promotionalPrice(base: string, kind: 'percent' | 'amount' | 'price', value: string): string {
  const original = milli(base), amount = milli(value);
  const result = kind === 'percent' ? original - (original * amount + 50000n) / 100000n : kind === 'amount' ? original - amount : amount;
  if (result < 0n || result > original) throw new Error('offer_price_invalid');
  return decimal(result);
}
export function purchaseDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year','month','day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
