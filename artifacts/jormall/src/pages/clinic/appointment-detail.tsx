import { useAuth } from '@/lib/auth';
import { can } from '@/lib/setup-api';
import { emptyConsumption, consumptionBody } from '@/lib/operations-api';
import { CheckField } from '@/components/setup/controls';
import { ConsumptionFields, AppointmentConsumption } from '@/components/operations/consumption';
import { ReplacementPanel } from '@/components/operations/replacement-panel';
import { useState } from 'react';
import { Link, useRoute } from 'wouter';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormError, FormField } from '@/components/form-field';
import { EnteredName, SelectField, TextareaField } from '@/components/setup/controls';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { useAppointment, useSchedulingCommand, formatAppointmentTime, type AppointmentDetail, type Status } from '@/lib/scheduling-api';

function NotesEditor({appointment:a}: {appointment:AppointmentDetail}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage();
  const [notes,setNotes]=useState(a.notes??''),[notesLang,setNotesLang]=useState<'en'|'ar'>(a.notesLang??lang);
  const command=useSchedulingCommand();
  return <form className="space-y-4" onSubmit={(e)=>{e.preventDefault();command.mutate({path:`/clinic/appointments/${a.id}/notes`,body:{notes,notesLang,expectedVersion:a.version}});}}>
    <fieldset disabled={command.isPending} className="space-y-4">
      <SelectField label={t('p3.notesLang')} value={notesLang} onChange={(v)=>setNotesLang(v as 'en'|'ar')} testId="appointment-notes-language"><option value="en">English</option><option value="ar">العربية</option></SelectField>
      <div lang={notesLang} dir={notesLang==='ar'?'rtl':'ltr'}><TextareaField label={t('p3.notes')} value={notes} onChange={setNotes} testId="appointment-notes" hint={t('p3.notesHint')}/></div>
      <FormError message={command.error?errorMessage(command.error):undefined}/>
      <Button type="submit" data-testid="save-appointment-notes">{command.isPending?t('common.loading'):t('p3.saveNotes')}</Button>
    </fieldset>
  </form>;
}
function AppointmentActions({appointment:a}: {appointment:AppointmentDetail}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage();
  const {user}=useAuth();
  const materialPermission=can(user,'inventory.manage') && (can(user,'appointments.manage') || Boolean(user && ['doctor','service_provider'].includes(user.role) && user.id===a.employeeId));
  const [consumption,setConsumption]=useState(emptyConsumption),[recordMaterials,setRecordMaterials]=useState(materialPermission && Boolean(user && ['doctor','service_provider'].includes(user.role)));
  const [action,setAction]=useState<Status|null>(null),[reason,setReason]=useState(''),[notes,setNotes]=useState(a.notes??''),[notesLang,setNotesLang]=useState<'en'|'ar'>(a.notesLang??lang);
  const command=useSchedulingCommand(()=>setAction(null));
  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-testid="appointment-actions">
    <h2 className="font-semibold">{t('p3.statusActions')}</h2>
    {!action?<div className="flex flex-wrap gap-2">{a.nextActions.map((s)=><Button key={s} type="button" variant={s==='cancelled'||s==='no_show'?'outline':'default'} onClick={()=>{setAction(s);setReason('');}} data-testid={`appointment-action-${s}`}>{t(`p3.actions.${s}`)}</Button>)}
      {a.canReschedule&&<Link href={`/appointments/${a.id}/reschedule`} className="focus-ring inline-flex min-h-10 items-center rounded-md border px-4 py-2 text-sm" data-testid="appointment-reschedule">{t('p3.reschedule')}</Link>}
      {!a.nextActions.length&&!a.canReschedule&&<p className="text-sm text-muted-foreground">{t('p3.noActions')}</p>}
    </div>:<form onSubmit={(e)=>{e.preventDefault();command.mutate({path:`/clinic/appointments/${a.id}/status`,body:{status:action,expectedVersion:a.version,reason,...(action==='completed'?{notes,notesLang,...(materialPermission&&recordMaterials?{consumption:consumptionBody(consumption)}:{})}:{})}});}} className="space-y-4">
      <fieldset disabled={command.isPending} className="space-y-4">
        <p className="font-medium">{t(`p3.actions.${action}`)}</p><p className="text-sm text-muted-foreground">{t('p3.actionReview')}</p>
        {(action==='cancelled'||action==='no_show')&&<FormField label={t('p3.reason')} value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={1000} required testId="appointment-action-reason"/>}
        {action==='completed'&&<><SelectField label={t('p3.notesLang')} value={notesLang} onChange={(v)=>setNotesLang(v as 'en'|'ar')} testId="completion-notes-language"><option value="en">English</option><option value="ar">العربية</option></SelectField><div lang={notesLang} dir={notesLang==='ar'?'rtl':'ltr'}><TextareaField label={t('p3.notes')} value={notes} onChange={setNotes} testId="completion-notes" hint={t('p3.notesHint')}/></div></>}
        {action==='completed'&&<><p className="text-xs text-muted-foreground">{t('p4.recordLater')}</p>{materialPermission&&<><CheckField label={t('p4.recordNow')} checked={recordMaterials} onChange={setRecordMaterials} testId="completion-record-materials"/>{recordMaterials&&<ConsumptionFields branchId={a.branchId} value={consumption} onChange={setConsumption}/>}</>}</>}
        <FormError message={command.error?errorMessage(command.error):undefined}/>
        {command.error&&<p className="text-xs text-muted-foreground">{t('p3.retrySame')}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" data-testid="confirm-appointment-action">{command.isPending?t('common.loading'):action==='completed'?t('p3.finishNotes'):t('p3.confirmAction')}</Button><Button type="button" variant="outline" onClick={()=>{setAction(null);command.reset();}} data-testid="dismiss-appointment-action">{t('p3.dismiss')}</Button></div>
      </fieldset>
    </form>}
  </section>;
}
export default function AppointmentDetailPage() {
  const [,params]=useRoute('/appointments/:id'),id=Number(params?.id),q=useAppointment(id);
  const {t,lang}=useI18n(),errorMessage=useErrorMessage();
  const a=q.data;
  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href="/appointments/view" className="focus-ring inline-block rounded text-sm text-muted-foreground" data-testid="detail-back-list">{t('p3.view')}</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title={t('p3.open')}/><Button type="button" variant="outline" disabled={q.isFetching} onClick={()=>void q.refetch()} data-testid="refresh-appointment">{t('p3.refresh')}</Button></div>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:a&&<>
      {new URLSearchParams(window.location.search).has('booked')&&<p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="booking-success">{t('p3.booked')}</p>}
      <section className="rounded-xl border bg-card p-4 sm:p-5" data-testid="appointment-detail">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><h2 className="text-lg font-semibold"><EnteredName item={a.customer}/></h2><Badge variant="secondary" data-testid="appointment-current-status" data-status={a.status}>{t(`p3.statuses.${a.status}`)}</Badge></div>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[['service',a.service],['employee',a.employee],['branch',a.branch]].map(([key,item])=><div key={key as string}><dt className="text-xs text-muted-foreground">{t(`p3.${key}`)}</dt><dd className="mt-1 text-sm"><EnteredName item={item as AppointmentDetail['service']}/></dd></div>)}
          <div><dt className="text-xs text-muted-foreground">{t('p3.room')}</dt><dd className="mt-1 text-sm">{a.room?<EnteredName item={a.room}/>:t('p3.noRoom')}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t('p3.dateTime')}</dt><dd className="mt-1 font-semibold">{formatAppointmentTime(a.startsAt,a.branch.timeZone,lang,true)} – {formatAppointmentTime(a.endsAt,a.branch.timeZone,lang)}</dd><p className="mt-1 text-xs text-muted-foreground">{t('p3.timeZone',{zone:a.branch.timeZone})}</p></div>
        </dl>
      </section>
      <AppointmentActions key={`actions-${a.id}-${a.version}`} appointment={a}/>
      {a.status==='cancelled'&&<ReplacementPanel appointmentId={a.id}/>}
      <AppointmentConsumption appointment={a}/>
      {a.customerDetails&&<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5" data-testid="appointment-customer-details"><h2 className="font-semibold">{t('p3.customerDetails')}</h2>
        <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{t('p2.fields.phone')}</dt><dd className="text-sm"><bdi dir="ltr">{a.customerDetails.phone||'—'}</bdi></dd></div><div><dt className="text-xs text-muted-foreground">{t('p2.fields.email')}</dt><dd className="break-all text-sm"><bdi dir="ltr">{a.customerDetails.email||'—'}</bdi></dd></div></dl>
        <div><h3 className="text-sm font-medium">{t('p2.fields.notes')}</h3><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{a.customerDetails.notes||t('p2.emptyNotes')}</p></div>
        {a.customerDetails.sensitiveNotes!==undefined&&<div className="rounded-lg border p-3" data-testid="appointment-sensitive-notes"><h3 className="text-sm font-medium">{t('p2.fields.sensitiveNotes')}</h3><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{a.customerDetails.sensitiveNotes||t('p2.emptyNotes')}</p></div>}
      </section>}
      {!!a.serviceIntake?.fields.length&&<section className="rounded-xl border bg-card p-4 sm:p-5" data-testid="appointment-service-intake"><h3 className="mb-3 font-semibold">{lang==='ar'?'معلومات الخدمة عند الحجز':'Service information captured at booking'}</h3><dl className="space-y-3">{a.serviceIntake.fields.map(field=><div key={field.id}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap break-words text-sm" dir="auto">{field.value===null?'—':typeof field.value==='boolean'?(field.value?(lang==='ar'?'نعم':'Yes'):(lang==='ar'?'لا':'No')):String(field.value)}</dd></div>)}</dl></section>}
      {a.canEditNotes&&<section className="rounded-xl border bg-card p-4 sm:p-5"><NotesEditor key={`notes-${a.id}-${a.version}`} appointment={a}/></section>}
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-testid="appointment-history"><h2 className="font-semibold">{t('p3.history')}</h2>
        <ol className="space-y-4">{a.history.map((event)=><li key={event.id} className="border-s-2 ps-4 text-sm" data-testid={`appointment-history-${event.id}`}>
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{t(`p3.events.${event.event}`)}</h3><time dateTime={event.at} className="text-xs text-muted-foreground">{formatAppointmentTime(event.at,a.branch.timeZone,lang,true)}</time></div>
          <p className="mt-1 text-xs text-muted-foreground">{t('p3.actor')}: <EnteredName item={event.actor}/></p><p className="mt-1">{event.fromStatus?`${t(`p3.statuses.${event.fromStatus}`)} → `:''}{t(`p3.statuses.${event.toStatus}`)}</p>
          {event.event==='rescheduled'&&event.before&&<dl className="mt-2 space-y-1 text-xs"><div><dt className="font-medium">{t('p3.originalTime')}</dt><dd>{formatAppointmentTime(event.before.startsAt,a.branch.timeZone,lang,true)} – {formatAppointmentTime(event.before.endsAt,a.branch.timeZone,lang)}</dd></div><div><dt className="font-medium">{t('p3.newTime')}</dt><dd>{formatAppointmentTime(event.after.startsAt,a.branch.timeZone,lang,true)} – {formatAppointmentTime(event.after.endsAt,a.branch.timeZone,lang)}</dd></div></dl>}
          {event.reason&&<p className="mt-2 whitespace-pre-wrap break-words text-xs" dir="auto">{event.reason}</p>}
        </li>)}</ol>
      </section>
    </>}
  </div>;
}
