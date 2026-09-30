import {sql,type SQL} from 'drizzle-orm';
import type {OperationsTx} from './operations-context';
export function batchExpirySQL(clinicId:number,itemCondition:SQL,window?:'expired'|'expiring'){
 return sql<string|null>`(select min(stock.expiry_date)::text from (select b.id,b.expiry_date,sum(a.quantity) as balance from inventory_batch_allocations a join inventory_batches b on b.id=a.batch_id and b.clinic_id=a.clinic_id where a.clinic_id=${clinicId} and ${itemCondition} group by b.id,b.expiry_date having sum(a.quantity)>0) stock ${window==='expired'?sql`where stock.expiry_date<current_date`:window==='expiring'?sql`where stock.expiry_date>=current_date and stock.expiry_date<=current_date+30`:sql``})`;
}
export async function itemBatches(tx:OperationsTx,clinicId:number,itemId:number){
 const result=await tx.execute(sql`select b.id,b.expiry_date::text as "expiryDate",a.room_id as "roomId",r.name as "roomName",sum(a.quantity)::text as quantity
 from inventory_batch_allocations a join inventory_batches b on b.id=a.batch_id and b.clinic_id=a.clinic_id
 left join rooms r on r.id=a.room_id and r.clinic_id=a.clinic_id
 where a.clinic_id=${clinicId} and a.item_id=${itemId}
 group by b.id,b.expiry_date,a.room_id,r.name having sum(a.quantity)>0 order by b.expiry_date asc nulls last,b.id,a.room_id nulls first`);
 return result.rows as {id:number;expiryDate:string|null;roomId:number|null;roomName:string|null;quantity:string}[];
}
