/** One-use, short-lived navigation hint. Never authorization or a reservation.
 * Only IDs/date are kept in this tab's memory; no names, notes, contacts or storage.
 */
export type BookingSuggestion={userId:number;clinicId:number;branchId:number;serviceId:number;employeeId:number;date:string};
let pending:{hint:BookingSuggestion;expiresAt:number}|null=null;
const listeners=new Set<()=>void>();
export function stageBookingSuggestion(hint:BookingSuggestion,now=Date.now()):boolean {
  const ids=[hint.userId,hint.clinicId,hint.branchId,hint.serviceId,hint.employeeId];
  const date=Date.parse(`${hint.date}T00:00:00Z`);
  if(!ids.every(value=>Number.isSafeInteger(value)&&value>0)||!/^\d{4}-\d{2}-\d{2}$/.test(hint.date)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==hint.date){pending=null;return false;}
  pending={hint:{userId:hint.userId,clinicId:hint.clinicId,branchId:hint.branchId,serviceId:hint.serviceId,employeeId:hint.employeeId,date:hint.date},expiresAt:now+300000};
  for(const notify of listeners)notify();
  return true;
}
export function takeBookingSuggestion(userId:number|undefined,clinicId:number|null|undefined,now=Date.now()):BookingSuggestion|null {
  const value=pending;pending=null;
  return value&&value.expiresAt>now&&value.hint.userId===userId&&value.hint.clinicId===clinicId?value.hint:null;
}
export function subscribeBookingSuggestion(listener:()=>void):()=>void {
  listeners.add(listener);return ()=>{listeners.delete(listener);};
}
