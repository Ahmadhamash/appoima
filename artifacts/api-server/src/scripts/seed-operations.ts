/** Explicit development samples. No inferred recipe usage and no automatic replacement booking. */
import {and,asc,eq,gt,inArray,sql} from 'drizzle-orm';
import {db,usersTable,branchesTable,appointmentsTable,customersTable,waitingEntriesTable,inventoryItemsTable,inventoryMovementsTable,auditEventsTable} from '@workspace/db';
import {recordAudit} from '../services/audit';
export async function seedOperations(clinicId:number,sampleUserIds:number[]) {
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(7140002,${clinicId})`);
    const [done]=await tx.select({id:auditEventsTable.id}).from(auditEventsTable).where(and(eq(auditEventsTable.clinicId,clinicId),eq(auditEventsTable.action,'seed.phase4_operations'))).limit(1);
    if(done)return false;
    const [manager]=await tx.select().from(usersTable).where(and(eq(usersTable.clinicId,clinicId),eq(usersTable.role,'manager'),inArray(usersTable.id,sampleUserIds))).limit(1);
    if(!manager)return false;
    const [branch]=await tx.select().from(branchesTable).where(eq(branchesTable.clinicId,clinicId)).orderBy(asc(branchesTable.id)).limit(1);
    if(!branch)return false;
    const ar=branch.nameLang==='ar',nameLang=ar?'ar' as const:'en' as const;
    // These are explicit synthetic opening receipts, not balances edited in place.
    for(const sample of [{name:ar?'جل تجريبي للتدريب':'Training gel (sample)',unit:'ml' as const,quantity:'500.000'},
      {name:ar?'قفازات تجريبية للتدريب':'Training gloves (sample)',unit:'pair' as const,quantity:'100.000'}]){
      const [item]=await tx.insert(inventoryItemsTable).values({clinicId,branchId:branch.id,name:sample.name,nameLang,unit:sample.unit,createdBy:manager.id}).returning();
      await tx.insert(inventoryMovementsTable).values({clinicId,branchId:branch.id,itemId:item!.id,unit:sample.unit,kind:'receipt',quantity:sample.quantity,actorId:manager.id,
        reason:ar?'رصيد تجريبي للتدريب فقط؛ ليس مخزوناً حقيقياً.':'Synthetic development receipt, not real business stock.',reasonLang:nameLang});
      await recordAudit({clinicId,actorUserId:manager.id,action:'seed.phase4_stock_receipt',entityType:'inventory_item',entityId:item!.id,details:{developmentSample:true}},tx);
    }
    // A waiting customer can replace the existing sample only AFTER staff cancel and confirm.
    const [booking]=await tx.select().from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,clinicId),eq(appointmentsTable.branchId,branch.id),inArray(appointmentsTable.status,['pending','confirmed']),gt(appointmentsTable.startsAt,new Date()))).orderBy(asc(appointmentsTable.startsAt)).limit(1);
    if(booking){
      const [customer]=await tx.insert(customersTable).values({clinicId,branchId:branch.id,name:ar?'عميل انتظار تجريبي':'Waiting customer (sample)',nameLang,
        email:`waiting-${clinicId}@example.test`,notes:ar?'طلب انتظار للتدريب فقط.':'Synthetic waiting-list training record.'}).returning();
      const [entry]=await tx.insert(waitingEntriesTable).values({clinicId,branchId:branch.id,customerId:customer!.id,serviceId:booking.serviceId,preferredEmployeeId:booking.employeeId,
        windowStart:booking.startsAt,windowEnd:booking.endsAt,note:ar?'ألغِ الموعد التجريبي ثم راجع البديل؛ لا يوجد حجز تلقائي.':'Cancel the sample appointment to review this replacement; booking needs explicit staff confirmation.',noteLang:nameLang,createdBy:manager.id}).returning();
      await recordAudit({clinicId,actorUserId:manager.id,action:'seed.phase4_waiting_entry',entityType:'waiting_entry',entityId:entry!.id,details:{developmentSample:true,appointmentId:booking.id}},tx);
    }
    await recordAudit({clinicId,actorUserId:manager.id,action:'seed.phase4_operations',entityType:'clinic',entityId:clinicId,details:{developmentSample:true,waitingEntryAdded:Boolean(booking),actualConsumptionRecorded:false}},tx);
    return true;
  });
}
