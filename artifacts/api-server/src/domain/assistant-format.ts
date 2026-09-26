import type { AppointmentStatus } from './scheduling-rules';
import type { AssistantLanguage, AssistantAction } from './assistant-rules';
export type AssistantName={id:number;name:string;nameLang:AssistantLanguage};
export type AppointmentBrief={id:number;version:number;status:AppointmentStatus;startsAt:string;endsAt:string;timeZone:string;durationMinutes:number;
  customer:AssistantName;service:AssistantName;employee:AssistantName;branch:AssistantName};
export type AssistantSlot={startsAt:string;endsAt:string;roomId:number|null};
export type AssistantWaiting={offerId:number;entryId:number;status:'offered'|'booked';startsAt:string;endsAt:string;windowStart:string;windowEnd:string;hasEmployeePreference:boolean;recordedAt:string};
export type AssistantActionResult={action:AssistantAction;language:AssistantLanguage;source:'local';readOnly:true;asOf:string;text:string;
  link:{href:string;label:string};appointment?:AppointmentBrief;slots?:AssistantSlot[];timeZone?:string;date?:string;moreSlots?:boolean;waiting?:AssistantWaiting|null};
export const STATUS_LABELS:Record<AssistantLanguage,Record<AppointmentStatus,string>>={
  en:{pending:'Pending',confirmed:'Confirmed',checked_in:'Checked in',in_service:'In service',completed:'Completed',cancelled:'Cancelled',no_show:'No-show'},
  ar:{pending:'معلق',confirmed:'مؤكد',checked_in:'تم تسجيل الحضور',in_service:'الخدمة جارية',completed:'مكتمل',cancelled:'ملغى',no_show:'لم يحضر'},
};
export function assistantTime(value:string,timeZone:string,language:AssistantLanguage) {
  return new Intl.DateTimeFormat(language==='ar'?'ar-JO':'en-GB',{timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
export function briefFacts(a:AppointmentBrief,language:AssistantLanguage) {
  // No IDs, names, contact details, service labels, note text or clinical fields are exported.
  return {status:a.status,statusLabel:STATUS_LABELS[language][a.status],start:assistantTime(a.startsAt,a.timeZone,language),end:assistantTime(a.endsAt,a.timeZone,language),timeZone:a.timeZone,durationMinutes:a.durationMinutes};
}
export function summaryText(a:AppointmentBrief,language:AssistantLanguage):string {
  const f=briefFacts(a,language);
  return language==='ar'?`حالة الموعد: ${f.statusLabel}. يبدأ في ${f.start} حسب ${f.timeZone}، ومدته ${f.durationMinutes} دقيقة. هذا ملخص تشغيلي فقط؛ افتح الموعد لمراجعة التفاصيل والإجراءات المسموحة. لم يُغيّر أي سجل.`:
    `Appointment status: ${f.statusLabel}. Starts ${f.start} (${f.timeZone}), for ${f.durationMinutes} minutes. This is an operational summary only; open the appointment to review permitted details and actions. No record was changed.`;
}
export function draftReply(a:AppointmentBrief,language:AssistantLanguage):string {
  const f=briefFacts(a,language);
  const text:Record<AssistantLanguage,Record<AppointmentStatus,string>>={en:{
    pending:`Your booking request for ${f.start} (${f.timeZone}) is pending confirmation. Please contact the center to confirm the details.`,
    confirmed:`Your appointment is confirmed for ${f.start} (${f.timeZone}). Please contact the center for any changes.`,
    checked_in:'Your arrival has been recorded. Our team will guide you to the next step.',
    in_service:'Your service is currently in progress. Please speak with the staff for assistance.',
    completed:'Thank you for your visit. Your service is marked complete. Please contact the center with any questions.',
    cancelled:`The appointment scheduled for ${f.start} (${f.timeZone}) is marked cancelled. Please contact the center to discuss another time.`,
    no_show:`Our records show that the appointment at ${f.start} (${f.timeZone}) was missed. Please contact the center to discuss another time.`,
  },ar:{
    pending:`طلب حجزك في ${f.start} (${f.timeZone}) بانتظار التأكيد. يرجى التواصل مع المركز لتأكيد التفاصيل.`,
    confirmed:`موعدك مؤكد في ${f.start} (${f.timeZone}). يرجى التواصل مع المركز لأي تغيير.`,
    checked_in:'تم تسجيل حضورك. سيرشدك فريقنا إلى الخطوة التالية.',
    in_service:'الخدمة قيد التنفيذ حالياً. يرجى التحدث مع الفريق عند الحاجة إلى المساعدة.',
    completed:'شكراً لزيارتك. سُجلت الخدمة كمكتملة. يرجى التواصل مع المركز لأي استفسار.',
    cancelled:`الموعد المحدد في ${f.start} (${f.timeZone}) مسجل كملغى. يرجى التواصل مع المركز لمناقشة وقت آخر.`,
    no_show:`تشير سجلاتنا إلى عدم حضور الموعد في ${f.start} (${f.timeZone}). يرجى التواصل مع المركز لمناقشة وقت آخر.`,
  }};
  return text[language][a.status];
}
export function waitingText(waiting:AssistantWaiting|null,language:AssistantLanguage):string {
  if(!waiting)return language==='ar'?'لا يوجد اقتراح مسجل حالي أو بديل محجوز لهذا الإلغاء. لم يُفحص وجود طلبات جديدة في هذه اللوحة. افتح الموعد للتحقق من الاقتراحات؛ لن يتم أي حجز تلقائي.':'There is no current recorded offer or booked replacement for this cancellation. This panel did not scan for new requests. Open the appointment to check suggestions; no booking happens automatically.';
  if(waiting.status==='booked')return language==='ar'?'يسجل النظام أن موظفاً أكد بديل هذا الإلغاء سابقاً. تعرض اللوحة السجل فقط ولم تنشئ حجزاً جديداً.':'The recorded suggestion has already been booked by staff. This panel is describing that record, not creating another booking.';
  return language==='ar'?'هذا اقتراح مسجل من قائمة الانتظار. تُختار الطلبات بالأقدمية بين المتوافقين مع الخدمة والفرع وتفضيل الموظف والمدة والفترة المطلوبة. قد تكون الإتاحة أو الصلاحية تغيرت منذ الاقتراح؛ لم تُفحص مجدداً هنا. افتح الموعد وراجع العميل ثم أكد البديل بنفسك، وسيُعاد التحقق عند التأكيد.':'This is a recorded waiting-list offer. The queue chooses the earliest compatible request by service, branch, employee preference, duration and requested window. Availability or eligibility may have changed since it was suggested; this panel has not rechecked either. Open the appointment, review the customer and explicitly confirm the replacement there; confirmation rechecks availability.';
}
