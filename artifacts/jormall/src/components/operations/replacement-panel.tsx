import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/setup-api';
import { useI18n,useErrorMessage } from '@/lib/i18n';
import { formatAppointmentTime } from '@/lib/scheduling-api';
import { useOperationsCommand, type Replacement } from '@/lib/operations-api';
import { EnteredName } from '@/components/setup/controls';
import { FormError,FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
export function ReplacementPanel({appointmentId}:{appointmentId:number}) {
  const {user}=useAuth(),{t,lang}=useI18n(),errorMessage=useErrorMessage(),[,navigate]=useLocation();
  const allowed=can(user,'appointments.manage'),[declining,setDeclining]=useState(false),[reason,setReason]=useState('');
  const q=useQuery({queryKey:['operations','replacement',appointmentId],queryFn:()=>api<Replacement>(`/clinic/appointments/${appointmentId}/replacement`),enabled:allowed});
  const confirm=useOperationsCommand(r=>navigate(`/appointments/${r.id}?booked=1`)),decline=useOperationsCommand(()=>{setDeclining(false);setReason('');}),refresh=useOperationsCommand(undefined,true);
  if(!allowed)return null;
  const s=q.data?.suggestion,busy=confirm.isPending||decline.isPending||refresh.isPending||q.isFetching;
  return <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4 sm:p-5" data-testid="replacement-panel">
    <h2 className="font-semibold">{t('p4.suggestionTitle')}</h2><p className="text-sm text-muted-foreground">{t('p4.suggestionHint')}</p>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!s?<p className="text-sm" data-testid="no-replacement">{t('p4.noSuggestion')}</p>:s.offer.status==='booked'?<div className="space-y-2"><p role="status">{t('p4.replacementBooked')}</p><Link href={`/appointments/${s.offer.replacementAppointmentId}`} className="focus-ring inline-block rounded text-sm underline" data-testid="replacement-booked-link">{t('p3.open')}</Link></div>:<div className="space-y-4" data-testid={`replacement-offer-${s.offer.id}`}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {[['customer',s.customer],['service',s.service],['employee',s.employee],['branch',s.branch]].map(([key,item])=><div key={key as string}><dt className="text-xs text-muted-foreground">{t(`p3.${key}`)}</dt><dd className="mt-1 font-medium"><EnteredName item={item as typeof s.customer}/></dd></div>)}
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t('p3.dateTime')}</dt><dd className="mt-1 font-semibold">{formatAppointmentTime(s.offer.startsAt,s.branch.timeZone,lang,true)} – {formatAppointmentTime(s.offer.endsAt,s.branch.timeZone,lang)}</dd><p className="text-xs text-muted-foreground">{t('p3.timeZone',{zone:s.branch.timeZone})}</p></div>
        {s.contact&&<div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{t('p3.customerDetails')}</dt><dd className="break-all"><bdi dir="ltr">{[s.contact.phone,s.contact.email].filter(Boolean).join(' · ')}</bdi></dd></div>}
      </dl>
      {s.entry.note&&<p className="whitespace-pre-wrap break-words text-sm" lang={s.entry.noteLang} dir={s.entry.noteLang==='ar'?'rtl':'ltr'}>{s.entry.note}</p>}
      {!declining?<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>confirm.mutate({path:`/clinic/waiting-list/offers/${s.offer.id}/confirm`,body:{confirmed:true}})} data-testid="confirm-replacement">{t('p4.confirmReplacement')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setDeclining(true)} data-testid="decline-replacement">{t('p4.decline')}</Button></div>:<form className="space-y-3" onSubmit={e=>{e.preventDefault();decline.mutate({path:`/clinic/waiting-list/${s.entry.id}/decline`,body:{expectedVersion:s.entry.version,reason}});}}>
        <fieldset className="space-y-3" disabled={busy}><FormField label={t('p4.declineReason')} value={reason} onChange={e=>setReason(e.target.value)} required maxLength={1000} testId="replacement-decline-reason"/>
        <div className="flex flex-wrap gap-2"><Button type="submit" data-testid="confirm-decline-replacement">{t('p4.declineNext')}</Button><Button type="button" variant="outline" onClick={()=>setDeclining(false)} data-testid="cancel-decline-replacement">{t('common.cancel')}</Button></div></fieldset>
      </form>}
    </div>}
    <FormError message={confirm.error?errorMessage(confirm.error):decline.error?errorMessage(decline.error):refresh.error?errorMessage(refresh.error):undefined}/>
    {s?.offer.status!=='booked'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>refresh.mutate({path:`/clinic/appointments/${appointmentId}/replacement/suggest`,body:{}})} data-testid="refresh-replacement">{t('p4.checkAgain')}</Button>}
  </section>;
}
