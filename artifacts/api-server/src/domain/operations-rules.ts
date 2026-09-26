/** Decimal quantities are exact thousandths, never binary floating-point stock arithmetic. */
export const INVENTORY_UNITS = ['piece','pair','box','ml','l','g','kg'] as const;
export const WAITING_STATUSES = ['waiting','offered','booked','declined','expired'] as const;
export const MAX_QUANTITY_MILLI = 9_000_000_000_000n;
export function quantityMilli(value: string): bigint {
  if (!/^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,3})?$/.test(value)) throw new Error('invalid_quantity');
  const negative=value.startsWith('-'), [whole,fraction='']=value.replace(/^-/, '').split('.');
  const n=BigInt(whole!)*1000n+BigInt(fraction.padEnd(3,'0'));
  if(n>MAX_QUANTITY_MILLI) throw new Error('invalid_quantity');
  return negative ? -n : n;
}
export function quantityString(value: bigint): string {
  const abs=value<0n?-value:value;
  return `${value<0n?'-':''}${abs/1000n}.${String(abs%1000n).padStart(3,'0')}`;
}
export function validQuantity(value: string, positive=false): boolean {
  try {const q=quantityMilli(value);return positive?q>0n:q!==0n;}catch{return false;}
}
export function normalizedLines(lines: readonly {itemId:number;quantity:string}[]) {
  if(lines.length>100 || new Set(lines.map(l=>l.itemId)).size!==lines.length) throw new Error('duplicate_inventory_item');
  return lines.map(l=>{if(!validQuantity(l.quantity,true)) throw new Error('invalid_quantity');return {itemId:l.itemId,quantity:quantityString(quantityMilli(l.quantity))};}).sort((a,b)=>a.itemId-b.itemId);
}
export function waitingFits(entry:{branchId:number;serviceId:number;preferredEmployeeId:number|null;windowStart:Date;windowEnd:Date},
  vacancy:{branchId:number;serviceId:number;employeeId:number;startsAt:Date;endsAt:Date},durationMinutes:number):boolean {
  const end=vacancy.startsAt.getTime()+durationMinutes*60000;
  return durationMinutes>0 && entry.branchId===vacancy.branchId && entry.serviceId===vacancy.serviceId &&
    (entry.preferredEmployeeId===null||entry.preferredEmployeeId===vacancy.employeeId) &&
    entry.windowStart.getTime()<=vacancy.startsAt.getTime() && entry.windowEnd.getTime()>=end && end<=vacancy.endsAt.getTime();
}
export function canRecordConsumption(actor:{id:number;role:string;clinicId:number|null;permissions:readonly string[]},
  appointment:{clinicId:number;employeeId:number}):boolean {
  return actor.clinicId===appointment.clinicId && actor.role!=='platform_owner' && actor.permissions.includes('inventory.manage') &&
    (actor.permissions.includes('appointments.manage') || (['doctor','service_provider'].includes(actor.role)&&actor.id===appointment.employeeId));
}
