import { BookingDateField } from '@/components/scheduling/booking-date-field';
import { bookingDateAllowed, nextBookingDate } from '@/lib/booking-date';
import type { Week } from '@/lib/setup-api';
import {usePackageBooking,PackageBookingChoices,PackageBookingReview} from '@/components/scheduling/booking-packages';
import {PaymentSummary,ProductChargeFields} from '@/components/operations/patient-payment';
import {useBookingPayment,previewPayment,productSelections} from '@/lib/patient-billing';
import { intakeIssues, type IntakeAnswers } from '@workspace/service-definition';
import { IntakeFields } from '@/components/services/intake-fields';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FormError, FormField } from '@/components/form-field';
import { PhoneField } from '@/components/phone-field';
import { EnteredName, SelectField, TextareaField } from '@/components/setup/controls';
import { DayBoard } from '@/components/scheduling/day-board';
import { api } from '@/lib/api';
import { subscribeBookingSuggestion, takeBookingSuggestion } from '@/lib/assistant-booking-context';
import { useAuth } from '@/lib/auth';
import {useManagerBranch} from '@/lib/manager-branch';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { can } from '@/lib/setup-api';
import { useCatalog, useSchedulingCommand, queryString, localDate, formatAppointmentTime, type CustomerChoice, type Slot, type AppointmentList } from '@/lib/scheduling-api';

function BookingSchedulePreview({branchId,date,staff,onDate}:{branchId:number|undefined;date:string;staff:{id:number;name:string;nameLang:'ar'|'en'}[];onDate:(date:string)=>void}) {
  const {lang}=useI18n();
  const [view,setView]=useState<'day'|'week'|'month'>('day');
  const q=useQuery({queryKey:['scheduling','booking-day-preview',branchId,date],queryFn:()=>api<AppointmentList>(`/clinic/appointments?${queryString({branchId,date,page:1,pageSize:20})}`),enabled:view==='day'&&!!branchId&&!!date,refetchInterval:30000});
  const base=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00Z'):new Date();
  const start=new Date(base),end=new Date(base);
  if(view==='week'){start.setUTCDate(base.getUTCDate()-(base.getUTCDay()+6)%7);end.setTime(start.getTime());end.setUTCDate(start.getUTCDate()+6);}
  if(view==='month'){start.setUTCDate(1);end.setUTCMonth(start.getUTCMonth()+1,0);}
  const first=start.toISOString().slice(0,10),last=end.toISOString().slice(0,10);
  const days=view==='day'?[]:Array.from({length:Math.round((end.getTime()-start.getTime())/86400000)+1},(_,i)=>{const day=new Date(start);day.setUTCDate(start.getUTCDate()+i);return day.toISOString().slice(0,10);});
  const counts=useQuery({queryKey:['scheduling','booking-calendar',branchId,first,last],queryFn:()=>api<{days:{date:string;count:number}[]}>(`/clinic/scheduling/calendar?${queryString({branchId,date:first,through:last})}`),enabled:view!=='day'&&!!branchId,refetchInterval:30000});
  return <aside className="min-w-0 overflow-hidden rounded-2xl border border-[#e0e6ef] bg-white shadow-sm" data-testid="booking-schedule-preview"><div className="flex flex-wrap justify-end gap-2 border-b border-[#e9edf3] p-3">{(['day','week','month'] as const).map(value=><button key={value} type="button" onClick={()=>setView(value)} aria-pressed={view===value} className={'rounded-lg px-4 py-2 text-xs font-semibold '+(view===value?'bg-primary text-primary-foreground':'border border-[#e3e8ef] text-[#52647d] hover:bg-[#fbf7ef]')}>{value==='day'?(lang==='ar'?'عرض اليوم':'Today'):value==='week'?(lang==='ar'?'الأسبوع':'Week'):(lang==='ar'?'الشهر':'Month')}</button>)}</div>
    {view==='day'?(q.isPending?<p role="status" className="p-5 text-sm">{lang==='ar'?'جارٍ تحميل الجدول…':'Loading schedule…'}</p>:q.isError?<p role="alert" className="p-5 text-sm">{lang==='ar'?'تعذّر تحميل الجدول.':'Could not load schedule.'}</p>:q.data&&<DayBoard items={q.data.items} staff={staff} compact/>):counts.isPending?<p role="status" className="p-5 text-sm">{lang==='ar'?'جارٍ التحميل…':'Loading…'}</p>:counts.isError?<p role="alert" className="p-5 text-sm">{lang==='ar'?'تعذّر تحميل المواعيد.':'Could not load appointments.'}</p>:<div className="grid grid-cols-7 gap-1 p-3">{days.map(day=><button key={day} type="button" onClick={()=>{onDate(day);setView('day');}} className="rounded-lg border border-[#e8edf3] p-2 text-center text-xs hover:border-primary/50 hover:bg-[#fff9ed]"><strong className="block text-[#1b2d48]">{Number(day.slice(-2))}</strong><span className="block text-primary">{counts.data?.days.find(item=>item.date===day)?.count??0}</span></button>)}</div>}
  </aside>;
}

function InlineCustomer({onSelected,onClose}: {onSelected:(customer:CustomerChoice)=>void;onClose:()=>void}) {
  const {t,lang}=useI18n(), errorMessage=useErrorMessage();
  const [name,setName]=useState(''),[nameLang,setNameLang]=useState<'en'|'ar'>(lang),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[validation,setValidation]=useState('');
  const command=useSchedulingCommand((id)=>onSelected({id,name,nameLang,phone,email}));
  return <form onSubmit={(e)=>{e.preventDefault();if(!phone.trim()&&!email.trim()){setValidation(t('p3.contactRequired'));return;}setValidation('');command.mutate({path:'/clinic/scheduling/customer',body:{name,nameLang,phone:phone||null,email:email||null,branchId:null}});}} className="space-y-4 rounded-lg border p-4" data-testid="inline-customer-form">
    <fieldset disabled={command.isPending} className="space-y-4">
      <h3 className="font-semibold">{t('p3.addCustomer')}</h3>
      <FormField label={t('p2.fields.name')} value={name} onChange={(e)=>{setName(e.target.value);setNameLang(/[\u0600-\u06ff]/u.test(e.target.value)?'ar':'en');}} required maxLength={120} dir={nameLang==='ar'?'rtl':'ltr'} lang={nameLang} testId="inline-customer-name"/>
      <PhoneField label={t('p2.fields.phone')} value={phone} onChange={setPhone} testId="inline-customer-phone"/>
      <FormField label={t('p2.fields.email')} type="email" value={email} onChange={(e)=>setEmail(e.target.value)} maxLength={200} dir="ltr" testId="inline-customer-email"/>
      <FormError message={validation|| (command.error?errorMessage(command.error):undefined)}/>
      <div className="flex flex-wrap gap-2"><Button type="submit" data-testid="inline-customer-save">{command.isPending?t('common.loading'):t('p3.saveCustomer')}</Button><Button type="button" variant="outline" onClick={onClose} data-testid="inline-customer-back">{t('p3.existingCustomer')}</Button></div>
    </fieldset>
  </form>;
}
export function CustomerStep({selected,onSelected,allowSearch,allowAdd,pageSize=10}: {selected:CustomerChoice|null;onSelected:(c:CustomerChoice|null)=>void;allowSearch:boolean;allowAdd:boolean;pageSize?:number}) {
  const {t}=useI18n(),errorMessage=useErrorMessage();
  const [search,setSearch]=useState(''),[debounced,setDebounced]=useState(''),[page,setPage]=useState(1),[adding,setAdding]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>{setDebounced(search);setPage(1);},250);return()=>clearTimeout(timer);},[search]);
  const q=useQuery({queryKey:['setup','customers','booking-search',debounced,page,pageSize],queryFn:()=>api<{items:CustomerChoice[];total:number}>(`/clinic/customers?${queryString({search:debounced,page,pageSize})}`),enabled:allowSearch&&!adding&&!selected});
  if(selected)return <div className="space-y-3 rounded-lg border p-4"><p className="text-xs text-muted-foreground">{t('p3.selectedCustomer')}</p><p className="font-semibold" data-testid="selected-customer"><EnteredName item={selected}/></p><p className="text-sm"><bdi dir="ltr">{selected.phone||selected.email}</bdi></p><Button variant="outline" type="button" onClick={()=>onSelected(null)} data-testid="change-customer">{t('p3.changeCustomer')}</Button></div>;
  if(adding)return <InlineCustomer onSelected={(c)=>{setAdding(false);onSelected(c);}} onClose={()=>setAdding(false)}/>;
  return <div className="space-y-4">
    {allowSearch?<><FormField label={t('p3.searchCustomer')} type="search" value={search} maxLength={120} onChange={(e)=>setSearch(e.target.value)} testId="booking-customer-search"/>
      {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!q.data?.items.length?<p className="text-sm text-muted-foreground">{t('p3.noCustomers')}</p>:<div className="space-y-2">{q.data.items.map((c)=><button key={c.id} type="button" onClick={()=>onSelected(c)} className="focus-ring block w-full rounded-lg border p-3 text-start hover:border-primary" data-testid={`booking-customer-${c.id}`}><span className="block font-medium"><EnteredName item={c}/></span><bdi dir="ltr" className="block text-sm text-muted-foreground">{c.phone||c.email}</bdi></button>)}</div>}
      {q.data&&q.data.total>pageSize&&<div className="flex justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={page===1} onClick={()=>setPage(page-1)} data-testid="customer-search-prev">{t('common.previous')}</Button><Button type="button" variant="outline" size="sm" disabled={page*pageSize>=q.data.total} onClick={()=>setPage(page+1)} data-testid="customer-search-next">{t('common.next')}</Button></div>}
    </>:<p className="text-sm text-muted-foreground">{t('p3.customerPermission')}</p>}
    {allowAdd&&<Button type="button" variant="outline" onClick={()=>setAdding(true)} data-testid="booking-add-customer">{t('p3.addCustomer')}</Button>}
  </div>;
}
function CompactSlotPicker({branchId,serviceId,employeeId,timeZone,openingHours,date,onDate,selected,onSelect}:{branchId:number;serviceId:number;employeeId:number;timeZone:string;openingHours:Week;date:string;onDate:(date:string)=>void;selected:Slot|null;onSelect:(slot:Slot|null)=>void}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage();
  const q=useQuery({queryKey:['scheduling','slots',branchId,serviceId,employeeId,date],queryFn:()=>api<{slots:Slot[];timeZone:string;durationMinutes:number;emptyReason:null|'branch_closed'|'provider_off'|'room_unavailable'|'no_free_time'}>('/clinic/scheduling/availability?'+queryString({branchId,serviceId,employeeId,date})),enabled:!!branchId&&!!serviceId&&!!employeeId&&bookingDateAllowed(date,openingHours,timeZone),refetchInterval:30000,refetchOnWindowFocus:true,staleTime:0});
  useEffect(()=>{if(selected&&q.data&&!q.data.slots.some(value=>value.startsAt===selected.startsAt&&value.roomId===selected.roomId))onSelect(null);},[selected,q.data,onSelect]);
  return <div className="space-y-3" data-testid="slot-picker">
    <div className="grid grid-cols-2 gap-3">
      <BookingDateField value={date} openingHours={openingHours} timeZone={timeZone} onChange={next=>{if(bookingDateAllowed(next,openingHours,timeZone)){onDate(next);onSelect(null);}}}/>
      <SelectField label={t('p3.time')} value={selected?.startsAt??''} onChange={value=>onSelect(q.data?.slots.find(slot=>slot.startsAt===value)??null)} testId="booking-time" required><option value="">{lang==='ar'?'اختر الوقت':'Select time'}</option>{q.data?.slots.map(value=><option key={value.startsAt} value={value.startsAt}>{formatAppointmentTime(value.startsAt,timeZone,lang)} – {formatAppointmentTime(value.endsAt,timeZone,lang)}</option>)}</SelectField>
    </div>
    {q.isPending?<p role="status" className="text-xs text-[#68778b]">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!q.data?.slots.length?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" data-testid="slots-empty"><p>{q.data?.emptyReason==='branch_closed'?(lang==='ar'?'الفرع مغلق بهذا اليوم. اختر يوماً آخر.':'The branch is closed on this day. Choose another date.'):q.data?.emptyReason==='provider_off'?(lang==='ar'?'مقدم الخدمة لا يعمل بهذا اليوم. اختر يوماً آخر أو عدل جدول عمله.':'This provider is off today. Choose another date or update their schedule.'):q.data?.emptyReason==='room_unavailable'?(lang==='ar'?'لا توجد غرفة متاحة لهذه الخدمة بمعداتها المطلوبة. راجع ربط الخدمة ومعدات الغرف.':'No available room has the equipment required for this service. Check room services and equipment.'):lang==='ar'?'لا يوجد وقت يكفي لمدة هذه الخدمة بهذا اليوم. جرّب يوماً آخر.':'No time fits this service duration today. Try another date.'}</p>{q.data?.emptyReason==='provider_off'&&<Link href="/people/employees" className="mt-2 inline-block underline">{lang==='ar'?'جدول الفريق':'Staff schedule'}</Link>}{q.data?.emptyReason==='room_unavailable'&&<Link href="/business/rooms" className="mt-2 inline-block underline">{lang==='ar'?'إعداد الغرف':'Room setup'}</Link>}</div>:<p className="text-xs text-[#68778b]">{q.data.slots.length} {lang==='ar'?'وقت متاح لهذا اليوم':'available times this day'}</p>}
  </div>;
}

function BookingChoices({label,items,value,onChange}:{label:string;items:{value:string;title:string;detail?:string}[];value:string;onChange:(value:string)=>void}) {
  const {lang}=useI18n();
  const [page,setPage]=useState(0);
  const pages=Math.max(1,Math.ceil(items.length/4));
  useEffect(()=>setPage(0),[items.map(item=>item.value).join('|')]);
  const shown=items.slice(Math.min(page,pages-1)*4,Math.min(page,pages-1)*4+4);
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[#1b2d48]">{label}</h3>{pages>1&&<div className="flex items-center gap-2 text-xs text-[#6a7890]"><button type="button" className="rounded-lg border px-2 py-1 disabled:opacity-40" disabled={page===0} onClick={()=>setPage(page-1)} aria-label={lang==='ar'?'الخيارات السابقة':'Previous choices'}>‹</button><span>{page+1}/{pages}</span><button type="button" className="rounded-lg border px-2 py-1 disabled:opacity-40" disabled={page>=pages-1} onClick={()=>setPage(page+1)} aria-label={lang==='ar'?'الخيارات التالية':'Next choices'}>›</button></div>}</div><div className="grid grid-cols-2 gap-2">{shown.map(item=><button key={item.value} type="button" aria-pressed={value===item.value} onClick={()=>onChange(item.value)} className={'min-h-16 rounded-xl border p-3 text-start transition-colors '+(value===item.value?'border-[#a7833f] bg-[#fff7e8] text-primary shadow-sm':'border-[#e1e7ef] bg-white text-[#1b2d48] hover:border-[#bda268] hover:bg-[#fffcf7]')}><strong className="block text-sm">{item.title}</strong>{item.detail&&<span className="mt-1 block text-xs text-[#738198]">{item.detail}</span>}</button>)}</div>{items.length===0&&<p className="rounded-xl border border-dashed p-3 text-sm text-[#738198]">{lang==='ar'?'لا توجد خيارات متاحة بعد.':'No available choices yet.'}</p>}</div>;
}

export default function BookingPage() {
  const {user}=useAuth(),{t,lang,dir}=useI18n(),errorMessage=useErrorMessage();
  const {selectedBranchId}=useManagerBranch(),allowed=can(user,'appointments.manage');
  const [customer,setCustomer]=useState<CustomerChoice|null>(null),[customerMode,setCustomerMode]=useState<'existing'|'new'>('existing');
  const [branchId,setBranchId]=useState<number|undefined>(),[serviceId,setServiceId]=useState<number|undefined>(),[employeeId,setEmployeeId]=useState<number|undefined>();
  const [serviceGroup,setServiceGroup]=useState(''),[intakeAnswers,setIntakeAnswers]=useState<IntakeAnswers>({});
  const [date,setDate]=useState(''),[slot,setSlot]=useState<Slot|null>(null),[notes,setNotes]=useState(''),[notesLang,setNotesLang]=useState<'en'|'ar'>(lang);
  const [success,setSuccess]=useState<{id:number;customer:string;service:string;employee:string;time:string}|null>(null);
  const [bookingOpen,setBookingOpen]=useState(true);
  const [bookingStep,setBookingStep]=useState(0);
  const [overrideReason,setOverrideReason]=useState('');
  const [followUp,setFollowUp]=useState(false),[followUpOfId,setFollowUpOfId]=useState<number|undefined>(),[chargePrice,setChargePrice]=useState('0');
  useEffect(()=>setIntakeAnswers({}),[serviceId]);
  useEffect(()=>{
    if(!allowed)return;
    const apply=()=>{const hint=takeBookingSuggestion(user?.id,user?.clinicId);if(hint){setBranchId(hint.branchId);setServiceId(hint.serviceId);setEmployeeId(hint.employeeId);setDate(hint.date);setSlot(null);}};
    const unsubscribe=subscribeBookingSuggestion(apply);apply();return unsubscribe;
  },[allowed,user?.id,user?.clinicId]);
  const catalog=useCatalog(branchId,serviceId,allowed);
  const branch=catalog.data?.branches.find(value=>value.id===branchId),service=catalog.data?.services.find(value=>value.id===serviceId),employee=catalog.data?.employees.find(value=>value.id===employeeId);
  const {pricing,products,setProducts}=useBookingPayment(branchId,serviceId,followUp,customer?.id);
  const requested=new URLSearchParams(window.location.search),requestedCustomerId=Number(requested.get('customerId')),requestedPackageId=Number(requested.get('packageId'));
  const prefilledCustomer=useQuery({queryKey:['setup','booking-prefill-customer',requestedCustomerId],enabled:requestedCustomerId>0&&can(user,'customers.read'),queryFn:()=>api<{item:CustomerChoice}>(`/clinic/customers/${requestedCustomerId}`)});
  useEffect(()=>{if(prefilledCustomer.data?.item)setCustomer(current=>current??prefilledCustomer.data!.item);},[prefilledCustomer.data]);
  const packageBooking=usePackageBooking(customer?.id,serviceId,allowed,requestedPackageId),selectedPackage=packageBooking.selectedPackage,packageId=selectedPackage?.id;
  useEffect(()=>setOverrideReason(''),[customer?.id,serviceId,packageBooking.choice]);
  const seriesBody={customerId:customer?.id,branchId,serviceId,employeeId,startsAt:slot?.startsAt,...packageBooking.body(followUp)};
  const seriesPreview=useQuery({queryKey:['scheduling','series-preview',seriesBody],enabled:bookingStep===5&&!!(customer&&branch&&service&&employee&&slot),queryFn:()=>api<{sessions:{startsAt:string;endsAt:string|null;available:boolean;error:string|null}[];canBook:boolean;payment:null|{warning:boolean;blocking:boolean;missing:string;sessionNumber:number}}>('/clinic/scheduling/series-preview',{method:'POST',body:seriesBody}),staleTime:0});
  const payment=previewPayment(packageBooking.mode==='package'?'0':followUp?chargePrice:packageBooking.servicePrice??pricing.data?.servicePrice??service?.price??null,products);
  const parents=useQuery({queryKey:['scheduling','follow-up-parents',customer?.id,serviceId],enabled:followUp&&!!customer&&!!serviceId,queryFn:()=>api<AppointmentList>(`/clinic/appointments?${queryString({customerId:customer?.id,serviceId,status:'completed',pageSize:50})}`)});
  useEffect(()=>{setFollowUp(false);setFollowUpOfId(undefined);setChargePrice('0');},[serviceId,customer?.id]);
  useEffect(()=>{if(packageBooking.mode==='package'){setFollowUp(false);setFollowUpOfId(undefined);}},[packageBooking.mode]);
  const groupFor=(item:NonNullable<typeof service>)=>item.definition?.section||item.name;
  const groups=Array.from(new Set(catalog.data?.services.map(groupFor)??[]));
  useEffect(()=>{if(service)setServiceGroup(groupFor(service));},[serviceId,catalog.data]);
  const subservices=catalog.data?.services.filter(item=>groupFor(item)===serviceGroup)??[];
  const command=useSchedulingCommand(id=>{if(customer&&service&&employee&&slot&&branch)setSuccess({id,customer:customer.name,service:service.name,employee:employee.name,time:formatAppointmentTime(slot.startsAt,branch.timeZone,lang,true)});setSlot(null);setNotes('');setBookingStep(0);setBookingOpen(false);});
  useEffect(()=>{if(!catalog.data?.branches.length)return;const preferred=catalog.data.branches.find(value=>value.id===selectedBranchId)?.id??catalog.data.branches.find(value=>value.id===user?.branchId)?.id??catalog.data.branches[0]!.id;setBranchId(current=>current??preferred);},[catalog.data,selectedBranchId,user?.branchId]);
  useEffect(()=>{if(branch&&(!date||bookingOpen&&!bookingDateAllowed(date,branch.openingHours,branch.timeZone))){setDate(nextBookingDate(branch.openingHours,branch.timeZone));setSlot(null);}},[branch,date,bookingOpen]);
  if(!allowed)return <FormError message={t('p3.accessDenied')}/>;
  const canSubmit=!command.isPending&&!seriesPreview.isFetching&&seriesPreview.isSuccess&&seriesPreview.data.canBook&&(followUp||packageBooking.ready)&&(!seriesPreview.data.payment?.blocking||user?.role==='manager'&&(selectedPackage??packageBooking.purchase)?.plan.allowManagerOverride&&!!overrideReason.trim())&&pricing.isSuccess&&payment.total!==null&&!!(customer&&branch&&service&&employee&&slot)&&intakeIssues(service?.definition,intakeAnswers).length===0&&(!followUp||!!followUpOfId&&/^\d{1,9}(?:\.\d{1,3})?$/.test(chargePrice));
  const steps=lang==='ar'?['المريض','الخدمة','الموظف','خطة الجلسات','الموعد','التأكيد']:['Customer','Service','Staff','Sessions','Time','Confirm'];
  const visibleSteps=[0,1,2,...(packageBooking.hasChoices?[3]:[]),4,5],stepIndex=visibleSteps.indexOf(bookingStep);
  useEffect(()=>{if(bookingStep===3&&!packageBooking.hasChoices&&!packageBooking.loading)setBookingStep(4);},[bookingStep,packageBooking.hasChoices,packageBooking.loading]);
  const nextReady=bookingStep===0?!!customer:bookingStep===1?!!(branch&&service):bookingStep===2?!!employee&&!packageBooking.loading&&!packageBooking.error:bookingStep===3?packageBooking.selectionReady:bookingStep===4?!!slot:true;
  const advance=(direction:number)=>setBookingStep(visibleSteps[Math.max(0,Math.min(visibleSteps.length-1,stepIndex+direction))]!);
  return <div dir="ltr" className="space-y-5" data-testid="booking-page">
    <Dialog open={bookingOpen} onOpenChange={open=>{if(!command.isPending)setBookingOpen(open);}}>
      <DialogContent dir={dir} className="w-[calc(100%_-_1rem)] max-w-xl max-h-[92dvh] overflow-y-auto rounded-2xl border-[#e0e6ef] bg-white p-4 sm:p-6" data-testid="booking-popup">
      <div className="flex items-center justify-between border-b border-[#edf0f4] pb-3"><div><DialogTitle className="text-xl font-bold text-[#1b2d48]" data-testid="text-page-title">{t('p3.create')}</DialogTitle><DialogDescription className="mt-1 text-start">{steps[bookingStep]} · {stepIndex+1} / {visibleSteps.length}</DialogDescription></div><span aria-hidden="true" className="me-8 grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-xl text-white">+</span></div>
      <div className="flex gap-1" aria-label={lang==='ar'?'تقدم الحجز':'Booking progress'}>{visibleSteps.map(index=><span key={index} className={'h-1.5 flex-1 rounded-full '+(index<=bookingStep?'bg-[#a7833f]':'bg-[#e9edf2]')}/>)}</div>
      {catalog.isPending?<p role="status">{t('common.loading')}</p>:catalog.isError?<div className="space-y-3"><FormError message={errorMessage(catalog.error)}/><Button variant="outline" onClick={()=>void catalog.refetch()} data-testid="retry-booking-catalog">{t('common.retry')}</Button></div>:catalog.data&&<fieldset disabled={command.isPending} className="space-y-4">
        {bookingStep===0&&<div className="space-y-3">
        <div><p className="mb-2 text-sm font-semibold">{t('p3.customer')}</p><div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f9f7f3] p-1">
          <button type="button" aria-pressed={customerMode==='existing'} onClick={()=>{setCustomerMode('existing');setCustomer(null);}} data-testid="booking-existing-customer" className={'rounded-lg px-2 py-2.5 text-sm '+(customerMode==='existing'?'bg-white font-semibold text-primary shadow-sm':'text-[#6a7890]')}>{lang==='ar'?'مريض موجود':'Existing customer'}</button>
          <button type="button" aria-pressed={customerMode==='new'} onClick={()=>{setCustomerMode('new');setCustomer(null);}} data-testid="booking-new-customer" className={'rounded-lg px-2 py-2.5 text-sm '+(customerMode==='new'?'bg-white font-semibold text-primary shadow-sm':'text-[#6a7890]')}>{lang==='ar'?'مريض جديد':'New customer'}</button>
        </div></div>
        {customerMode==='existing'?<CustomerStep selected={customer} onSelected={setCustomer} allowSearch={catalog.data.canSearchCustomers} allowAdd={false} pageSize={3}/>:customer?<div className="rounded-xl border border-[#e6d8b7] bg-[#fffaf1] p-3"><strong><EnteredName item={customer}/></strong><button type="button" onClick={()=>setCustomer(null)} className="ms-3 text-xs underline">{t('p3.changeCustomer')}</button></div>:<InlineCustomer onSelected={setCustomer} onClose={()=>setCustomerMode('existing')}/>}
        </div>}
        {bookingStep===1&&<div className="space-y-3">
        {catalog.data.branches.length>1&&<SelectField label={t('p3.branch')} value={branchId??''} onChange={value=>{setBranchId(Number(value)||undefined);setServiceId(undefined);setEmployeeId(undefined);setSlot(null);setDate('');}} testId="booking-branch" required><option value="">{t('p3.selectBranch')}</option>{catalog.data.branches.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>}
        <BookingChoices label={lang==='ar'?'الخدمة الرئيسية':'Main service'} items={groups.map(group=>({value:group,title:group,detail:`${catalog.data.services.filter(item=>groupFor(item)===group).length} ${lang==='ar'?'خدمات':'services'}`}))} value={serviceGroup} onChange={value=>{setServiceGroup(value);setServiceId(undefined);setEmployeeId(undefined);setSlot(null);}}/>
        {serviceGroup&&<BookingChoices label={lang==='ar'?'الخدمة الفرعية':'Subservice'} items={subservices.map(item=>({value:String(item.id),title:item.name,detail:`${item.durationMinutes} ${lang==='ar'?'دقيقة':'min'} · ${item.price} ${item.currency}`}))} value={serviceId?String(serviceId):''} onChange={value=>{setServiceId(Number(value));setEmployeeId(undefined);setSlot(null);}}/>}
        </div>}
        {bookingStep===2&&<div className="space-y-3">{packageBooking.loading&&<p role="status">{t('common.loading')}</p>}<FormError message={packageBooking.error?errorMessage(packageBooking.error):undefined}/><BookingChoices label={t('p3.employee')} items={catalog.data.employees.map(item=>({value:String(item.id),title:item.name}))} value={employeeId?String(employeeId):''} onChange={value=>{setEmployeeId(Number(value));setSlot(null);}}/>{service&&catalog.data.employees.length===0&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{lang==='ar'?'لا يوجد مقدم خدمة مرتبط بهذه الخدمة. اربط طبيباً أو مقدم خدمة من إعدادات الخدمات أو الفريق.':'No provider is assigned to this service. Assign a doctor or service provider in Services or Staff.'} <Link href="/people/employees" className="underline">{lang==='ar'?'الفريق':'Staff'}</Link></p>}</div>}
        {bookingStep===3&&<div className="space-y-3">
        <PackageBookingChoices model={packageBooking}/>
        </div>}
        {bookingStep===4&&<div className="space-y-3">
        {branch&&service&&employee?<CompactSlotPicker branchId={branch.id} serviceId={service.id} employeeId={employee.id} timeZone={branch.timeZone} openingHours={branch.openingHours} date={date} onDate={setDate} selected={slot} onSelect={setSlot}/>:<BookingDateField value={date} timeZone={branch?.timeZone??'Asia/Amman'} openingHours={branch?.openingHours} onChange={setDate}/>}
        <div className="rounded-xl bg-[#faf8f3] px-3 py-2 text-sm"><strong className="block">{service?.name}</strong><span className="text-[#6a7890]">{lang==='ar'?'مدة الموعد':'Appointment duration'}: </span><strong>{service?t('p2.minutes',{count:service.durationMinutes}):'—'}</strong>{service&&service.requiredEquipment.length>0&&<p className="mt-1 text-xs text-[#6a7890]">{lang==='ar'?'المعدات المطلوبة: ':'Required equipment: '}{service.requiredEquipment.join('، ')}</p>}</div>
        </div>}
        {bookingStep===5&&<div className="space-y-3">
        <div className="rounded-xl border border-[#e8dfcd] bg-[#fffbf4] p-3 text-sm"><strong>{customer?.name}</strong><span className="mx-2 text-[#b59a68]">·</span>{service?.name}<span className="mx-2 text-[#b59a68]">·</span>{employee?.name}{slot&&branch&&<span className="block text-xs text-[#63748c]">{formatAppointmentTime(slot.startsAt,branch.timeZone,lang,true)}</span>}</div>
        {seriesPreview.isPending?<p role="status">{lang==='ar'?'فحص المواعيد…':'Checking dates…'}</p>:seriesPreview.error?<FormError message={errorMessage(seriesPreview.error)}/>:seriesPreview.data&&<><details className="rounded-lg border p-2"><summary className="cursor-pointer text-sm">{lang==='ar'?'مراجعة المواعيد':'Review dates'} · {seriesPreview.data.sessions.length}</summary><ol className="max-h-32 overflow-y-auto text-xs">{seriesPreview.data.sessions.map((s,index)=><li key={s.startsAt} className={'py-1 '+(s.available?'':'text-red-700')}>{index+1}. {formatAppointmentTime(s.startsAt,branch!.timeZone,lang,true)} · {s.available?(lang==='ar'?'متاح':'Available'):(lang==='ar'?'تعارض / غير متاح':'Conflict / unavailable')}</li>)}</ol></details>{seriesPreview.data.payment?.warning&&<p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">{lang==='ar'?'مطلوب تحصيل':'Payment due'} {seriesPreview.data.payment.missing} JD {lang==='ar'?'حسب خطة الدفع':'under the payment plan'}</p>}{seriesPreview.data.payment?.blocking&&user?.role==='manager'&&(selectedPackage??packageBooking.purchase)?.plan.allowManagerOverride&&<FormField label={lang==='ar'?'سبب تجاوز شرط الدفع':'Payment override reason'} value={overrideReason} onChange={e=>setOverrideReason(e.target.value)} testId="booking-payment-override"/>}{!seriesPreview.data.canBook&&<p role="alert" className="text-sm text-red-700">{lang==='ar'?'في مواعيد غير متاحة. عدّل الوقت قبل الحجز.':'Some dates are unavailable. Change the time before booking.'}</p>}</>}
        {service&&<IntakeFields definition={service.definition} answers={intakeAnswers} onChange={setIntakeAnswers} language={lang} showErrors/>}
        {packageBooking.mode==='single'&&service?.followUpEnabled&&<div className="space-y-3 rounded-xl border p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={followUp} onChange={e=>{setFollowUp(e.target.checked);setFollowUpOfId(undefined);setChargePrice('0');}} data-testid="booking-follow-up"/>{lang==='ar'?'رتوش / موعد متابعة':'Retouch / follow-up appointment'}</label>{followUp&&<><SelectField label={lang==='ar'?'الموعد الأصلي المكتمل':'Original completed appointment'} value={followUpOfId??''} onChange={v=>setFollowUpOfId(v?Number(v):undefined)} required testId="booking-follow-up-parent"><option value="">{lang==='ar'?'اختَر الموعد الأصلي':'Choose the original appointment'}</option>{parents.data?.items.map(a=><option key={a.id} value={a.id}>#{a.id} · {formatAppointmentTime(a.startsAt,a.branch.timeZone,lang,true)}</option>)}</SelectField>{parents.isPending&&<p role="status">{t('common.loading')}</p>}<FormError message={parents.error?errorMessage(parents.error):undefined}/>{parents.isSuccess&&!parents.data?.items.length&&<p className="text-xs text-amber-800">{lang==='ar'?'لا يوجد موعد مكتمل لهذه الخدمة وهذا المريض.':'No completed appointment for this customer and service.'}</p>}{user&&['manager','secretary','doctor','service_provider'].includes(user.role)?<FormField label={lang==='ar'?'سعر المتابعة (JOD) — الافتراضي صفر':'Follow-up price (JOD) — default zero'} type="number" min="0" max="999999999.999" step="0.001" required value={chargePrice} onChange={e=>setChargePrice(e.target.value)} testId="booking-follow-up-price"/>:<p>0.000 JOD</p>}</>}</div>}
        {selectedPackage&&<p className="rounded-lg bg-primary/5 p-3 text-sm" data-testid="booking-package-balance">{lang==='ar'?'أتعاب الجلسة مشمولة بالباقة. المتبقي على الباقة:':'The session fee is included in the package. Package balance:'} <bdi>{selectedPackage.invoice.financial.balance} JD</bdi></p>}
        {pricing.isPending?<p role="status">{t('common.loading')}</p>:pricing.error?<FormError message={errorMessage(pricing.error)}/>:<><ProductChargeFields products={products} options={pricing.data?.options??[]} onChange={setProducts}/><PaymentSummary payment={payment} title={packageBooking.mode==='package'?(lang==='ar'?'إضافات هذا الموعد':'Appointment extras'):undefined}/></>}
        <PackageBookingReview model={packageBooking} extras={payment.productTotal||'0'} followUp={followUp}/>
        <div lang={notesLang} dir={notesLang==='ar'?'rtl':'ltr'}><TextareaField label={t('p3.notes')} value={notes} onChange={setNotes} testId="booking-notes" hint={t('p3.notesHint')}/></div>
        <FormError message={command.error?errorMessage(command.error):undefined}/>
        </div>}
        <div className="flex items-center justify-between gap-3 border-t border-[#edf0f4] pt-3"><Button type="button" variant="outline" onClick={()=>advance(-1)} disabled={bookingStep===0||command.isPending}>{lang==='ar'?'السابق':'Back'}</Button>{bookingStep<5?<Button type="button" disabled={!nextReady} onClick={()=>advance(1)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="booking-next-step">{lang==='ar'?'التالي':'Next'}</Button>:<Button type="button" disabled={!canSubmit} onClick={()=>{if(customer&&branch&&service&&employee&&slot)command.mutate({path:'/clinic/appointments',body:{customerId:customer.id,branchId:branch.id,serviceId:service.id,employeeId:employee.id,startsAt:slot.startsAt,...packageBooking.body(followUp),overrideReason,notes,notesLang,intakeAnswers,productItems:productSelections(products),expectedServicePrice:pricing.data?.servicePrice,...(followUp?{appointmentType:'follow_up',followUpOfId,...(user&&['manager','secretary','doctor','service_provider'].includes(user.role)?{chargePrice}:{})}:{})}});}} data-testid="booking-submit" className="bg-primary text-primary-foreground hover:bg-primary/90">{command.isPending?t('common.loading'):t('p3.book')}</Button>}</div>
      </fieldset>}
      </DialogContent>
    </Dialog>
    <section dir={dir} className="min-w-0 space-y-5">
      {success&&<div className="rounded-2xl border border-[#abe0c2] bg-[#f0fff6] p-5" role="status" data-testid="booking-success"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-[#17653a]">{lang==='ar'?'تم حجز الموعد بنجاح':'Appointment booked successfully'}</h2><p className="mt-1 text-sm text-[#4e6b5d]">{success.customer} · {success.service} · {success.employee} · {success.time}</p><Link href={'/appointments/'+success.id} className="mt-2 inline-block text-sm font-semibold text-primary underline">{lang==='ar'?'عرض الموعد':'View appointment'}</Link></div><button type="button" onClick={()=>setSuccess(null)} aria-label={t('p5.close')}>×</button></div></div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-[#1b2d48]">{lang==='ar'?'حجز المواعيد':'Appointments'}</h2><p className="text-sm text-[#6a7890]">{lang==='ar'?'إدارة المواعيد اليومية بسهولة وسرعة':'Manage daily appointments quickly and clearly'}</p></div><div className="flex flex-wrap items-end gap-3"><FormField label={t('p3.date')} type="date" value={date} onChange={event=>{setDate(event.target.value);setSlot(null);}} testId="booking-board-date"/><Button type="button" onClick={()=>setBookingOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="booking-open-popup">+ {t('p3.create')}</Button></div></div>
      <BookingSchedulePreview branchId={branchId} date={date} staff={catalog.data?.employees??[]} onDate={value=>{setDate(value);setSlot(null);}}/>
    </section>
  </div>;
}
