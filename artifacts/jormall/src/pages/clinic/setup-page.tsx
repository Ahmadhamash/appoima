import { ResourceList } from '@/components/setup/resource-list';
import { ServiceActualUse } from '@/components/operations/consumption';
import { CustomerHistory } from '@/components/scheduling/customer-history';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FormError, PasswordField } from '@/components/form-field';
import { RecordForm } from '@/components/setup/record-form';
import { ServiceBatchForm } from '@/components/setup/service-batch-form';
import { EnteredName, HoursReadout, controlClass } from '@/components/setup/controls';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { AREA, can, recordPath, type Resource, type RecordItem, type Options, type ListResult } from '@/lib/setup-api';
import { instantToLocal } from '@/lib/branch-time';

type Mode = { kind: 'view' | 'edit'; id: number } | { kind: 'create' } | null;
function Fact({ label, children }: {label: string; children: ReactNode}) {
  return <div className="min-w-0 space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm">{children}</dd></div>;
}
function PasswordReset({ record, onSaved }: {record: RecordItem; onSaved: (message: string)=>void}) {
  const { t }=useI18n(), errorMessage=useErrorMessage();
  const [value,setValue]=useState(''), [validation,setValidation]=useState('');
  const mutation=useMutation({ mutationFn:()=>api(`/clinic/employees/${record.id}/password`,{method:'POST',body:{initialPassword:value}}), onSuccess:()=>{setValue('');onSaved(t('p2.passwordReset'));} });
  return <details className="rounded-lg border p-3"><summary className="focus-ring cursor-pointer rounded text-sm font-medium" data-testid="reset-password-details">{t('p2.resetPassword')}</summary><form className="mt-3 space-y-3" onSubmit={(event)=>{event.preventDefault();if(value.length<10){setValidation(t('errors.passwordTooShort'));return;}setValidation('');mutation.mutate();}} noValidate>
    <PasswordField label={t('p2.fields.initialPassword')} value={value} onChange={(e)=>setValue(e.target.value)} minLength={10} maxLength={200} autoComplete="new-password" error={validation} hint={t('owner.initialPasswordHint')} data-testid="reset-password-input"/>
    <FormError message={mutation.error?errorMessage(mutation.error):undefined}/><Button type="submit" disabled={mutation.isPending} data-testid="reset-password-submit">{mutation.isPending?t('common.loading'):t('p2.resetPassword')}</Button>
  </form></details>;
}
function RecordDetails({ resource, record, options, manage, onEdit, onSaved }: {resource: Resource; record: RecordItem; options: Options; manage: boolean; onEdit: ()=>void; onSaved: (message: string)=>void}) {
  const { t }=useI18n(), {user}=useAuth(), errorMessage=useErrorMessage();
  const branch=options.branches.find((b)=>b.id===record.branchId);
  const employees=options.employees.filter((e)=>record.employeeIds?.includes(e.id));
  const services=options.services.filter((s)=>record.serviceIds?.includes(s.id));
  const canEdit=manage && (resource!=='employees'||record.canEditAccess===true);
  const activeMutation=useMutation({mutationFn:()=>api(`/clinic/employees/${record.id}/active`,{method:'PATCH',body:{isActive:!record.isActive}}),onSuccess:()=>onSaved(t('p2.accountUpdated'))});
  const names=(records: Options['services']) => records.length ? records.map((r)=><span key={r.id} className="me-2 inline-block"><EnteredName item={r}/></span>) : t('p2.noneSelected');
  return <div className="space-y-5" data-testid={`details-${resource}`}>
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2"><Fact label={t('p2.fields.name')}><EnteredName item={record}/></Fact>
    {resource!=='branches' && <Fact label={t('p2.fields.branchId')}>{branch?<EnteredName item={branch}/>:t('p2.allBranches')}</Fact>}
    {resource==='branches'&&<Fact label={t('p2.fields.timeZone')}><bdi>{record.timeZone}</bdi></Fact>}
    {resource==='services'&&<><Fact label={t('p2.fields.durationMinutes')}>{t('p2.minutes',{count:record.durationMinutes??0})}</Fact><Fact label={t('p2.fields.price')}><bdi>{record.price} {record.currency}</bdi></Fact><Fact label={t('p2.fields.category')}>{t(`p2.categories.${record.category}`)}</Fact><Fact label={t('p2.fields.requiresRoom')}>{t(record.requiresRoom?'common.yes':'common.no')}</Fact><Fact label={t('p2.fields.employeeIds')}>{names(employees)}</Fact></>}
    {resource==='rooms'&&<><Fact label={t('p2.fields.capacity')}>{record.capacity}</Fact><Fact label={t('p2.fields.status')}>{t(`p2.${record.status}`)}</Fact><Fact label={t('p2.fields.serviceIds')}>{names(services)}</Fact></>}
    {(resource==='customers'||resource==='employees')&&<><Fact label={t('p2.fields.email')}><bdi dir="ltr">{record.email||'—'}</bdi></Fact><Fact label={t('p2.fields.phone')}><bdi dir="ltr">{record.phone||'—'}</bdi></Fact></>}
    {resource==='employees'&&<><Fact label={t('p2.fields.role')}>{t(`roles.${record.role}`)}</Fact><Fact label={t('p2.fields.jobTitle')}>{record.jobTitle||'—'}</Fact>{['doctor','service_provider'].includes(record.role??'')&&<Fact label={t('p2.fields.serviceIds')}>{names(services)}</Fact>}</>}
    {(resource==='employees'||resource==='services')&&<Fact label={t('p2.fields.isActive')}>{t(record.isActive?'common.active':'common.inactive')}</Fact>}
    </dl>
    {resource==='branches'&&record.openingHours&&<section className="rounded-lg border p-4"><h3 className="mb-3 font-medium">{t('p2.fields.openingHours')}</h3><HoursReadout value={record.openingHours}/></section>}
    {resource==='services'&&<section className="rounded-lg bg-muted/50 p-4"><ServiceActualUse serviceId={record.id}/></section>}
    {resource==='customers'&&<><section><h3 className="text-sm font-semibold">{t('p2.fields.notes')}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm" lang={record.nameLang} dir={record.nameLang==='ar'?'rtl':'ltr'}>{record.notes||t('p2.emptyNotes')}</p></section>{record.sensitiveNotes!==undefined&&<section className="rounded-lg border p-4" data-testid="sensitive-notes"><h3 className="text-sm font-semibold">{t('p2.fields.sensitiveNotes')}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm" lang={record.nameLang} dir={record.nameLang==='ar'?'rtl':'ltr'}>{record.sensitiveNotes||t('p2.emptyNotes')}</p><p className="mt-2 text-xs text-muted-foreground">{t('p2.sensitiveHint')}</p></section>}<CustomerHistory customerId={record.id} enabled={record.historyAvailable===true}/></>}
    {resource==='employees'&&<><details className="rounded-lg border p-3"><summary className="focus-ring cursor-pointer rounded font-medium" data-testid="view-staff-schedule">{t('p2.schedule')}</summary><div className="mt-4 space-y-4">{record.workingHours&&<section><h3 className="mb-2 text-sm font-semibold">{t('p2.fields.workingHours')}</h3><HoursReadout value={record.workingHours}/></section>}{record.breaks&&<section><h3 className="mb-2 text-sm font-semibold">{t('p2.fields.breaks')}</h3><HoursReadout value={record.breaks}/></section>}<section><h3 className="mb-2 text-sm font-semibold">{t('p2.fields.timeOff')}</h3><p className="mb-2 text-xs text-muted-foreground">{t('p2.timeOffZone',{zone:branch?.timeZone??'UTC'})}</p>{record.timeOff?.length?record.timeOff.map((leave,i)=><div key={i} className="mb-2 text-sm"><p dir="ltr">{instantToLocal(leave.startsAt,branch?.timeZone??'UTC').replace('T',' ')} – {instantToLocal(leave.endsAt,branch?.timeZone??'UTC').replace('T',' ')}</p><p>{leave.note}</p></div>):<p className="text-sm text-muted-foreground">{t('p2.noneSelected')}</p>}</section></div></details>
      {record.permissions&&<section><h3 className="mb-2 text-sm font-semibold">{t('p2.fields.permissions')}</h3><div className="flex flex-wrap gap-2">{record.permissions.map((p)=>{const[area,level]=p.split('.');return <Badge key={p} variant="secondary">{t(`p2.areas.${area}`)}: {t(`p2.${level}`)}</Badge>;})}{!record.permissions.length&&<span className="text-sm text-muted-foreground">{t('p2.noneSelected')}</span>}</div></section>}
      {record.mustChangePassword&&<p className="text-sm text-muted-foreground">{t('p2.initialChange')}</p>}
      {canEdit&&<PasswordReset record={record} onSaved={onSaved}/>}
      {manage&&!canEdit&&<p className="text-sm text-muted-foreground">{t(record.id===user?.id?'p2.selfEdit':'p2.restrictedAccount')}</p>}
      <FormError message={activeMutation.error?errorMessage(activeMutation.error):undefined}/>
    </>}
    {canEdit&&<div className="flex flex-wrap justify-end gap-2 border-t pt-4">{resource==='employees'&&<Button variant="outline" disabled={activeMutation.isPending} onClick={()=>{if(!record.isActive||window.confirm(t('p2.confirmDeactivate')))activeMutation.mutate();}} data-testid="toggle-employee-active">{t(record.isActive?'p2.deactivate':'p2.activate')}</Button>}<Button onClick={onEdit} data-testid="edit-record">{t('p2.edit')}</Button></div>}
  </div>;
}
function SetupResourcePage({ resource }: {resource: Resource}) {
  const {user}=useAuth(),{t,dir,lang}=useI18n(), errorMessage=useErrorMessage(), qc=useQueryClient(), {toast}=useToast();
  const [search,setSearch]=useState(''),[debounced,setDebounced]=useState(''),[page,setPage]=useState(1),[mode,setMode]=useState<Mode>(null),[selectedCustomerId,setSelectedCustomerId]=useState<number|null>(null);
  const [employeeRole,setEmployeeRole]=useState(''),[employeeBranch,setEmployeeBranch]=useState(''),[employeeStatus,setEmployeeStatus]=useState('');
  const [assistantKey,setAssistantKey]=useState<string|undefined>();const [assistantFormKey,setAssistantFormKey]=useState<string|undefined>();
  const permitted=can(user,`${AREA[resource]}.read`),manage=can(user,`${AREA[resource]}.manage`);
  useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent<{resource:string;key:string}>).detail;if(!manage||detail?.resource!==resource||!detail.key||(mode&&!assistantKey))return;if(assistantKey!==detail.key&&(!assistantKey?.startsWith('pending_')||detail.key.startsWith('pending_')))setAssistantFormKey(detail.key);setAssistantKey(detail.key);setMode({kind:'create'});};const workspace=(event:Event)=>{if(!(event as CustomEvent<{active:boolean}>).detail.active){setAssistantKey(undefined);setMode(old=>assistantKey?null:old);}};window.addEventListener('jormall:concierge-open-record',open);window.addEventListener('jormall:concierge-workspace',workspace);return()=>{window.removeEventListener('jormall:concierge-open-record',open);window.removeEventListener('jormall:concierge-workspace',workspace);};},[resource,manage,assistantKey,mode]);
  useEffect(()=>{const timer=setTimeout(()=>{setDebounced(search);setPage(1);},250);return()=>clearTimeout(timer);},[search]);
  const q=useQuery({queryKey:['setup',resource,'list',debounced,page,employeeRole,employeeBranch,employeeStatus],queryFn:()=>api<ListResult>(`${recordPath(resource)}?${new URLSearchParams({search:debounced,page:String(page),pageSize:'20',...(resource==='employees'&&employeeRole?{role:employeeRole}:{}),...(resource==='employees'&&employeeBranch?{branchId:employeeBranch}:{}),...(resource==='employees'&&employeeStatus?{status:employeeStatus}:{})})}`),enabled:permitted});
  const options=useQuery({queryKey:['setup',resource,'options'],queryFn:()=>api<Options>(`/clinic/options?for=${resource}`),enabled:permitted});
  const lookup = options.data ?? {branches:[],services:[],employees:[],timeZones:[],currencies:[],grantablePermissions:[],rolePresets:{}};
  const selectedId=mode&&mode.kind!=='create'?mode.id:null;
  const detail=useQuery({queryKey:['setup',resource,'detail',selectedId],queryFn:()=>api<{item:RecordItem}>(`${recordPath(resource)}/${selectedId}`),enabled:permitted&&selectedId!==null,staleTime:0});
  const currentCustomerId=resource==='customers'?(q.data?.items.some(item=>item.id===selectedCustomerId)?selectedCustomerId:q.data?.items[0]?.id)??null:null;
  const customerDetail=useQuery({queryKey:['setup','customers','detail',currentCustomerId],queryFn:()=>api<{item:RecordItem}>(`${recordPath('customers')}/${currentCustomerId}`),enabled:permitted&&currentCustomerId!==null&&resource==='customers'});
  const pages=Math.max(1,Math.ceil((q.data?.total??0)/20));
  useEffect(()=>{if(q.data&&page>pages)setPage(pages);},[q.data,page,pages]);
  function saved(message:string) { setMode(null);void qc.invalidateQueries({queryKey:['setup']});void qc.invalidateQueries({queryKey:['me','clinic']});void qc.invalidateQueries({queryKey:['clinics']});toast({title:message}); }
  function close() { if(!assistantKey&&mode&&(mode.kind==='edit'||mode.kind==='create')&&!window.confirm(t('p2.unsaved')))return;if(assistantKey){window.dispatchEvent(new Event('jormall:concierge-stop-typing'));window.dispatchEvent(new CustomEvent('jormall:concierge-field',{detail:{done:true,cancelled:true}}));}setAssistantKey(undefined);setMode(null); }
  if(!permitted)return <p role="alert">{t('p2.noAccess')}</p>;
  const record=detail.data?.item;
  const heading=mode?.kind==='create'?t(`p2.add.${resource}`):mode?.kind==='edit'?t('p2.edit'):t('p2.details');
  return <>
    <Link href="/home" className="focus-ring mb-3 inline-block rounded text-sm text-[#7b8aa0] hover:text-[#80632d] hover:underline" data-testid="back-to-section">{lang==='ar'?'الرئيسية':'Home'}</Link>
    <PageHeader title={t(`p2.titles.${resource}`)} description={t(`p2.intro.${resource}`)} action={manage?<Button onClick={()=>setMode({kind:'create'})} disabled={!options.data} data-testid={`add-${resource}`} className="bg-[#80632d] text-white hover:bg-[#6c5225]"><Plus className="me-2 size-4" aria-hidden/>{t(`p2.add.${resource}`)}</Button>:undefined}/>
    <div className={'mb-5 grid gap-3 sm:grid-cols-2 '+(resource==='services'?'lg:grid-cols-3':'lg:grid-cols-4')}>
      {(() => {
        const rows=q.data?.items??[];
        const total=q.data?.total??'—';
        const count=(predicate:(item:RecordItem)=>boolean)=>q.data?rows.filter(predicate).length:'—';
        const stats:Record<Resource,[string,string|number,string][]>={
          branches:[[lang==='ar'?'إجمالي الفروع':'Total branches',total,'⌂'],[lang==='ar'?'فروع الصفحة':'Branches on page',rows.length,'◇'],[lang==='ar'?'بساعات دوام':'With opening hours',count(item=>!!item.openingHours),'◷'],[lang==='ar'?'المناطق الزمنية':'Time zones',new Set(rows.map(item=>item.timeZone).filter(Boolean)).size,'◉']],
          services:[[lang==='ar'?'إجمالي الخدمات':'Total services',total,'▦'],[lang==='ar'?'أقسام الصفحة':'Sections on page',new Set(rows.map(item=>item.definition?.section||item.category)).size,'◫'],[lang==='ar'?'نشطة بالصفحة':'Active on page',count(item=>item.isActive===true),'✓']],
          rooms:[[lang==='ar'?'إجمالي الغرف':'Total rooms',total,'◇'],[lang==='ar'?'متاحة بالصفحة':'Available on page',count(item=>item.status==='available'),'●'],[lang==='ar'?'مرتبطة بخدمات':'Linked to services',count(item=>!!item.serviceIds?.length),'◉'],[lang==='ar'?'صيانة بالصفحة':'Maintenance on page',count(item=>item.status==='maintenance'),'⌁']],
          employees:[[lang==='ar'?'إجمالي الموظفين':'Total employees',total,'♙'],[lang==='ar'?'نشطون بالصفحة':'Active on page',count(item=>item.isActive===true),'●'],[lang==='ar'?'أطباء بالصفحة':'Doctors on page',count(item=>item.role==='doctor'),'♧'],[lang==='ar'?'أدوار الصفحة':'Roles on page',new Set(rows.map(item=>item.role).filter(Boolean)).size,'◴']],
          customers:[[lang==='ar'?'إجمالي العملاء':'Total customers',total,'♙'],[lang==='ar'?'عملاء الصفحة':'Customers on page',rows.length,'◎'],[lang==='ar'?'أرقام هاتف بالصفحة':'Phones on page',count(item=>!!item.phone),'▣'],[lang==='ar'?'فروع العيادة':'Clinic branches',options.data?.branches.length??'—','⌂']],
        };
        if(resource==='employees'){const summary=q.data?.summary;const cards:[string,string|number,string,string][]=[[lang==='ar'?'إجمالي الموظفين':'Total employees',summary?.total??'—','♙',''],[lang==='ar'?'الأطباء':'Doctors',summary?.doctors??'—','♧',''],[lang==='ar'?'الموظفون النشطون':'Active staff',summary?.active??'—','●','text-[#168550]'],[lang==='ar'?'الموظفون حسب الدور':'Staff by role',summary?.total??'—','◴','']];return cards.map(([label,value,icon,accent],index)=><div key={label} className="flex min-h-32 items-center justify-between gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_28px_#1b2d4808]"><div><p className="text-sm font-semibold text-[#1b2d48]">{label}</p>{index===3&&summary?<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#68788f]">{(['doctor','secretary','service_provider','other_staff'] as const).map(role=><span key={role}>{t('roles.'+role)} <b className="text-[#80632d]">{summary.roles[role]??0}</b></span>)}</div>:<><p className={'mt-1 text-3xl font-bold text-[#1b2d48] '+accent}>{value}</p><p className="text-xs text-[#8290a3]">{index===0?(lang==='ar'?'جميع أعضاء الفريق':'All team members'):index===1?(lang==='ar'?'في العيادة':'At the clinic'):(lang==='ar'?'حساباتهم مفعّلة':'Accounts enabled')}</p></>}</div><span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#f7f1e7] text-2xl text-[#927136]">{icon}</span></div>);}
        return stats[resource].map(([label,value,icon])=><div key={label} className="flex min-h-28 items-center justify-between gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_28px_#1b2d4808]"><div><p className="text-sm font-medium text-[#51617a]">{label}</p><p className="mt-1 text-3xl font-bold text-[#1b2d48]">{value}</p></div><span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#f7f1e7] text-2xl text-[#927136]">{icon}</span></div>);
      })()}
    </div>
    <div className={resource==='employees'?'mb-5 grid gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm lg:grid-cols-[minmax(250px,1.6fr)_repeat(3,minmax(135px,1fr))]':'mb-5'}><label className="block text-sm font-medium text-[#1b2d48]">{resource==='employees'?(lang==='ar'?'ابحث عن موظف بالاسم أو التخصص':'Search by name or specialty'):t(resource==='customers'?'p2.search':'p2.searchName')}<span className="relative mt-2 block"><Search className="pointer-events-none absolute start-3 top-3 size-4 text-[#80632d]" aria-hidden/><input value={search} onChange={(e)=>setSearch(e.target.value)} className={`${controlClass} ps-10 rounded-xl border-[#dfe5ee] bg-white`} maxLength={120} data-testid={`search-${resource}`} type="search"/></span></label>{resource==='employees'&&<><label className="block text-sm font-medium">{lang==='ar'?'القسم / الفرع':'Branch'}<select value={employeeBranch} onChange={e=>{setEmployeeBranch(e.target.value);setPage(1);}} className={`${controlClass} mt-2 rounded-xl`} data-testid="employee-filter-branch"><option value="">{lang==='ar'?'جميع الفروع':'All branches'}</option>{lookup.branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className="block text-sm font-medium">{lang==='ar'?'الدور':'Role'}<select value={employeeRole} onChange={e=>{setEmployeeRole(e.target.value);setPage(1);}} className={`${controlClass} mt-2 rounded-xl`} data-testid="employee-filter-role"><option value="">{lang==='ar'?'جميع الأدوار':'All roles'}</option>{(['manager','doctor','secretary','service_provider','other_staff'] as const).map(role=><option key={role} value={role}>{t('roles.'+role)}</option>)}</select></label><label className="block text-sm font-medium">{lang==='ar'?'الحالة':'Status'}<select value={employeeStatus} onChange={e=>{setEmployeeStatus(e.target.value);setPage(1);}} className={`${controlClass} mt-2 rounded-xl`} data-testid="employee-filter-status"><option value="">{lang==='ar'?'جميع الحالات':'All statuses'}</option><option value="active">{lang==='ar'?'نشط':'Active'}</option><option value="inactive">{lang==='ar'?'غير نشط':'Inactive'}</option></select></label></>}</div>
    {q.isPending||options.isPending?<p role="status">{t('common.loading')}</p>:q.isError||options.isError?<div className="space-y-3"><FormError message={errorMessage(q.error??options.error)}/><Button variant="outline" onClick={()=>{void q.refetch();void options.refetch();}} data-testid="retry-records">{t('common.retry')}</Button></div>:<>
      <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">{t('p2.count',{count:q.data.total})}{!manage?` · ${t('p2.readOnly')}`:''}</p>
      {q.data.items.length===0?<div className="rounded-2xl border border-dashed border-[#dfe5ee] bg-white p-10 text-center text-sm text-[#6a7890]" data-testid="empty-records">{t(debounced?'p2.noResults':'p2.empty')}</div>:resource==='customers'?<div dir="ltr" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,0.9fr)]">
        <div dir={dir} className="min-w-0"><ResourceList resource={resource} items={q.data.items} options={lookup} onOpen={id=>setMode({kind:'view',id})} onSelect={setSelectedCustomerId} selectedId={currentCustomerId??undefined}/></div>
        <aside dir={dir} className="min-w-0 space-y-4 rounded-2xl border border-[#e0e6ef] bg-white p-5 shadow-[0_12px_32px_#1b2d480a]" data-testid="customer-detail-preview">
          <div className="border-b border-[#e9edf3] pb-3"><h2 className="font-bold text-[#1b2d48]">{lang==='ar'?'تفاصيل العميل':'Customer details'}</h2><p className="text-xs text-[#7c899c]">{lang==='ar'?'معلومات العميل وسجل الزيارات':'Profile and visits'}</p></div>
          {customerDetail.data?.item&&<><div className="flex items-center gap-3"><span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#f7f1e7] text-xl text-[#80632d]">{customerDetail.data.item.name.slice(0,1)}</span><div><h3 className="font-bold"><EnteredName item={customerDetail.data.item}/></h3><p className="text-xs text-[#7c899c]">{lang==='ar'?'عميل العيادة':'Clinic customer'}</p></div></div>
            <div className="space-y-2 rounded-xl bg-[#fafbfc] p-3 text-sm"><p dir="ltr">{customerDetail.data.item.phone||'—'}</p><p dir="ltr">{customerDetail.data.item.email||'—'}</p></div>
            <div className="flex gap-2"><Link href="/appointments/new" className="flex-1 rounded-xl bg-[#80632d] px-3 py-2 text-center text-sm font-semibold text-white">{lang==='ar'?'حجز موعد':'Book'}</Link><button type="button" onClick={()=>setMode({kind:'view',id:customerDetail.data!.item.id})} className="flex-1 rounded-xl border border-[#e5e9ef] px-3 py-2 text-sm font-semibold">{lang==='ar'?'عرض الملف':'View profile'}</button></div>
            {customerDetail.data.item.notes&&<div className="rounded-xl border border-[#e9edf3] p-3"><h4 className="mb-1 text-sm font-semibold">{t('p2.fields.notes')}</h4><p className="whitespace-pre-wrap text-xs text-[#67768d]">{customerDetail.data.item.notes}</p></div>}
            <CustomerHistory customerId={customerDetail.data.item.id} enabled={customerDetail.data.item.historyAvailable===true}/>
          </>}
        </aside>
      </div>:<ResourceList resource={resource} items={q.data.items} options={lookup} onOpen={id=>setMode({kind:'view',id})}/>}      <nav aria-label={t('p2.page',{page,pages})} className="mt-5 flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage((p)=>p-1)} data-testid="previous-page">{t('p2.previous')}</Button><span className="text-xs text-muted-foreground">{t('p2.page',{page,pages})}</span><Button variant="outline" disabled={page>=pages} onClick={()=>setPage((p)=>p+1)} data-testid="next-page">{t('p2.next')}</Button></nav>
    </>}
    <Dialog modal={!assistantKey} open={mode!==null} onOpenChange={(open)=>{if(!open)close();}}><DialogContent hideOverlay={!!assistantKey} className={`w-[calc(100%_-_1rem)] ${resource==='services'&&mode?.kind==='create'&&!assistantKey?'max-w-3xl':'max-w-2xl'} max-h-[90dvh] overflow-y-auto p-4 sm:p-6 ${assistantKey?'jc-workspace-form':''}`} dir={dir} onInteractOutside={(event)=>event.preventDefault()}><DialogHeader className="text-start sm:text-start"><DialogTitle className="pe-6">{heading}</DialogTitle><DialogDescription>{t(`p2.intro.${resource}`)}</DialogDescription></DialogHeader>
      {!options.data?<p role="status">{t('common.loading')}</p>:mode?.kind==='create'&&resource==='services'&&!assistantKey?<ServiceBatchForm options={options.data} sections={[...new Set((q.data?.items??[]).map(item=>item.definition?.section).filter((value):value is string=>Boolean(value)))]} onSaved={saved} onCancel={close}/>:mode?.kind==='create'?<RecordForm key={`create-${resource}-${assistantFormKey??assistantKey??'manual'}`} assistantKey={assistantKey} resource={resource} options={options.data} onSaved={saved} onCancel={close}/>:detail.isPending?<p role="status">{t('common.loading')}</p>:detail.isError?<div className="space-y-3"><FormError message={errorMessage(detail.error)}/><Button onClick={()=>void detail.refetch()} data-testid="retry-detail">{t('common.retry')}</Button></div>:record&&mode?.kind==='edit'?<RecordForm key={`edit-${record.id}`} resource={resource} record={record} options={options.data} onSaved={saved} onCancel={close}/>:record&&<RecordDetails resource={resource} record={record} options={options.data} manage={manage} onEdit={()=>setMode({kind:'edit',id:record.id})} onSaved={saved}/>}
    </DialogContent></Dialog>
  </>;
}
export const BranchesPage=()=> <SetupResourcePage resource="branches"/>;
export const ServicesPage=()=> <SetupResourcePage resource="services"/>;
export const RoomsPage=()=> <SetupResourcePage resource="rooms"/>;
export const EmployeesPage=()=> <SetupResourcePage resource="employees"/>;
export const CustomersPage=()=> <SetupResourcePage resource="customers"/>;
