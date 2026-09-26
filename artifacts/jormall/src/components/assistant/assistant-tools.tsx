import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { stageBookingSuggestion } from '@/lib/assistant-booking-context';
import { useAuth } from '@/lib/auth';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { formatAppointmentTime, localDate, queryString, type Catalog } from '@/lib/scheduling-api';
import { safeAssistantHref, type AssistantAction, type AssistantBootstrap, type AssistantRequest, type AssistantResult, type AppointmentBrief } from '@/lib/assistant-api';
import { SelectField, EnteredName, CheckField, controlClass } from '@/components/setup/controls';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
export function AssistantTools({bootstrap,onClose}:{bootstrap:AssistantBootstrap;onClose:()=>void}) {
  const {user}=useAuth();const {lang,t}=useI18n();const errorMessage=useErrorMessage();const [location,navigate]=useLocation();const dateId=useId(),filterId=useId();
  const match=/^\/appointments\/([1-9]\d*)(?:\/reschedule)?(?:\?.*)?$/.exec(location);
  const [action,setAction]=useState<AssistantAction>(bootstrap.actions.includes('summarize_appointment')?'summarize_appointment':bootstrap.actions[0]??'summarize_appointment');
  const [appointmentId,setAppointmentId]=useState(match?Number(match[1]):0),[useContext,setUseContext]=useState(Boolean(match));
  const [page,setPage]=useState(1),[filterDate,setFilterDate]=useState('');
  const [branchId,setBranchId]=useState(0),[serviceId,setServiceId]=useState(0),[employeeId,setEmployeeId]=useState(0),[date,setDate]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[result,setResult]=useState<AssistantResult|null>(null),[lastRequest,setLastRequest]=useState<AssistantRequest|null>(null);
  const [consent,setConsent]=useState(false),[copyState,setCopyState]=useState<'copied'|'copyError'|null>(null);const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const enabled=bootstrap.actionsEnabled&&bootstrap.actions.includes(action);
  const catalog=useQuery({queryKey:['assistant',user!.id,user!.clinicId,'catalog',branchId,serviceId],queryFn:()=>api<Catalog>(`/clinic/scheduling/catalog?${queryString({branchId:branchId||undefined,serviceId:serviceId||undefined})}`),enabled:enabled&&action==='suggest_slots',gcTime:0,staleTime:0,retry:false});
  const choices=useQuery({queryKey:['assistant',user!.id,user!.clinicId,'choices',page,filterDate],queryFn:()=>api<{items:AppointmentBrief[];page:number;hasMore:boolean}>(`/assistant/appointments?${queryString({page,date:filterDate})}`),enabled:enabled&&action!=='suggest_slots'&&!useContext,gcTime:0,staleTime:0,retry:false});
  const branch=catalog.data?.branches.find(item=>item.id===branchId);
  useEffect(()=>{if(!branchId&&catalog.data?.branches.length)setBranchId(catalog.data.branches.find(item=>item.id===user?.branchId)?.id??catalog.data.branches[0]!.id);},[branchId,catalog.data,user?.branchId]);
  useEffect(()=>{if(branch&&!date)setDate(localDate(branch.timeZone));},[branch,date]);
  const invalidate=()=>{setResult(null);setLastRequest(null);setConsent(false);setCopyState(null);setError(null);};
  async function run() {
    if(busy||!enabled)return;
    const request:AssistantRequest=action==='suggest_slots'?{action,language:lang,branchId,serviceId,employeeId,date}:{action,language:lang,appointmentId};
    setBusy(true);invalidate();
    try{const value=await api<AssistantResult>('/assistant/actions',{method:'POST',body:request});if(alive.current){setResult(value);setLastRequest(request);}}
    catch(err){if(alive.current)setError(err);}finally{if(alive.current)setBusy(false);}
  }
  async function generate() {
    if(busy||!consent||!lastRequest)return;setBusy(true);setError(null);setCopyState(null);
    // Do not retain an earlier AI draft while a fresh request is being checked.
    setResult(previous=>{if(!previous)return previous;const {generation:_generation,...local}=previous;return local;});
    try{const value=await api<AssistantResult>('/assistant/generate',{method:'POST',body:{consent:true,request:lastRequest}});if(alive.current)setResult(value);}
    catch(err){if(alive.current)setError(err);}finally{if(alive.current){setBusy(false);setConsent(false);}}
  }
  async function copy(text:string) {
    try{await navigator.clipboard.writeText(text);if(alive.current)setCopyState('copied');}catch{if(alive.current)setCopyState('copyError');}
  }
  if(!bootstrap.actionsEnabled)return <p className="text-sm">{t('p5.actionsDisabled')}</p>;
  if(!bootstrap.actions.length)return <p className="text-sm">{t('p5.noActions')}</p>;
  return <section className="space-y-4" aria-label={t('p5.tools')}>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <SelectField label={t('p5.actionLabel')} value={action} onChange={value=>{setAction(value as AssistantAction);invalidate();}} testId="assistant-action-select">{bootstrap.actions.map(value=><option key={value} value={value}>{t(`p5.actions.${value}`)}</option>)}</SelectField>
      {action==='suggest_slots'?<>
        {catalog.isError?<><FormError message={errorMessage(catalog.error)}/><Button variant="outline" onClick={()=>void catalog.refetch()} data-testid="assistant-retry-catalog">{t('p5.retry')}</Button></>:catalog.isPending?<p role="status">{t('common.loading')}</p>:<>
          <SelectField label={t('p5.branch')} value={branchId||''} testId="assistant-slot-branch" required onChange={value=>{setBranchId(Number(value));setServiceId(0);setEmployeeId(0);setDate('');invalidate();}}><option value="">{t('p5.choose')}</option>{catalog.data?.branches.map(item=><option key={item.id} value={item.id} lang={item.nameLang} dir={item.nameLang==='ar'?'rtl':'ltr'}>{item.name}</option>)}</SelectField>
          <SelectField label={t('p5.service')} value={serviceId||''} testId="assistant-slot-service" required onChange={value=>{setServiceId(Number(value));setEmployeeId(0);invalidate();}}><option value="">{t('p5.choose')}</option>{catalog.data?.services.map(item=><option key={item.id} value={item.id} lang={item.nameLang} dir={item.nameLang==='ar'?'rtl':'ltr'}>{item.name}</option>)}</SelectField>
          <SelectField label={t('p5.employee')} value={employeeId||''} testId="assistant-slot-employee" required onChange={value=>{setEmployeeId(Number(value));invalidate();}}><option value="">{t('p5.choose')}</option>{catalog.data?.employees.map(item=><option key={item.id} value={item.id} lang={item.nameLang} dir={item.nameLang==='ar'?'rtl':'ltr'}>{item.name}</option>)}</SelectField>
          <div className="space-y-1.5"><label htmlFor={dateId} className="text-sm font-medium">{t('p3.date')}</label><input id={dateId} type="date" value={date} onChange={event=>{setDate(event.target.value);invalidate();}} className={controlClass} data-testid="assistant-slot-date"/></div>
          {branch&&<p className="text-xs text-muted-foreground">{t('p5.timeZone',{zone:branch.timeZone})}</p>}
        </>}
      </>:<>
        {useContext?<div className="space-y-2 rounded-lg bg-muted/50 p-3"><p className="text-sm">{t('p5.contextAppointment')} <bdi>#{appointmentId}</bdi></p><Button variant="outline" onClick={()=>{setUseContext(false);setAppointmentId(0);invalidate();}} data-testid="assistant-change-appointment">{t('p5.changeSelection')}</Button></div>:<>
          <div className="space-y-1.5"><label htmlFor={filterId} className="text-sm font-medium">{t('p5.dateFilter')}</label><input id={filterId} type="date" value={filterDate} onChange={event=>{setFilterDate(event.target.value);setPage(1);setAppointmentId(0);invalidate();}} className={controlClass} data-testid="assistant-date-filter"/></div>
          {filterDate&&<Button variant="outline" onClick={()=>{setFilterDate('');setPage(1);setAppointmentId(0);invalidate();}} data-testid="assistant-clear-filter">{t('p5.allDates')}</Button>}
          {choices.isError?<><FormError message={errorMessage(choices.error)}/><Button variant="outline" onClick={()=>void choices.refetch()} data-testid="assistant-retry-choices">{t('p5.retry')}</Button></>:choices.isPending?<p role="status">{t('common.loading')}</p>:<>
            <SelectField label={t('p5.appointment')} value={appointmentId||''} required testId="assistant-appointment-select" onChange={value=>{setAppointmentId(Number(value));invalidate();}}><option value="">{t('p5.choose')}</option>{choices.data?.items.map(item=><option key={item.id} value={item.id} lang={item.customer.nameLang} dir={item.customer.nameLang==='ar'?'rtl':'ltr'}>#{item.id} · {item.customer.name} · {formatAppointmentTime(item.startsAt,item.timeZone,lang,true)} · {t(`p3.statuses.${item.status}`)}</option>)}</SelectField>
            {!choices.data?.items.length&&<p className="text-sm">{t('p5.emptyAppointments')}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={page===1} data-testid="assistant-previous" onClick={()=>{setPage(value=>value-1);setAppointmentId(0);invalidate();}}>{t('p5.previous')}</Button><span className="text-xs">{t('p5.page',{page})}</span><Button variant="outline" disabled={!choices.data?.hasMore} data-testid="assistant-next" onClick={()=>{setPage(value=>value+1);setAppointmentId(0);invalidate();}}>{t('p5.next')}</Button></div>
          </>}
        </>}
        <p className="text-xs text-muted-foreground">{t('p5.appointmentHint')}</p>
        {action==='explain_waiting'&&<p className="text-xs text-muted-foreground">{t('p5.waitingHint')}</p>}
      </>}
      <Button type="button" onClick={()=>void run()} disabled={!enabled||(action==='suggest_slots'?!(branchId&&serviceId&&employeeId&&date)||catalog.isFetching:!appointmentId)} data-testid="assistant-run-action">{busy?t('common.loading'):t('p5.run')}</Button>
    </fieldset>
    <FormError message={error?errorMessage(error):undefined}/>
    {result&&<div className="space-y-4 rounded-lg border p-3" data-testid="assistant-action-result" aria-live="polite">
      <div><h3 className="text-sm font-semibold">{t('p5.readOnly')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('p5.snapshot',{time:new Date(result.asOf).toLocaleTimeString(lang==='ar'?'ar-JO':'en-GB')})}</p></div>
      {result.appointment&&<dl className="grid grid-cols-2 gap-3 text-sm">{(['customer','service','employee','branch'] as const).map(key=><div className="min-w-0" key={key}><dt className="text-xs text-muted-foreground">{t(`p5.${key}`)}</dt><dd><EnteredName item={result.appointment![key]}/></dd></div>)}<div><dt className="text-xs text-muted-foreground">{t('p5.status')}</dt><dd>{t(`p3.statuses.${result.appointment.status}`)}</dd></div></dl>}
      {result.action==='draft_reply'&&<p className="text-xs font-semibold">{t('p5.unsent')}</p>}
      <p className="whitespace-pre-wrap break-words text-sm" data-testid="assistant-local-text">{result.text}</p>
      {result.slots&&<div className="space-y-2">{result.slots.map(slot=><p key={slot.startsAt} className="rounded border px-3 py-2 text-sm" data-testid="assistant-suggested-slot">{formatAppointmentTime(slot.startsAt,result.timeZone!,lang,true)} — {formatAppointmentTime(slot.endsAt,result.timeZone!,lang)}</p>)}<p className="text-xs text-muted-foreground">{t(result.slots.length?'p5.slotsHint':'p5.noSlots')}</p>{result.moreSlots&&<p className="text-xs">{t('p5.moreSlots')}</p>}</div>}
      {result.action==='draft_reply'&&<Button variant="outline" onClick={()=>void copy(result.text)} data-testid="assistant-copy-local">{t('p5.copy')}</Button>}
      {safeAssistantHref(result.link.href)&&<Button variant="outline" className="h-auto whitespace-normal text-start" data-testid="assistant-review-link" onClick={()=>{if(lastRequest?.action==='suggest_slots'&&user?.clinicId)stageBookingSuggestion({userId:user.id,clinicId:user.clinicId,branchId:lastRequest.branchId,serviceId:lastRequest.serviceId,employeeId:lastRequest.employeeId,date:lastRequest.date});navigate(result.link.href);onClose();}}>{result.link.label}</Button>}
      {bootstrap.provider.configured&&<fieldset disabled={busy} className="min-w-0 space-y-3 border-t pt-3"><legend className="px-1 text-sm font-semibold">{t('p5.aiTitle')}</legend><p className="text-xs text-muted-foreground">{t('p5.aiHint')}</p><CheckField checked={consent} onChange={setConsent} label={t('p5.consent')} testId="assistant-ai-consent"/><Button disabled={!consent||!lastRequest} onClick={()=>void generate()} data-testid="assistant-generate">{busy?t('common.loading'):t('p5.generate')}</Button></fieldset>}
      {result.generation&&<div className="space-y-3 border-t pt-3" data-testid="assistant-generated-result"><h4 className="text-sm font-semibold">{t('p5.generated')}</h4><p className="whitespace-pre-wrap break-words text-sm">{result.generation.text}</p>{result.action==='draft_reply'&&<Button variant="outline" data-testid="assistant-copy-generated" onClick={()=>void copy(result.generation!.text)}>{t('p5.copy')}</Button>}{result.generation.usage&&<p className="text-xs text-muted-foreground">{t('p5.usage',{input:result.generation.usage.inputTokens,output:result.generation.usage.outputTokens})}</p>}</div>}
      {copyState&&<p role="status" className="text-xs">{t(`p5.${copyState}`)}</p>}
    </div>}
  </section>;
}
