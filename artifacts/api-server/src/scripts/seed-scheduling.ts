/** Explicit development seeding, not an HTTP bypass. Uses real availability and database guards. */
import {and, eq, inArray, ne, sql} from 'drizzle-orm';
import {db, usersTable, branchesTable, servicesTable, roomsTable, customersTable, serviceEmployeesTable,
  roomServicesTable, appointmentsTable, appointmentStatusHistoryTable} from '@workspace/db';
import {branchDate, computeSlots} from '../domain/scheduling-time';
import {shiftDate} from '../domain/scheduling-rules';
import {recordAudit} from '../services/audit';
export async function seedScheduling(clinicId:number,sampleUserIds:number[]) {
  return db.transaction(async(tx)=>{
    await tx.execute(sql`select pg_advisory_xact_lock(7140002, ${clinicId})`);
    const [manager]=await tx.select().from(usersTable).where(and(eq(usersTable.clinicId,clinicId),eq(usersTable.role,'manager'),inArray(usersTable.id,sampleUserIds))).limit(1);
    if(!manager)return false;
    // Never repeatedly add bookings to an existing sample clinic, or modify an existing booking.
    const [existing]=await tx.select({id:appointmentsTable.id}).from(appointmentsTable).where(eq(appointmentsTable.clinicId,clinicId)).limit(1);
    if(existing)return false;
    const people=await tx.select().from(usersTable).where(and(eq(usersTable.clinicId,clinicId),eq(usersTable.isActive,true),inArray(usersTable.id,sampleUserIds),inArray(usersTable.role,['doctor','service_provider'])));
    for(const employee of people){
      const [branch]=employee.branchId?await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,employee.branchId))):[];
      if(!branch)continue;
      const [customer]=await tx.select().from(customersTable).where(and(eq(customersTable.clinicId,clinicId),eq(customersTable.branchId,branch.id))).limit(1);
      if(!customer)continue;
      const assignments=await tx.select({id:serviceEmployeesTable.serviceId}).from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId,clinicId),eq(serviceEmployeesTable.employeeId,employee.id)));
      if(!assignments.length)continue;
      const services=await tx.select().from(servicesTable).where(and(eq(servicesTable.clinicId,clinicId),eq(servicesTable.isActive,true),inArray(servicesTable.id,assignments.map((a)=>a.id))));
      for(const service of services){
        if(service.branchId!==null&&service.branchId!==branch.id)continue;
        const roomRows=await tx.select({id:roomsTable.id}).from(roomsTable).innerJoin(roomServicesTable,and(eq(roomServicesTable.roomId,roomsTable.id),eq(roomServicesTable.clinicId,clinicId)))
          .where(and(eq(roomsTable.clinicId,clinicId),eq(roomsTable.branchId,branch.id),eq(roomsTable.status,'available'),eq(roomServicesTable.serviceId,service.id)));
        const busy=await tx.select({startsAt:appointmentsTable.startsAt,endsAt:appointmentsTable.endsAt,employeeId:appointmentsTable.employeeId,roomId:appointmentsTable.roomId}).from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,clinicId),ne(appointmentsTable.status,'cancelled')));
        const today=branchDate(new Date(),branch.timeZone);
        for(let day=0;day<14;day++){
          const [slot]=computeSlots({date:shiftDate(today,day),timeZone:branch.timeZone,branchHours:branch.openingHours,
            workingHours:employee.workingHours,breaks:employee.breaks,timeOff:employee.timeOff,durationMinutes:service.durationMinutes,
            employeeId:employee.id,requiresRoom:service.requiresRoom,roomIds:roomRows.map((r)=>r.id),busy,now:Date.now()+15*60000});
          if(!slot)continue;
          const [a]=await tx.insert(appointmentsTable).values({clinicId,branchId:branch.id,customerId:customer.id,serviceId:service.id,
            employeeId:employee.id,roomId:slot.roomId,startsAt:new Date(slot.startsAt),endsAt:new Date(slot.endsAt),
            durationMinutes:service.durationMinutes,requiresRoom:service.requiresRoom,status:'pending',createdBy:manager.id,
            notes:customer.nameLang==='ar'?'موعد تجريبي للتدريب فقط.':'Development sample appointment only.',notesLang:customer.nameLang}).returning();
          await tx.insert(appointmentStatusHistoryTable).values({clinicId,appointmentId:a!.id,event:'created',fromStatus:null,toStatus:'pending',actorId:manager.id,
            after:{startsAt:slot.startsAt,endsAt:slot.endsAt,employeeId:employee.id,roomId:slot.roomId}});
          await recordAudit({clinicId,actorUserId:manager.id,action:'seed.phase3_appointment',entityType:'appointment',entityId:a!.id,details:{developmentSample:true}},tx);
          return true;
        }
      }
    }
    return false;
  });
}
