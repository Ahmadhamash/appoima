import { useState } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { FormError, FormField } from '@/components/form-field';
import { SelectField, EnteredName } from '@/components/setup/controls';
import { SlotPicker } from '@/components/scheduling/slot-picker';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { useAppointment, useCatalog, useSchedulingCommand, localDate, formatAppointmentTime, type AppointmentDetail, type Slot } from '@/lib/scheduling-api';
function RescheduleForm({appointment:a}: {appointment:AppointmentDetail}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage(),[,navigate]=useLocation();
  const catalog=useCatalog(a.branchId,a.serviceId),[employeeId,setEmployeeId]=useState(a.employeeId),[date,setDate]=useState(localDate(a.branch.timeZone)),[slot,setSlot]=useState<Slot|null>(null),[reason,setReason]=useState(''),[review,setReview]=useState(false);
  const command=useSchedulingCommand((id)=>navigate(`/appointments/${id}`));
  const employee=catalog.data?.employees.find((e)=>e.id===employeeId);
  return <form onSubmit={(e)=>{e.preventDefault();if(!slot||!employee||!reason.trim())return;if(!review){setReview(true);return;}command.mutate({path:`/clinic/appointments/${a.id}/reschedule`,body:{employeeId,startsAt:slot.startsAt,reason,expectedVersion:a.version}});}} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
    <fieldset disabled={command.isPending} className="space-y-5">
      <p className="font-semibold"><EnteredName item={a.customer}/> · <EnteredName item={a.service}/></p>
      <p className="text-sm text-muted-foreground">{t('p3.rescheduleHint')}</p>
      <div><h2 className="text-sm font-medium">{t('p3.originalTime')}</h2><p className="text-sm">{formatAppointmentTime(a.startsAt,a.branch.timeZone,lang,true)} – {formatAppointmentTime(a.endsAt,a.branch.timeZone,lang)}</p></div>
      {catalog.isError?<FormError message={errorMessage(catalog.error)}/>:catalog.isPending?<p role="status">{t('common.loading')}</p>:!review?<>
        <SelectField label={t('p3.employee')} value={employeeId} onChange={(v)=>{setEmployeeId(Number(v));setSlot(null);}} testId="reschedule-employee" required><option value="">{t('p3.selectEmployee')}</option>{catalog.data.employees.map((e)=><option key={e.id} value={e.id} lang={e.nameLang} dir={e.nameLang==='ar'?'rtl':'ltr'}>{e.name}</option>)}</SelectField>
        {employee&&<SlotPicker branchId={a.branchId} serviceId={a.serviceId} employeeId={employeeId} timeZone={a.branch.timeZone} date={date} onDate={setDate} selected={slot} onSelect={setSlot} excludeAppointmentId={a.id}/>}
        <FormField label={t('p3.reason')} value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={1000} required testId="reschedule-reason"/>
      </>:slot&&employee&&<div className="space-y-3 rounded-lg bg-muted/40 p-4"><h2 className="font-medium">{t('p3.newTime')}</h2><p>{formatAppointmentTime(slot.startsAt,a.branch.timeZone,lang,true)} – {formatAppointmentTime(slot.endsAt,a.branch.timeZone,lang)}</p><p className="text-xs">{t('p3.timeZone',{zone:a.branch.timeZone})}</p><p><EnteredName item={employee}/></p><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{reason}</p></div>}
      <FormError message={command.error?errorMessage(command.error):undefined}/>
      <div className="flex flex-wrap gap-2">{review&&<Button type="button" variant="outline" onClick={()=>setReview(false)} data-testid="reschedule-back">{t('p3.back')}</Button>}<Button type="submit" disabled={!slot||!employee||!reason.trim()} data-testid="reschedule-submit">{command.isPending?t('common.loading'):t(review?'p3.confirmAction':'p3.review')}</Button></div>
    </fieldset>
  </form>;
}
export default function ReschedulePage() {
  const [,params]=useRoute('/appointments/:id/reschedule'),id=Number(params?.id),q=useAppointment(id),{t}=useI18n(),errorMessage=useErrorMessage();
  return <div className="mx-auto max-w-3xl space-y-5"><Link href={`/appointments/${id}`} className="focus-ring inline-block rounded text-sm text-muted-foreground" data-testid="reschedule-cancel">{t('p3.back')}</Link><PageHeader title={t('p3.rescheduleTitle')}/>{q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:q.data?.canReschedule?<RescheduleForm key={q.data.id} appointment={q.data}/>:<FormError message={t('p3.accessDenied')}/>}</div>;
}
