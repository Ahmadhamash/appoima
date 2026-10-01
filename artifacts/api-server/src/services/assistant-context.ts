import { activeBranch, activeEmployee } from './branch-scope';
import { createHash } from 'node:crypto';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { appointmentsTable, branchesTable, customersTable, servicesTable, usersTable, waitingEntriesTable, waitingOffersTable, type User } from '@workspace/db';
import { withOperations, type OperationsTx } from './operations-context';
import { slotContext } from './scheduling-slots';
import { canReadAppointment, canReadAll, canonicalJson } from '../domain/scheduling-rules';
import { ASSISTANT_LIMITS, canUseAssistantAction } from '../domain/assistant-rules';
import { assistantActionSchema, assistantAppointmentsQuery, type AssistantActionInput } from '../domain/assistant-validation';
import { briefFacts, draftReply, summaryText, waitingText, assistantTime, type AppointmentBrief, type AssistantActionResult, type AssistantWaiting } from '../domain/assistant-format';
import { forbidden, notFound, badRequest } from '../lib/errors';
import type { ProviderPacket } from '../ai/types';
const name=(table:typeof customersTable|typeof servicesTable|typeof usersTable|typeof branchesTable)=>({id:table.id,name:table.name,nameLang:table.nameLang});
const selection={id:appointmentsTable.id,clinicId:appointmentsTable.clinicId,employeeId:appointmentsTable.employeeId,version:appointmentsTable.version,status:appointmentsTable.status,
  startsAt:appointmentsTable.startsAt,endsAt:appointmentsTable.endsAt,durationMinutes:appointmentsTable.durationMinutes,timeZone:branchesTable.timeZone,
  customer:name(customersTable),service:name(servicesTable),employee:name(usersTable),branch:name(branchesTable)};
function briefQuery(tx:OperationsTx) {
  return tx.select(selection).from(appointmentsTable)
    .innerJoin(branchesTable,and(eq(branchesTable.id,appointmentsTable.branchId),and(eq(branchesTable.clinicId,appointmentsTable.clinicId), activeBranch(branchesTable.id))))
    .innerJoin(customersTable,and(eq(customersTable.id,appointmentsTable.customerId),and(eq(customersTable.clinicId,appointmentsTable.clinicId), activeBranch(customersTable.branchId))))
    .innerJoin(servicesTable,and(eq(servicesTable.id,appointmentsTable.serviceId),and(eq(servicesTable.clinicId,appointmentsTable.clinicId), activeBranch(servicesTable.branchId))))
    .innerJoin(usersTable,and(eq(usersTable.id,appointmentsTable.employeeId),and(eq(usersTable.clinicId,appointmentsTable.clinicId), activeEmployee())));
}
type BriefRow=Awaited<ReturnType<typeof briefQuery>>[number];
function publicBrief(row:BriefRow):AppointmentBrief {
  return {id:row.id,version:row.version,status:row.status,startsAt:row.startsAt.toISOString(),endsAt:row.endsAt.toISOString(),durationMinutes:row.durationMinutes,timeZone:row.timeZone,
    customer:row.customer,service:row.service,employee:row.employee,branch:row.branch};
}
async function readBrief(tx:OperationsTx,actor:User,id:number):Promise<AppointmentBrief> {
  const [row]=await briefQuery(tx).where(and(eq(appointmentsTable.id,id),and(eq(appointmentsTable.clinicId,actor.clinicId!), activeBranch(appointmentsTable.branchId))));
  if(!row||!canReadAppointment(actor,row))throw notFound('appointment_not_found');
  return publicBrief(row);
}
export async function assistantAppointmentChoices(actor:User,raw:unknown) {
  const input=assistantAppointmentsQuery.parse(raw);
  return withOperations(actor,false,async(tx,fresh)=>{
    if(!canUseAssistantAction(fresh,'summarize_appointment'))throw forbidden();
    const rows=await briefQuery(tx).where(and(and(eq(appointmentsTable.clinicId,fresh.clinicId!), activeBranch(appointmentsTable.branchId)),canReadAll(fresh)?undefined:eq(appointmentsTable.employeeId,fresh.id),
      input.date?sql`(${appointmentsTable.startsAt} AT TIME ZONE ${branchesTable.timeZone})::date = ${input.date}::date`:undefined))
      .orderBy(desc(appointmentsTable.startsAt),desc(appointmentsTable.id)).limit(21).offset((input.page-1)*20);
    return {items:rows.slice(0,20).map(publicBrief),page:input.page,hasMore:rows.length>20};
  });
}
export type AssistantSnapshot={result:AssistantActionResult;packet:ProviderPacket;stamp:string};
/** No mutation imports: this service only reads via the same scheduling rules/clinic lock. */
export async function prepareAssistantAction(actor:User,raw:unknown):Promise<AssistantSnapshot> {
  const input:AssistantActionInput=assistantActionSchema.parse(raw);
  return withOperations(actor,false,async(tx,fresh)=>{
    if(!canUseAssistantAction(fresh,input.action))throw forbidden();
    const language=input.language,arabic=language==='ar';
    let result:AssistantActionResult;
    let facts:Record<string,unknown>;
    let state:unknown;
    if(input.action==='suggest_slots') {
      const context=await slotContext(tx,fresh,{branchId:input.branchId,serviceId:input.serviceId,employeeId:input.employeeId,date:input.date});
      const slots=context.slots.slice(0,ASSISTANT_LIMITS.slots);
      const text=arabic?(slots.length?`هذه ${slots.length} أوقات مقترحة حسب ساعات الفرع وجدول الموظف ومدة الخدمة وإتاحة الغرفة. ليست حجزاً؛ أكمل خطوات الحجز وراجع الوقت قبل التأكيد.`:'لا توجد أوقات متاحة ضمن هذا الاختيار. جرّب يوماً أو موظفاً آخر من شاشة الحجز.'):
        (slots.length?`Here are ${slots.length} suggested times based on branch hours, staff schedules, service duration and room availability. Nothing is reserved; complete the booking wizard and review the time before confirming.`:'No times are available for this selection. Try another day or employee in the booking screen.');
      result={action:input.action,language,source:'local',readOnly:true,asOf:new Date().toISOString(),text,slots,timeZone:context.branch.timeZone,date:input.date,moreSlots:context.slots.length>slots.length,
        link:{href:'/appointments/new',label:arabic?'فتح خطوات الحجز':'Open booking wizard'}};
      facts={date:input.date,timeZone:context.branch.timeZone,durationMinutes:context.durationMinutes,roomRequired:context.requiresRoom,slots:slots.map(s=>({start:assistantTime(s.startsAt,context.branch.timeZone,language),end:assistantTime(s.endsAt,context.branch.timeZone,language)})),reserved:false};
      state={slots,branchId:input.branchId,serviceId:input.serviceId,employeeId:input.employeeId};
    } else {
      const appointment=await readBrief(tx,fresh,input.appointmentId);
      let text:string;
      let waiting:AssistantWaiting|null|undefined;
      facts=briefFacts(appointment,language);
      state=appointment;
      if(input.action==='explain_waiting') {
        if(appointment.status!=='cancelled')throw badRequest('appointment_not_cancelled');
        const [offer]=await tx.select({offerId:waitingOffersTable.id,entryId:waitingOffersTable.entryId,status:waitingOffersTable.status,startsAt:waitingOffersTable.startsAt,endsAt:waitingOffersTable.endsAt,
          windowStart:waitingEntriesTable.windowStart,windowEnd:waitingEntriesTable.windowEnd,preferredEmployeeId:waitingEntriesTable.preferredEmployeeId,recordedAt:waitingOffersTable.createdAt,
          entryVersion:waitingEntriesTable.version,entryStatus:waitingEntriesTable.status,offerEntryVersion:waitingOffersTable.entryVersion})
          .from(waitingOffersTable).innerJoin(waitingEntriesTable,and(eq(waitingEntriesTable.id,waitingOffersTable.entryId),and(eq(waitingEntriesTable.clinicId,fresh.clinicId!), activeBranch(waitingEntriesTable.branchId))))
          .where(and(eq(waitingOffersTable.clinicId,fresh.clinicId!),eq(waitingOffersTable.cancelledAppointmentId,appointment.id),inArray(waitingOffersTable.status,['offered','booked']))).limit(1);
        waiting=offer&&(offer.status==='offered'||offer.status==='booked')?{offerId:offer.offerId,entryId:offer.entryId,status:offer.status,startsAt:offer.startsAt.toISOString(),endsAt:offer.endsAt.toISOString(),
          windowStart:offer.windowStart.toISOString(),windowEnd:offer.windowEnd.toISOString(),hasEmployeePreference:offer.preferredEmployeeId!==null,recordedAt:offer.recordedAt.toISOString()}:null;
        text=waitingText(waiting,language);
        facts={...facts,offerStatus:waiting?.status??'none',eligibilityRechecked:false,automaticallyBooked:false,
          ...(waiting?{requestedStart:assistantTime(waiting.windowStart,appointment.timeZone,language),requestedEnd:assistantTime(waiting.windowEnd,appointment.timeZone,language),hasEmployeePreference:waiting.hasEmployeePreference}: {})};
        state={appointment,waiting,entryVersion:offer?.entryVersion,entryStatus:offer?.entryStatus,offerEntryVersion:offer?.offerEntryVersion};
      } else text=input.action==='draft_reply'?draftReply(appointment,language):summaryText(appointment,language);
      result={action:input.action,language,source:'local',readOnly:true,asOf:new Date().toISOString(),text,appointment,
        link:{href:`/appointments/${appointment.id}`,label:arabic?'فتح الموعد للمراجعة':'Open appointment to review'},...(waiting!==undefined?{waiting}:{})};
    }
    const stamp=createHash('sha256').update(canonicalJson({state,facts,userId:fresh.id,clinicId:fresh.clinicId,role:fresh.role,permissions:[...fresh.permissions].sort()})).digest('hex');
    return {result,packet:{action:input.action,language,approvedText:result.text,facts},stamp};
  });
}
