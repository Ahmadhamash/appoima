import { staffWorksAt } from '../domain/staff-branches';
import { activeBranch, activeEmployee } from './branch-scope';
import { intakeSnapshot, ServiceDefinitionError } from '@workspace/service-definition';
import { and, asc, desc, eq, gte, gt, lte, inArray, or, sql } from 'drizzle-orm';
import { branchesTable, usersTable, customersTable, servicesTable, serviceEmployeesTable, appointmentsTable, waitingEntriesTable,
  waitingOffersTable, type User, type Appointment, type WaitingEntry, type WaitingOffer } from '@workspace/db';
import { hasPermission } from '../domain/permissions';
import { waitingFits } from '../domain/operations-rules';
import { wallConverter } from '../domain/scheduling-time';
import type { WaitingCreateInput, WaitingListInput } from '../domain/operations-validation';
import { badRequest, forbidden, notFound, conflict, HttpError } from '../lib/errors';
import { recordAudit } from './audit';
import { selectedSlot } from './scheduling-slots';
import { recordAppointmentHistory } from './scheduling-history';
import { operatingClinic, withOperations, operationsCommand, replayOperation, saveOperation, type OperationsTx as Tx } from './operations-context';
function requireWaiting(actor:User,manage=false) {
  operatingClinic(actor);if(!hasPermission(actor,manage?'appointments.manage':'appointments.read'))throw forbidden();
}
const waitingAudit=(tx:Tx,actor:User,action:string,id:number,details:Record<string,unknown>={})=>recordAudit({clinicId:operatingClinic(actor),actorUserId:actor.id,action:`waiting_list.${action}`,entityType:'waiting_entry',entityId:id,details},tx);
async function findEntry(tx:Tx,actor:User,id:number) {
  const [entry]=await tx.select().from(waitingEntriesTable).where(and(and(eq(waitingEntriesTable.clinicId,operatingClinic(actor)), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.id,id)));
  if(!entry)throw notFound('waiting_entry_not_found');return entry;
}
async function findCancelled(tx:Tx,actor:User,id:number) {
  const [a]=await tx.select().from(appointmentsTable).where(and(and(eq(appointmentsTable.clinicId,operatingClinic(actor)), activeBranch(appointmentsTable.branchId)),eq(appointmentsTable.id,id)));
  if(!a)throw notFound('appointment_not_found');if(a.status!=='cancelled')throw conflict('waiting_not_cancelled');return a;
}
async function releaseOffer(tx:Tx,actor:User,offer:WaitingOffer,entry:WaitingEntry,status:'declined'|'expired'|'unavailable') {
  await tx.update(waitingOffersTable).set({status,decidedAt:new Date()}).where(and(eq(waitingOffersTable.id,offer.id),eq(waitingOffersTable.clinicId,operatingClinic(actor)),eq(waitingOffersTable.status,'offered')));
  const next=entry.windowEnd.getTime()<=Date.now()?'expired':status==='declined'?'declined':'waiting';
  if(entry.status==='offered')await tx.update(waitingEntriesTable).set({status:next,version:entry.version+1,updatedAt:new Date()}).where(and(eq(waitingEntriesTable.id,entry.id),and(eq(waitingEntriesTable.clinicId,operatingClinic(actor)), activeBranch(waitingEntriesTable.branchId))));
  await waitingAudit(tx,actor,`offer_${status}`,entry.id,{offerId:offer.id,cancelledAppointmentId:offer.cancelledAppointmentId});
}
const expectedSlotErrors=new Set(['slot_taken','booking_unavailable','branch_mismatch','employee_not_eligible','record_not_found']);
async function fittingContext(tx:Tx,actor:User,entry:WaitingEntry,vacancy:Appointment) {
  if(vacancy.status!=='cancelled'||vacancy.startsAt.getTime()<=Date.now())return null;
  try{
    const context=await selectedSlot(tx,actor,{branchId:vacancy.branchId,serviceId:entry.serviceId,employeeId:vacancy.employeeId,startsAt:vacancy.startsAt.toISOString()});
    return waitingFits(entry,vacancy,context.durationMinutes)?context:null;
  }catch(error){if(error instanceof HttpError&&expectedSlotErrors.has(error.code))return null;throw error;}
}
/** Must be called while holding the clinic write lock. A suggestion is NOT a reservation. */
export async function offerNextReplacement(tx:Tx,actor:User,vacancy:Appointment):Promise<WaitingOffer|null> {
  requireWaiting(actor,true);
  if(vacancy.status!=='cancelled')return null;
  const clinicId=operatingClinic(actor);
  const existing=await tx.select().from(waitingOffersTable).where(and(eq(waitingOffersTable.clinicId,clinicId),eq(waitingOffersTable.cancelledAppointmentId,vacancy.id),inArray(waitingOffersTable.status,['offered','booked'])));
  if(existing[0]?.status==='booked')return null;
  if(existing[0]) {
    const old=existing[0],entry=await findEntry(tx,actor,old.entryId);
    const context=entry.status==='offered'&&entry.version===old.entryVersion&&vacancy.version===old.cancellationVersion?await fittingContext(tx,actor,entry,vacancy):null;
    if(context&&Date.parse(context.selected.endsAt)===old.endsAt.getTime())return old;
    await releaseOffer(tx,actor,old,entry,entry.windowEnd.getTime()<=Date.now()||vacancy.startsAt.getTime()<=Date.now()?'expired':'unavailable');
  }
  if(vacancy.startsAt.getTime()<=Date.now())return null;
  // The same requested service uses its current duration; the whole replacement must fit the vacancy.
  const [service]=await tx.select().from(servicesTable).where(and(and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId)),eq(servicesTable.id,vacancy.serviceId)));
  if(!service||!service.isActive)return null;
  const desiredEnd=new Date(vacancy.startsAt.getTime()+service.durationMinutes*60000);
  if(desiredEnd>vacancy.endsAt)return null;
  // SQL filters the queue BEFORE pagination, so an incompatible earlier entry cannot starve a later one.
  const [entry]=await tx.select().from(waitingEntriesTable).where(and(
    and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.branchId,vacancy.branchId),eq(waitingEntriesTable.serviceId,vacancy.serviceId),eq(waitingEntriesTable.status,'waiting'),
    or(sql`${waitingEntriesTable.preferredEmployeeId} is null`,eq(waitingEntriesTable.preferredEmployeeId,vacancy.employeeId)),
    lte(waitingEntriesTable.windowStart,vacancy.startsAt),gte(waitingEntriesTable.windowEnd,desiredEnd),
    sql`not exists (select 1 from waiting_list_offers prior where prior.clinic_id = ${clinicId} and prior.entry_id = ${waitingEntriesTable.id} and prior.cancelled_appointment_id = ${vacancy.id})`
  )).orderBy(asc(waitingEntriesTable.createdAt),asc(waitingEntriesTable.id)).limit(1);
  if(!entry)return null;
  const context=await fittingContext(tx,actor,entry,vacancy);if(!context)return null;
  const [updated]=await tx.update(waitingEntriesTable).set({status:'offered',version:entry.version+1,updatedAt:new Date()}).where(and(eq(waitingEntriesTable.id,entry.id),and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.status,'waiting'))).returning();
  if(!updated)return null;
  const [offer]=await tx.insert(waitingOffersTable).values({clinicId,entryId:entry.id,cancelledAppointmentId:vacancy.id,cancellationVersion:vacancy.version,
    entryVersion:updated.version,startsAt:new Date(context.selected.startsAt),endsAt:new Date(context.selected.endsAt),employeeId:vacancy.employeeId,createdBy:actor.id}).returning();
  await waitingAudit(tx,actor,'suggested',entry.id,{offerId:offer!.id,cancelledAppointmentId:vacancy.id});return offer!;
}
async function expireWaiting(tx:Tx,actor:User) {
  const clinicId=operatingClinic(actor),now=new Date();
  const offers=await tx.select({offer:waitingOffersTable,entry:waitingEntriesTable}).from(waitingOffersTable)
    .innerJoin(waitingEntriesTable,and(eq(waitingEntriesTable.id,waitingOffersTable.entryId),and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId))))
    .where(and(eq(waitingOffersTable.clinicId,clinicId),eq(waitingOffersTable.status,'offered'),or(lte(waitingOffersTable.startsAt,now),lte(waitingEntriesTable.windowEnd,now))));
  for(const o of offers)await releaseOffer(tx,actor,o.offer,o.entry,'expired');
  const expired=await tx.update(waitingEntriesTable).set({status:'expired',version:sql`${waitingEntriesTable.version}+1`,updatedAt:now})
    .where(and(and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.status,'waiting'),lte(waitingEntriesTable.windowEnd,now))).returning({id:waitingEntriesTable.id});
  for(const entry of expired)await waitingAudit(tx,actor,'expired',entry.id);
}
export async function addWaitingEntry(actor:User,input:WaitingCreateInput) {
  return operationsCommand(actor,'waiting:create',input,async(_tx,fresh)=>requireWaiting(fresh,true),async(tx,fresh)=>{
    const clinicId=operatingClinic(fresh);
    const [branch]=await tx.select().from(branchesTable).where(and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,input.branchId)));
    const [service]=await tx.select().from(servicesTable).where(and(and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId)),eq(servicesTable.id,input.serviceId)));
    const [customer]=await tx.select({id:customersTable.id}).from(customersTable).where(and(and(eq(customersTable.clinicId,clinicId), activeBranch(customersTable.branchId)),eq(customersTable.id,input.customerId)));
    if(!branch||!service||!customer)throw notFound('record_not_found');
    if(!service.isActive||(service.branchId!==null&&service.branchId!==branch.id))throw badRequest('booking_unavailable');
    if(input.preferredEmployeeId!==null){
      const [employee]=await tx.select().from(usersTable).where(and(and(eq(usersTable.clinicId,clinicId), activeEmployee()),eq(usersTable.id,input.preferredEmployeeId)));
      if(!employee)throw notFound('record_not_found');
      const [link]=await tx.select().from(serviceEmployeesTable).where(and(eq(serviceEmployeesTable.clinicId,clinicId),eq(serviceEmployeesTable.serviceId,service.id),eq(serviceEmployeesTable.employeeId,employee.id)));
      if(!employee.isActive||!link||!staffWorksAt(employee,branch.id))throw badRequest('employee_not_eligible');
    }
    const minutes=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));
    const convert=wallConverter(input.preferredDate,branch.timeZone),start=convert(input.fromTime?minutes(input.fromTime):0),end=convert(input.toTime?minutes(input.toTime):1440);
    if(start===null||end===null||end<=start||end<=Date.now()||end-start<service.durationMinutes*60000)throw badRequest('invalid_waiting_window');
    const [duplicate]=await tx.select({id:waitingEntriesTable.id}).from(waitingEntriesTable).where(and(and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.branchId,branch.id),eq(waitingEntriesTable.serviceId,service.id),eq(waitingEntriesTable.customerId,customer.id),
      inArray(waitingEntriesTable.status,['waiting','offered']),eq(waitingEntriesTable.windowStart,new Date(start)),eq(waitingEntriesTable.windowEnd,new Date(end)),
      input.preferredEmployeeId===null?sql`${waitingEntriesTable.preferredEmployeeId} is null`:eq(waitingEntriesTable.preferredEmployeeId,input.preferredEmployeeId)));
    if(duplicate)throw conflict('waiting_duplicate');
    const [entry]=await tx.insert(waitingEntriesTable).values({clinicId,branchId:branch.id,customerId:customer.id,serviceId:service.id,preferredEmployeeId:input.preferredEmployeeId,
      windowStart:new Date(start),windowEnd:new Date(end),note:input.note,noteLang:input.noteLang,createdBy:fresh.id}).returning();
    await waitingAudit(tx,fresh,'created',entry!.id);return entry!.id;
  });
}
export async function listWaitingEntries(actor:User,input:WaitingListInput) {
  return withOperations(actor,false,async(tx,fresh)=>{
    requireWaiting(fresh);const clinicId=operatingClinic(fresh);
    const where=and(and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),input.branchId?eq(waitingEntriesTable.branchId,input.branchId):undefined,input.status?eq(waitingEntriesTable.status,input.status):undefined);
    const items=await tx.select({entry:waitingEntriesTable,customer:{id:customersTable.id,name:customersTable.name,nameLang:customersTable.nameLang},
      service:{id:servicesTable.id,name:servicesTable.name,nameLang:servicesTable.nameLang},branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone},
      employee:{id:usersTable.id,name:usersTable.name,nameLang:usersTable.nameLang},offerId:waitingOffersTable.id,cancelledAppointmentId:waitingOffersTable.cancelledAppointmentId})
      .from(waitingEntriesTable).innerJoin(customersTable,and(eq(customersTable.id,waitingEntriesTable.customerId),and(eq(customersTable.clinicId,clinicId), activeBranch(customersTable.branchId))))
      .innerJoin(servicesTable,and(eq(servicesTable.id,waitingEntriesTable.serviceId),and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId))))
      .innerJoin(branchesTable,and(eq(branchesTable.id,waitingEntriesTable.branchId),and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id))))
      .leftJoin(usersTable,and(eq(usersTable.id,waitingEntriesTable.preferredEmployeeId),and(eq(usersTable.clinicId,clinicId), activeEmployee())))
      .leftJoin(waitingOffersTable,and(eq(waitingOffersTable.clinicId,clinicId),eq(waitingOffersTable.entryId,waitingEntriesTable.id),eq(waitingOffersTable.status,'offered')))
      .where(where).orderBy(asc(waitingEntriesTable.createdAt),asc(waitingEntriesTable.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
    const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(waitingEntriesTable).where(where);
    return {items:items.map(({entry,...rest})=>({...entry,...rest})),total:count!.total,page:input.page,pageSize:input.pageSize,canManage:hasPermission(fresh,'appointments.manage')};
  });
}
export async function replacementView(actor:User,id:number) {
  return withOperations(actor,false,async(tx,fresh)=>{
    requireWaiting(fresh,true);const clinicId=operatingClinic(fresh),vacancy=await findCancelled(tx,fresh,id);
    const [row]=await tx.select({offer:waitingOffersTable,entry:waitingEntriesTable,customer:{id:customersTable.id,name:customersTable.name,nameLang:customersTable.nameLang},
      ...(hasPermission(fresh,'customers.read')?{contact:{phone:customersTable.phone,email:customersTable.email}}:{}),
      service:{id:servicesTable.id,name:servicesTable.name,nameLang:servicesTable.nameLang},employee:{id:usersTable.id,name:usersTable.name,nameLang:usersTable.nameLang},
      branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone}})
      .from(waitingOffersTable).innerJoin(waitingEntriesTable,and(and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.id,waitingOffersTable.entryId)))
      .innerJoin(customersTable,and(and(eq(customersTable.clinicId,clinicId), activeBranch(customersTable.branchId)),eq(customersTable.id,waitingEntriesTable.customerId)))
      .innerJoin(servicesTable,and(and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId)),eq(servicesTable.id,waitingEntriesTable.serviceId)))
      .innerJoin(branchesTable,and(and(eq(branchesTable.clinicId,clinicId), activeBranch(branchesTable.id)),eq(branchesTable.id,waitingEntriesTable.branchId)))
      .innerJoin(usersTable,and(and(eq(usersTable.clinicId,clinicId), activeEmployee()),eq(usersTable.id,waitingOffersTable.employeeId)))
      .where(and(eq(waitingOffersTable.clinicId,clinicId),eq(waitingOffersTable.cancelledAppointmentId,id),inArray(waitingOffersTable.status,['offered','booked']))).limit(1);
    return {suggestion:row??null,cancelledAppointmentId:vacancy.id};
  });
}
export async function suggestReplacement(actor:User,id:number,input:{idempotencyKey:string}) {
  return operationsCommand(actor,`waiting:suggest:${id}`,input,async(tx,fresh)=>{requireWaiting(fresh,true);await findCancelled(tx,fresh,id);},async(tx,fresh)=>{
    await expireWaiting(tx,fresh);return (await offerNextReplacement(tx,fresh,await findCancelled(tx,fresh,id)))?.id??0;
  });
}
export async function declineWaitingEntry(actor:User,id:number,input:{idempotencyKey:string;expectedVersion:number;reason:string}) {
  return operationsCommand(actor,`waiting:decline:${id}`,input,async(tx,fresh)=>{requireWaiting(fresh,true);await findEntry(tx,fresh,id);},async(tx,fresh)=>{
    const entry=await findEntry(tx,fresh,id);if(entry.version!==input.expectedVersion)throw conflict('operation_changed');
    if(!['waiting','offered'].includes(entry.status))throw conflict('waiting_offer_closed');
    const offers=await tx.select().from(waitingOffersTable).where(and(eq(waitingOffersTable.clinicId,operatingClinic(fresh)),eq(waitingOffersTable.entryId,id),eq(waitingOffersTable.status,'offered')));
    if(offers[0])await releaseOffer(tx,fresh,offers[0],entry,'declined');
    else await tx.update(waitingEntriesTable).set({status:'declined',version:entry.version+1,updatedAt:new Date()}).where(and(and(eq(waitingEntriesTable.clinicId,operatingClinic(fresh)), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.id,id)));
    // Decision reasons may be personal. Record that one was supplied, not the text in the audit payload.
    await waitingAudit(tx,fresh,'declined',id,{reasonRecorded:Boolean(input.reason),offerId:offers[0]?.id??null});
    if(offers[0])await offerNextReplacement(tx,fresh,await findCancelled(tx,fresh,offers[0].cancelledAppointmentId));
    return id;
  });
}
export async function confirmReplacement(actor:User,id:number,input:{idempotencyKey:string;confirmed:true}) {
  return withOperations(actor,true,async(tx,fresh)=>{
    requireWaiting(fresh,true);const clinicId=operatingClinic(fresh),operation=`waiting:confirm:${id}`;
    const [offer]=await tx.select().from(waitingOffersTable).where(and(eq(waitingOffersTable.clinicId,clinicId),eq(waitingOffersTable.id,id)));
    if(!offer)throw notFound('waiting_offer_not_found');
    const replay=await replayOperation(tx,fresh,operation,input);if(replay)return replay;
    if(offer.status!=='offered')throw conflict('waiting_offer_closed');
    const entry=await findEntry(tx,fresh,offer.entryId),vacancy=await findCancelled(tx,fresh,offer.cancelledAppointmentId);
    const context=entry.status==='offered'&&entry.version===offer.entryVersion&&vacancy.version===offer.cancellationVersion?await fittingContext(tx,fresh,entry,vacancy):null;
    if(!context||Date.parse(context.selected.endsAt)!==offer.endsAt.getTime()){
      await releaseOffer(tx,fresh,offer,entry,entry.windowEnd.getTime()<=Date.now()?'expired':'unavailable');
      const next=await offerNextReplacement(tx,fresh,vacancy);
      // Return (do not throw) so invalidation and the next suggestion COMMIT before HTTP 409.
      return {error:'waiting_offer_changed',nextOfferId:next?.id??null};
    }
    const [service]=await tx.select({definition:servicesTable.definition}).from(servicesTable).where(and(and(eq(servicesTable.clinicId,clinicId), activeBranch(servicesTable.branchId)),eq(servicesTable.id,entry.serviceId)));
    if(!service)throw notFound('record_not_found');
    // No silent bypass of required intake through the waiting-list shortcut.
    // Such services must be booked with their intake form through Create Appointment.
    let serviceIntake;
    try{serviceIntake=intakeSnapshot(service.definition,{});}catch(e){if(e instanceof ServiceDefinitionError)throw badRequest('service_intake_booking_required');throw e;}
    const [appointment]=await tx.insert(appointmentsTable).values({clinicId,branchId:vacancy.branchId,customerId:entry.customerId,serviceId:entry.serviceId,
      employeeId:vacancy.employeeId,roomId:context.selected.roomId,startsAt:new Date(context.selected.startsAt),endsAt:new Date(context.selected.endsAt),
      durationMinutes:context.durationMinutes,requiresRoom:context.requiresRoom,serviceIntake,status:'confirmed',createdBy:fresh.id}).returning();
    await recordAppointmentHistory(tx,fresh,'created',null,appointment!);
    await tx.update(waitingOffersTable).set({status:'booked',replacementAppointmentId:appointment!.id,decidedAt:new Date()}).where(and(eq(waitingOffersTable.clinicId,clinicId),eq(waitingOffersTable.id,id)));
    await tx.update(waitingEntriesTable).set({status:'booked',version:entry.version+1,updatedAt:new Date()}).where(and(and(eq(waitingEntriesTable.clinicId,clinicId), activeBranch(waitingEntriesTable.branchId)),eq(waitingEntriesTable.id,entry.id)));
    await waitingAudit(tx,fresh,'replacement_confirmed',entry.id,{offerId:id,appointmentId:appointment!.id,cancelledAppointmentId:vacancy.id,explicitConfirmation:true});
    return saveOperation(tx,fresh,operation,input,appointment!.id);
  });
}
/** Explicit refresh is bounded; cancellation itself offers immediately in its own transaction. */
export async function refreshWaiting(actor:User,input:{idempotencyKey:string}) {
  return operationsCommand(actor,'waiting:refresh',input,async(_tx,fresh)=>requireWaiting(fresh,true),async(tx,fresh)=>{
    await expireWaiting(tx,fresh);const clinicId=operatingClinic(fresh);
    const vacancies=await tx.select().from(appointmentsTable).where(and(and(eq(appointmentsTable.clinicId,clinicId), activeBranch(appointmentsTable.branchId)),eq(appointmentsTable.status,'cancelled'),gt(appointmentsTable.startsAt,new Date()),
      sql`not exists (select 1 from waiting_list_offers done where done.clinic_id=${clinicId} and done.cancelled_appointment_id=${appointmentsTable.id} and done.status='booked')`))
      .orderBy(asc(appointmentsTable.startsAt),asc(appointmentsTable.id)).limit(100);
    let count=0;for(const vacancy of vacancies)if(await offerNextReplacement(tx,fresh,vacancy))count++;
    await recordAudit({clinicId,actorUserId:fresh.id,action:'waiting_list.refreshed',details:{checked:vacancies.length,offered:count,bounded:vacancies.length===100}},tx);return count;
  });
}
