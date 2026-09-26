import { useEffect,useRef,useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormError,FormField } from '@/components/form-field';
import { SelectField,CheckField,TextareaField,EnteredName } from '@/components/setup/controls';
import { CustomerStep } from './booking-page';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {useManagerBranch} from '@/lib/manager-branch';
import { can } from '@/lib/setup-api';
import { useI18n,useErrorMessage } from '@/lib/i18n';
import { useCatalog,localDate,queryString,formatAppointmentTime,type CustomerChoice } from '@/lib/scheduling-api';
import { useOperationsCommand,type WaitingEntry,type Page } from '@/lib/operations-api';
function WaitingForm({onClose}:{onClose:()=>void}) {
  const {user}=useAuth(),{t,lang}=useI18n(),errorMessage=useErrorMessage(),params=new URLSearchParams(window.location.search);
  const {selectedBranchId}=useManagerBranch();
  const numberParam=(key:string)=>{const n=Number(params.get(key));return Number.isSafeInteger(n)&&n>0?n:undefined;};
  const [branchId,setBranchId]=useState<number|undefined>(()=>numberParam('branchId')),[serviceId,setServiceId]=useState<number|undefined>(()=>numberParam('serviceId')),[employeeId,setEmployeeId]=useState<number|undefined>(()=>numberParam('employeeId'));
  const [customer,setCustomer]=useState<CustomerChoice|null>(null),[preferredDate,setPreferredDate]=useState(params.get('date')??''),[limited,setLimited]=useState(false),[fromTime,setFromTime]=useState('09:00'),[toTime,setToTime]=useState('17:00'),[note,setNote]=useState(''),[noteLang,setNoteLang]=useState<'en'|'ar'>(lang);
  const catalog=useCatalog(branchId,serviceId),branch=catalog.data?.branches.find(b=>b.id===branchId),command=useOperationsCommand(onClose);
  const prefillId=useRef(numberParam('customerId'));
  const prefill=useQuery({queryKey:['setup','customers','waiting-prefill',prefillId.current],queryFn:()=>api<{item:CustomerChoice}>(`/clinic/customers/${prefillId.current}`),enabled:Boolean(prefillId.current)&&can(user,'customers.read')});
  useEffect(()=>{if(prefill.data){setCustomer(prefill.data.item);prefillId.current=undefined;}},[prefill.data]);
  useEffect(()=>{if(!branchId&&catalog.data?.branches.length)setBranchId(catalog.data.branches.find(b=>b.id===selectedBranchId)?.id??catalog.data.branches[0]!.id);},[branchId,catalog.data,selectedBranchId]);
  useEffect(()=>{if(branch&&!preferredDate)setPreferredDate(localDate(branch.timeZone));},[branch,preferredDate]);
  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-testid="waiting-form"><h2 className="font-semibold">{t('p4.addWaiting')}</h2>
    <CustomerStep selected={customer} onSelected={setCustomer} allowSearch={can(user,'customers.read')} allowAdd={can(user,'customers.manage')}/>
    {prefill.error&&<FormError message={errorMessage(prefill.error)}/>}
    {catalog.isError?<FormError message={errorMessage(catalog.error)}/>:catalog.isPending?<p role="status">{t('common.loading')}</p>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();if(!customer||!branchId||!serviceId)return;command.mutate({path:'/clinic/waiting-list',body:{branchId,serviceId,customerId:customer.id,preferredEmployeeId:employeeId??null,preferredDate,...(limited?{fromTime,toTime}:{}),note,noteLang}});}}>
      <fieldset className="space-y-4" disabled={command.isPending}><div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={t('p3.branch')} value={branchId??''} onChange={v=>{setBranchId(Number(v)||undefined);setServiceId(undefined);setEmployeeId(undefined);}} testId="waiting-branch" required><option value="">{t('p4.choose')}</option>{catalog.data?.branches.map(b=><option key={b.id} value={b.id} lang={b.nameLang}>{b.name}</option>)}</SelectField>
        <SelectField label={t('p3.service')} value={serviceId??''} onChange={v=>{setServiceId(Number(v)||undefined);setEmployeeId(undefined);}} testId="waiting-service" required><option value="">{t('p4.choose')}</option>{catalog.data?.services.map(s=><option key={s.id} value={s.id} lang={s.nameLang}>{s.name}</option>)}</SelectField>
        <SelectField label={t('p4.preferredEmployee')} value={employeeId??''} onChange={v=>setEmployeeId(Number(v)||undefined)} testId="waiting-employee"><option value="">{t('p4.anyEmployee')}</option>{serviceId&&catalog.data?.employees.map(s=><option key={s.id} value={s.id} lang={s.nameLang}>{s.name}</option>)}</SelectField>
        <FormField label={t('p4.preferredDay')} type="date" value={preferredDate} min={branch?localDate(branch.timeZone):undefined} onChange={e=>setPreferredDate(e.target.value)} required testId="waiting-date"/>
      </div><p className="text-xs text-muted-foreground">{t('p4.windowHint')} {branch&&t('p3.timeZone',{zone:branch.timeZone})}</p>
      <CheckField label={t('p4.specificWindow')} checked={limited} onChange={setLimited} testId="waiting-time-window"/>
      {limited&&<div className="grid gap-3 sm:grid-cols-2"><FormField label={t('p2.from')} type="time" value={fromTime} onChange={e=>setFromTime(e.target.value)} required testId="waiting-from"/><FormField label={t('p2.to')} type="time" value={toTime} onChange={e=>setToTime(e.target.value)} required testId="waiting-to"/></div>}
      <SelectField label={t('p4.noteLanguage')} value={noteLang} onChange={v=>setNoteLang(v as 'en'|'ar')} testId="waiting-note-language"><option value="en">English</option><option value="ar">العربية</option></SelectField>
      <div lang={noteLang} dir={noteLang==='ar'?'rtl':'ltr'}><TextareaField label={t('p4.note')} value={note} onChange={setNote} maxLength={1000} testId="waiting-note"/></div>
      <FormError message={command.error?errorMessage(command.error):undefined}/>{!customer&&<p className="text-sm text-muted-foreground">{t('p4.selectCustomerFirst')}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!customer||!branchId||!serviceId} data-testid="waiting-save">{command.isPending?t('common.loading'):t('p4.addWaiting')}</Button><Button type="button" variant="outline" onClick={onClose} data-testid="waiting-close-form">{t('p4.closeForm')}</Button></div></fieldset>
    </form>}
  </section>;
}
function WaitingCard({entry,manage}:{entry:WaitingEntry;manage:boolean}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage(),[declining,setDeclining]=useState(false),[reason,setReason]=useState('');
  const command=useOperationsCommand(()=>setDeclining(false));
  return <article className="space-y-3 rounded-xl border bg-card p-4" data-testid={`waiting-entry-${entry.id}`}><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold"><EnteredName item={entry.customer}/></h2><Badge variant="secondary" data-testid={`waiting-status-${entry.id}`} data-status={entry.status}>{t(`p4.statuses.${entry.status}`)}</Badge></div>
    <p className="text-sm"><EnteredName item={entry.service}/> · <EnteredName item={entry.branch}/></p><p className="text-sm text-muted-foreground">{t('p4.preferredEmployee')}: {entry.employee?<EnteredName item={entry.employee}/>:t('p4.anyEmployee')}</p>
    <p className="text-sm">{formatAppointmentTime(entry.windowStart,entry.branch.timeZone,lang,true)} – {formatAppointmentTime(entry.windowEnd,entry.branch.timeZone,lang,true)}</p><p className="text-xs text-muted-foreground">{t('p3.timeZone',{zone:entry.branch.timeZone})}</p>
    {entry.note&&<p className="whitespace-pre-wrap break-words text-sm" lang={entry.noteLang} dir={entry.noteLang==='ar'?'rtl':'ltr'}>{entry.note}</p>}
    {manage&&entry.offerId&&<Link href={`/appointments/${entry.cancelledAppointmentId}`} className="focus-ring inline-block rounded text-sm font-medium underline" data-testid={`waiting-review-${entry.id}`}>{t('p4.reviewSuggestion')}</Link>}
    {manage&&['waiting','offered'].includes(entry.status)&&(!declining?<Button type="button" variant="outline" size="sm" onClick={()=>setDeclining(true)} data-testid={`waiting-decline-${entry.id}`}>{t('p4.withdraw')}</Button>:<form className="space-y-3" onSubmit={e=>{e.preventDefault();command.mutate({path:`/clinic/waiting-list/${entry.id}/decline`,body:{expectedVersion:entry.version,reason}});}}><fieldset disabled={command.isPending} className="space-y-3"><FormField label={t('p4.declineReason')} value={reason} onChange={e=>setReason(e.target.value)} required maxLength={1000} testId={`waiting-reason-${entry.id}`}/><FormError message={command.error?errorMessage(command.error):undefined}/><div className="flex flex-wrap gap-2"><Button type="submit" data-testid={`waiting-decline-save-${entry.id}`}>{t('p4.decline')}</Button><Button type="button" variant="outline" onClick={()=>setDeclining(false)} data-testid={`waiting-decline-cancel-${entry.id}`}>{t('common.cancel')}</Button></div></fieldset></form>)}
  </article>;
}
export default function WaitingListPage() {
  const {user}=useAuth(),{t}=useI18n(),errorMessage=useErrorMessage(),allowed=can(user,'appointments.read'),manage=can(user,'appointments.manage');
  const {selectedBranchId}=useManagerBranch();
  const [adding,setAdding]=useState(()=>new URLSearchParams(window.location.search).get('add')==='1'),[status,setStatus]=useState(''),[branchId,setBranchId]=useState(''),[page,setPage]=useState(1);
  useEffect(()=>{setBranchId(selectedBranchId?String(selectedBranchId):'');setPage(1);},[selectedBranchId]);
  const catalog=useCatalog(undefined,undefined,allowed),refresh=useOperationsCommand(undefined,true),refreshed=useRef(false);
  const q=useQuery({queryKey:['operations','waiting',status,branchId,page],queryFn:()=>api<Page<WaitingEntry>>(`/clinic/waiting-list?${queryString({status,branchId,page,pageSize:20})}`),enabled:allowed});
  useEffect(()=>{if(manage&&!refreshed.current){refreshed.current=true;refresh.mutate({path:'/clinic/waiting-list/refresh',body:{}});}},[manage,refresh.mutate]);
  if(!allowed)return <FormError message={t('p4.permissionDenied')}/>;
  return <div className="mx-auto max-w-5xl space-y-5"><Link href="/appointments" className="focus-ring inline-block rounded text-sm underline" data-testid="waiting-back">{t('p3.back')}</Link><PageHeader title={t('p4.waitingTitle')}/><p className="text-sm text-muted-foreground">{t('p4.waitingIntro')}</p>
    {manage&&<div className="flex flex-wrap gap-2">{!adding&&<Button onClick={()=>setAdding(true)} data-testid="add-waiting-entry">{t('p4.addWaiting')}</Button>}<Button variant="outline" disabled={refresh.isPending} onClick={()=>refresh.mutate({path:'/clinic/waiting-list/refresh',body:{}})} data-testid="refresh-waiting-suggestions">{t('p4.refreshSuggestions')}</Button></div>}
    {manage&&<p className="text-xs text-muted-foreground">{t('p4.refreshHint')}</p>}<FormError message={refresh.error?errorMessage(refresh.error):undefined}/>{adding&&manage&&<WaitingForm onClose={()=>{setAdding(false);setPage(1);setStatus('');refresh.mutate({path:'/clinic/waiting-list/refresh',body:{}});}}/>}
    <div className="grid gap-3 sm:grid-cols-2"><SelectField label={t('p3.branch')} value={branchId} onChange={v=>{setBranchId(v);setPage(1);}} testId="waiting-filter-branch"><option value="">{t('p2.allBranches')}</option>{catalog.data?.branches.map(b=><option key={b.id} value={b.id} lang={b.nameLang}>{b.name}</option>)}</SelectField>
    <SelectField label={t('p3.status')} value={status} onChange={v=>{setStatus(v);setPage(1);}} testId="waiting-filter-status"><option value="">{t('p4.anyStatus')}</option>{['waiting','offered','booked','declined','expired'].map(s=><option key={s} value={s}>{t(`p4.statuses.${s}`)}</option>)}</SelectField></div>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!q.data?.items.length?<p className="rounded-lg border p-4 text-sm" data-testid="waiting-empty">{t('p4.queueEmpty')}</p>:<div className="grid gap-3 sm:grid-cols-2">{q.data.items.map(entry=><WaitingCard key={`${entry.id}-${entry.version}`} entry={entry} manage={manage}/>)}</div>}
    {q.data&&<nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t('p4.waitingTitle')}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)} data-testid="waiting-prev">{t('p2.previous')}</Button><p className="text-xs text-muted-foreground">{t('p2.page',{page,pages:Math.max(1,Math.ceil(q.data.total/20))})}</p><Button variant="outline" disabled={page*20>=q.data.total} onClick={()=>setPage(page+1)} data-testid="waiting-next">{t('p2.next')}</Button></nav>}
  </div>;
}
