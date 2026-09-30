import { z } from 'zod';

export const money = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/);
const id = z.number().int().positive();
const minutes = z.number().int().min(0).max(1440);
export const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(120), branchId: id, roomId: id.nullable(),
  equipmentType:z.string().trim().max(120).default(''),
  purchaseCost: money, residualValue: money, lifetimeUses: z.number().int().positive().max(1000000000),
  maintenancePerUse: money, operatingHourlyCost: money, isActive: z.boolean(),
  employeeIds: z.array(id).min(1).max(200).refine(v => new Set(v).size === v.length),
}).strict().refine(v => milli(v.residualValue) <= milli(v.purchaseCost), 'residual_exceeds_purchase');
export const profileSchema = z.object({
  branchId: id, overhead: money,
  materials: z.array(z.object({ itemId: id, quantity: money.refine(v => milli(v) > 0n) }).strict()).max(100).refine(v => new Set(v.map(x => x.itemId)).size === v.length),
  equipment: z.array(z.object({ equipmentId: id, uses: z.number().int().positive().max(1000000), minutes }).strict()).max(100).refine(v => new Set(v.map(x => x.equipmentId)).size === v.length),
}).strict();
export const quoteSchema = z.object({ branchId: id, employeeId: id.nullable(), roomId: id.nullable() }).strict();
export const actualSchema = z.object({
  actualMinutes: minutes.refine(v => v > 0),
  equipment: z.array(z.object({ equipmentId: id, uses: z.number().int().min(0).max(1000000), minutes }).strict()).max(100).refine(v => new Set(v.map(x => x.equipmentId)).size === v.length),
}).strict();
export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type ActualInput = z.infer<typeof actualSchema>;

/** Exact integer thousandths; round each disclosed component once, then sum. */
export function milli(value: string): bigint {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) throw new Error('invalid_cost_decimal');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'));
}
export function decimal(value: bigint): string {
  const sign = value < 0n ? '-' : '', n = value < 0n ? -value : value;
  return `${sign}${n / 1000n}.${String(n % 1000n).padStart(3, '0')}`;
}
export function rounded(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error('invalid_cost_fraction');
  return (numerator * 2n + denominator) / (denominator * 2n);
}
export function materialCost(quantity: string, unitCost: string) { return rounded(milli(quantity) * milli(unitCost), 1000n); }
export function timeCost(hourly: string, minutes: number) { return rounded(milli(hourly) * BigInt(minutes), 60n); }
export function equipmentCost(asset: { purchaseCost: string; residualValue: string; lifetimeUses: number; maintenancePerUse: string; operatingHourlyCost: string }, uses: number, minutes: number) {
  const lifetime = BigInt(asset.lifetimeUses);
  const capital = (milli(asset.purchaseCost) - milli(asset.residualValue)) * BigInt(uses);
  const maintenance = milli(asset.maintenancePerUse) * BigInt(uses);
  const operating = milli(asset.operatingHourlyCost) * BigInt(minutes);
  return rounded(capital * 60n + maintenance * lifetime * 60n + operating * lifetime, lifetime * 60n);
}
