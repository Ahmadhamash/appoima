import { parseServiceDefinition, definitionIssues, normalizePhone, type ServiceDefinition } from '@workspace/service-definition';
import { PhoneField } from '@/components/phone-field';
import { StaffBranchField } from '@/components/staff-branch-field';
import type { StaffBranchSchedule } from '@/lib/setup-api';
import { phoneValidationMessage } from '@/components/phone-input';
import { DefinitionEditor } from '@/components/services/definition-editor';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FormField, PasswordField, FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { DAYS, CATEGORIES, STAFF_ROLES, PERMISSION_AREAS, emptyWeek, recordPath, type Resource, type Options, type RecordItem, type Week, type StaffRole } from '@/lib/setup-api';
import { instantToLocal, localToInstant } from '@/lib/branch-time';
import { CheckField, SelectField, TextareaField, MultiPicker, RoomServicePicker, HoursEditor, controlClass } from './controls';
import { EquipmentPicker } from './equipment-picker';

type LocalLeave = { startsAt: string; endsAt: string; note: string };
type Draft = {
  branchSchedules:StaffBranchSchedule[];
  address: string; mapUrl: string;
  definition: ServiceDefinition|null;
  name: string; nameLang: 'en' | 'ar'; branchId: number | null; timeZone: string; openingHours: Week;
  durationMinutes: string; price: string; currency: string; category: typeof CATEGORIES[number];
  isActive: boolean; requiresRoom: boolean; followUpEnabled: boolean; requiredEquipment: string[]; roomEquipment: string[]; employeeIds: number[]; serviceIds: number[];
  capacity: string; status: 'available' | 'maintenance'; role: StaffRole; email: string; phone: string;
  jobTitle: string; initialPassword: string; permissions: string[]; workingHours: Week; breaks: Week;
  timeOff: LocalLeave[]; notes: string; sensitiveNotes: string;
};
const branchZone = (options: Options, id: number | null) => options.branches.find((b) => b.id === id)?.timeZone ?? 'UTC';
const staffBranchHours = (options: Options, id: number | null) => options.branches.find(b=>b.id===id)?.openingHours ?? (id===null && options.branches.length===1 ? options.branches[0]?.openingHours : undefined);
function initialDraft(record: RecordItem | undefined, lang: 'en' | 'ar', options: Options, resource: Resource, initialBranchId: number | null): Draft {
  const branchId=record ? record.branchId??null : resource==='employees' ? initialBranchId : null;
  const zone = branchZone(options, branchId);
  const initialStaffBranch=branchId??options.branches[0]?.id??null;
  const branchSchedules=record?.branchSchedules?.filter(s=>options.branches.some(b=>b.id===s.branchId))??(resource==='employees'&&initialStaffBranch?[{branchId:initialStaffBranch,workingHours:structuredClone(record?.workingHours??staffBranchHours(options,initialStaffBranch)??emptyWeek()),breaks:structuredClone(record?.breaks??emptyWeek())}]:[]);
  return {
    branchSchedules,address: record?.address ?? '', mapUrl: record?.mapUrl ?? '',
    definition: record?.definition??null,
    name: record?.name ?? '', nameLang: record?.nameLang ?? lang, branchId,
    timeZone: record?.timeZone ?? 'Asia/Amman', openingHours: record?.openingHours ?? emptyWeek(),
    durationMinutes: String(record?.durationMinutes ?? 30), price: record?.price ?? '0', currency: 'JOD', category: record?.category ?? 'Other',
    isActive: record?.isActive ?? true, requiresRoom: record?.requiresRoom ?? false, followUpEnabled: record?.followUpEnabled ?? false,
    requiredEquipment: record?.requiredEquipment ?? [], roomEquipment: record?.extra?.equipment ?? [],
    employeeIds: record?.employeeIds ?? [], serviceIds: record?.serviceIds ?? [], capacity: String(record?.capacity ?? 1), status: record?.status ?? 'available',
    role: record?.role ?? 'secretary', email: record?.email ?? '', phone: record?.phone ?? '', jobTitle: record?.jobTitle ?? '', initialPassword: '',
    permissions: record?.permissions ?? options.rolePresets.secretary ?? [], workingHours: record?.workingHours ?? (resource==='employees'&&!record?structuredClone(staffBranchHours(options,branchId)??emptyWeek()):emptyWeek()), breaks: record?.breaks ?? emptyWeek(),
    timeOff: (record?.timeOff ?? []).map((entry) => ({ startsAt: instantToLocal(entry.startsAt, zone), endsAt: instantToLocal(entry.endsAt, zone), note: entry.note })),
    notes: record?.notes ?? '', sensitiveNotes: record?.sensitiveNotes ?? '',
  };
}
function hoursValid(week: Week): boolean {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return DAYS.every((day) => {
    const ranges = [...week[day]].sort((a,b) => a.open.localeCompare(b.open));
    return ranges.every((r,i) => time.test(r.open) && time.test(r.close) && r.open < r.close && (!i || ranges[i-1]!.close <= r.open));
  });
}
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export function RecordForm({ resource, record, options, onSaved, onCancel, assistantKey, initialBranchId=null }: { resource: Resource; record?: RecordItem; options: Options; onSaved: (message: string) => void; onCancel: () => void; assistantKey?:string; initialBranchId?:number|null }) {
  const { t, lang, dict } = useI18n();
  const errorMessage = useErrorMessage();
  const [draft, setDraft] = useState(() => initialDraft(record, lang, options, resource, assistantKey?null:initialBranchId));
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [noEquipment, setNoEquipment] = useState(Boolean(record && !record.requiredEquipment?.length));
  const alertRef = useRef<HTMLDivElement>(null);
  const [requestError, setRequestError] = useState('');
  const isEmployee = resource === 'employees';
  const isNew = !record;
  const draftRef=useRef(draft),touched=useRef(new Set<string>()),formRef=useRef<HTMLFormElement>(null);draftRef.current=draft;
  const assistantHours=useRef(false);
  useEffect(()=>{
    if(isEmployee&&isNew&&!touched.current.has('workingHours')&&!assistantHours.current)
      setDraft(old=>({...old,workingHours:structuredClone(staffBranchHours(options,old.branchId)??emptyWeek())}));
  },[isEmployee,isNew,draft.branchId,options.branches]);
  useEffect(()=>{if(!isNew||!assistantKey)return;let sequence=0;const timers=new Set<ReturnType<typeof setTimeout>>();const delay=(ms:number)=>new Promise<void>(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve();},ms);timers.add(timer);});
    const stop=()=>{sequence++;timers.forEach(clearTimeout);timers.clear();formRef.current?.querySelectorAll('.jc-ai-field').forEach(e=>e.classList.remove('jc-ai-field'));};
    const focusField=async(event:Event)=>{const detail=(event as CustomEvent<{resource:string;key:string;field:string}>).detail;if(detail.resource!==resource||detail.key!==assistantKey)return;if(isEmployee)setStep(2);if(['workingHours','breaks'].includes(detail.field))setScheduleOpen(true);await delay(80);const key=detail.field==='branchKey'?'branchId':detail.field;const testId=key==='openingHours'?'opening-hours':key==='workingHours'?'working-hours':key==='breaks'?'breaks':key==='serviceKeys'?'service-choice':`${['nameLang','branchId','timeZone','currency','category','role'].includes(key)?'select':key==='requiresRoom'?'check':'input'}-${key}`;const target=formRef.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`);formRef.current?.querySelectorAll('.jc-ai-question').forEach(node=>node.classList.remove('jc-ai-question'));if(target){target.classList.add('jc-ai-question');target.scrollIntoView({behavior:'smooth',block:'center'});window.dispatchEvent(new CustomEvent('jormall:concierge-field',{detail:{target,preview:true}}));}};
    const prefill=async(event:Event)=>{const detail=(event as CustomEvent<{resource:Resource;key:string;fields:Record<string,unknown>}>).detail;if(detail?.resource!==resource||detail.key!==assistantKey||!detail.fields)return;const turn=++sequence;
      const source=detail.fields,fields:Partial<Draft>={};
      for(const key of ['name','email','phone','jobTitle','price','currency','timeZone'] as const)if(typeof source[key]==='string'&&source[key])Object.assign(fields,{[key]:source[key]});
      for(const key of ['capacity','durationMinutes'] as const)if(typeof source[key]==='number')Object.assign(fields,{[key]:String(source[key])});
      if(typeof source.nameLang==='string'&&['ar','en'].includes(source.nameLang))fields.nameLang=source.nameLang as Draft['nameLang'];
      if(isEmployee&&typeof source.role==='string'&&STAFF_ROLES.includes(source.role as StaffRole))fields.role=source.role as StaffRole;
      if(resource==='services'&&typeof source.category==='string'&&CATEGORIES.includes(source.category as Draft['category']))fields.category=source.category as Draft['category'];
      if(resource==='services'&&typeof source.followUpEnabled==='boolean')fields.followUpEnabled=source.followUpEnabled;
      if(resource==='services'&&typeof source.requiresRoom==='boolean')fields.requiresRoom=source.requiresRoom;
      for(const key of ['openingHours','workingHours','breaks'] as const)if(source[key]&&typeof source[key]==='object'){Object.assign(fields,{[key]:structuredClone(source[key])});if(key==='workingHours')assistantHours.current=true;}
      if(typeof source.branchKey==='string'){const id=Number(source.branchKey.replace(/^branch_/,''));if(options.branches.some(b=>b.id===id))fields.branchId=id;}
      if(isEmployee)setStep(2);
      await delay(70);const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      for(const [key,value] of Object.entries(fields)){if(sequence!==turn)return;if(touched.current.has(key)||JSON.stringify(draftRef.current[key as keyof Draft])===JSON.stringify(value))continue;
        if(['workingHours','breaks'].includes(key)){setScheduleOpen(true);await delay(60);}
        const testId=key==='openingHours'?'opening-hours':key==='workingHours'?'working-hours':key==='breaks'?'breaks':`${['nameLang','branchId','timeZone','currency','category','role'].includes(key)?'select':typeof value==='boolean'?'check':'input'}-${key}`;
        const target=formRef.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`);if(target){target.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});await delay(reduced?0:160);if(sequence!==turn)return;target.classList.add('jc-ai-field');window.dispatchEvent(new CustomEvent('jormall:concierge-field',{detail:{target}}));await delay(reduced?0:350);}
        const typeable=['name','email','phone','jobTitle','price','capacity','durationMinutes'].includes(key)&&typeof value==='string';
        if(typeable&&!reduced){const chars=Array.from(value);for(let i=1;i<=chars.length;i++){if(sequence!==turn||touched.current.has(key))break;setDraft(old=>({...old,[key]:chars.slice(0,i).join('')}));await delay(Math.max(10,Math.min(28,900/chars.length)));}}
        else if(!touched.current.has(key))setDraft(old=>({...old,[key]:value}));
        target?.classList.remove('jc-ai-field');
      }
      if(sequence===turn)window.dispatchEvent(new CustomEvent('jormall:concierge-field',{detail:{done:true}}));
    };
    window.addEventListener('jormall:concierge-focus-field',focusField);window.addEventListener('jormall:concierge-prefill',prefill);window.addEventListener('jormall:concierge-stop-typing',stop);return()=>{stop();window.removeEventListener('jormall:concierge-focus-field',focusField);window.removeEventListener('jormall:concierge-prefill',prefill);window.removeEventListener('jormall:concierge-stop-typing',stop);};
  },[isNew,isEmployee,resource,assistantKey,options.branches]);
  const zone = branchZone(options, draft.branchId);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touched.current.add(key);
    setDraft((d) => ({ ...d, [key]: value,...(key==='name'?{nameLang:/[\u0600-\u06ff]/u.test(String(value))?'ar' as const:'en' as const}:{}) }));
    setErrors((old) => ({ ...old, [key]: '' }));
    setRequestError('');
  };
  const mutation = useMutation({
    mutationFn: (body: unknown) => api<{item:{id:number}}>(recordPath(resource) + (record ? `/${record.id}` : ''), { method: record ? 'PUT' : 'POST', body }),
    onSuccess: () => {
      setDraft((d) => ({ ...d, initialPassword: '' }));
      onSaved(t(isEmployee && isNew ? 'p2.createdStaff' : 'p2.saved'));
    },
    onError: (err) => {
      if (err instanceof ApiError && err.issues) {
        const next: Record<string,string> = {};
        for (const issue of err.issues) {
          const field = issue.path.split('.')[0] || 'name';
          next[field] = issue.message in dict.errors ? t(`errors.${issue.message}`) : t('errors.invalid_value');
        }
        setErrors(next);
        if (next.workingHours || next.breaks || next.timeOff) setScheduleOpen(true);
        if (isEmployee && Object.keys(next).some((k) => k !== 'permissions' && k !== 'role')) setStep(2);
      }
      setRequestError(errorMessage(err));
      setTimeout(() => alertRef.current?.focus(), 0);
    },
  });
  function validate(): boolean {
    const e: Record<string,string> = {};
    const fail = (field: string, code: string) => { e[field] = t(`errors.${code}`); };
    if (isEmployee && step === 1) { setErrors({}); return true; }
    if (!draft.name.trim()) fail('name','nameRequired');
    if ((isEmployee || draft.email) && !validEmail(draft.email) && (isEmployee || resource === 'customers')) fail('email','emailInvalid');
    if (resource === 'customers' && !draft.phone.trim() && !draft.email.trim()) fail('phone','contact_required');
    if (draft.phone.trim() && !normalizePhone(draft.phone)) e.phone = phoneValidationMessage(lang);
    if (resource === 'branches' && draft.mapUrl.trim()) { try { const url = new URL(draft.mapUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error(); } catch { e.mapUrl = lang === 'ar' ? 'أدخل رابط خريطة صالحًا يبدأ بـ https:// أو http://.' : 'Enter a valid map link starting with https:// or http://.'; } }
    if (resource === 'branches' && !hoursValid(draft.openingHours)) fail('openingHours','invalid_hours');
    if (resource === 'rooms' && !draft.branchId) fail('branchId','branch_required');
    if (resource === 'rooms' && (!Number.isInteger(Number(draft.capacity)) || Number(draft.capacity)<1 || Number(draft.capacity)>1000)) fail('capacity','invalid_capacity');
    if (resource === 'rooms') {
      const names = new Set(draft.roomEquipment.map(item=>item.trim().toLocaleLowerCase()));
      if (options.services.some(service=>draft.serviceIds.includes(service.id)&&(service.requiredEquipment??[]).some(item=>!names.has(item.trim().toLocaleLowerCase())))) e.roomEquipment=lang==='ar'?'أضف معدات الخدمات المحددة إلى الغرفة أولاً.':'Add the selected services’ equipment to this room first.';
    }
    if (resource === 'services') {
      if (!record && !assistantKey && !draft.requiredEquipment.length && !noEquipment) e.requiredEquipment = lang === 'ar' ? 'حدد المعدات المطلوبة أو أكد أن الخدمة لا تحتاج معدات.' : 'Choose equipment or confirm none is needed.';
      if(draft.definition){try{const definition=parseServiceDefinition(draft.definition);if(draft.isActive&&definitionIssues(definition).length)e.definition=lang==='ar'?'راجع النطاق الطبي والطلبات غير المدعومة.':'Review medical scope and unsupported requests.';}catch{e.definition=lang==='ar'?'تعريف الخدمة أو حقولها غير مكتمل.':'The service definition or fields are incomplete.';}}
      if (!Number.isInteger(Number(draft.durationMinutes)) || Number(draft.durationMinutes)<1 || Number(draft.durationMinutes)>1440) fail('durationMinutes','invalid_duration');
      if (!/^\d{1,9}(\.\d{1,3})?$/.test(draft.price)) fail('price','invalid_price');
    }
    if (isEmployee) {
      if (isNew && draft.initialPassword.length < 10) fail('initialPassword','passwordTooShort');
      if(!draft.branchSchedules.length||draft.branchSchedules.some(s=>!DAYS.some(day=>s.workingHours[day].length)))fail('branchSchedules','staff_branch_hours_required');
      if(draft.branchSchedules.some(s=>!hoursValid(s.workingHours)||!hoursValid(s.breaks)))fail('branchSchedules','invalid_hours');
      if(draft.branchSchedules.some(s=>!DAYS.every(day=>s.breaks[day].every(b=>s.workingHours[day].some(w=>w.open<=b.open&&w.close>=b.close)))))fail('branchSchedules','break_outside_hours');
      if (!hoursValid(draft.workingHours)) fail('workingHours','invalid_hours');
      if (!hoursValid(draft.breaks)) fail('breaks','invalid_hours');
      if (!DAYS.every((day) => draft.breaks[day].every((b) => draft.workingHours[day].some((w) => w.open <= b.open && w.close >= b.close)))) fail('breaks','break_outside_hours');
      const leave = draft.timeOff.map((l) => ({ from: localToInstant(l.startsAt, zone), to: localToInstant(l.endsAt, zone) })).sort((a,b) => String(a.from).localeCompare(String(b.from)));
      if (leave.some((l,i) => !l.from || !l.to || l.from >= l.to || (i>0 && String(leave[i-1]!.to)>l.from))) fail('timeOff','invalid_time_off');
    }
    setErrors(e);
    if (e.workingHours || e.breaks || e.timeOff) setScheduleOpen(true);
    if (Object.keys(e).length) setTimeout(() => alertRef.current?.focus(), 0);
    return !Object.keys(e).length;
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if(resource==='branches'||isEmployee&&step>=2){const invalid=formRef.current?.querySelector<HTMLInputElement>('.weekly-schedule input:invalid');if(invalid){const section=invalid.closest('details');if(section)section.open=true;invalid.scrollIntoView({block:'center'});invalid.reportValidity();return;}}
    if (draft.phone.trim() && !normalizePhone(draft.phone)) { setErrors(old => ({...old, phone: phoneValidationMessage(lang)})); return; }
    if(assistantKey){const keys=['name','nameLang','email','phone','jobTitle','price','currency','category','timeZone','role','requiresRoom','followUpEnabled','openingHours','workingHours','breaks'] as const;const fields:Record<string,unknown>={};for(const key of keys)if(touched.current.has(key))fields[key]=draft[key];for(const key of ['durationMinutes','capacity'] as const)if(touched.current.has(key))fields[key]=Number(draft[key]);if(touched.current.has('branchSchedules'))fields.branchSchedules=draft.branchSchedules.map(s=>({branchKey:`branch_${s.branchId}`,workingHours:s.workingHours,breaks:s.breaks}));if(touched.current.has('branchId'))fields.branchKey=draft.branchId?`branch_${draft.branchId}`:null;window.dispatchEvent(new CustomEvent('jormall:concierge-review-record',{detail:{resource,key:assistantKey,fields}}));return;}
    if (mutation.isPending || !validate()) return;
    if (isEmployee && step < 3) { setStep((s)=>s+1); return; }
    const common = { name: draft.name.trim(), nameLang: draft.nameLang };
    let body: unknown;
    if (resource === 'branches') body = { ...common, address: draft.address.trim() || null, mapUrl: draft.mapUrl.trim() || null, timeZone: draft.timeZone, openingHours: draft.openingHours };
    else if (resource === 'services') body = { ...common, definition:draft.definition?parseServiceDefinition(draft.definition):null, branchId: draft.branchId, durationMinutes: Number(draft.durationMinutes), price: draft.price, currency: 'JOD', category: draft.category, isActive: draft.isActive, requiresRoom: draft.requiresRoom, followUpEnabled:draft.followUpEnabled, requiredEquipment: draft.requiredEquipment, employeeIds: draft.employeeIds };
    else if (resource === 'rooms') body = { ...common, branchId: draft.branchId, capacity: Number(draft.capacity), status: draft.status, serviceIds: draft.serviceIds, extra: { ...record?.extra, equipment: draft.roomEquipment, openingHours: null, breaks: null } };
    else if (resource === 'customers') body = { ...common, branchId: draft.branchId, email: draft.email.trim() || null, phone: draft.phone.trim() || null, notes: draft.notes, sensitiveNotes: draft.sensitiveNotes };
    else body = { ...common, branchSchedules:draft.branchSchedules,branchId: draft.branchSchedules.length===1?draft.branchSchedules[0]!.branchId:null, email: draft.email.trim(), phone: draft.phone.trim() || null, jobTitle: draft.jobTitle.trim() || null, role: draft.role, permissions: draft.permissions, isActive: draft.isActive, serviceIds: ['doctor','service_provider'].includes(draft.role)?draft.serviceIds:[], workingHours: draft.workingHours, breaks: draft.breaks, timeOff: draft.timeOff.map((l) => ({ startsAt: localToInstant(l.startsAt,zone), endsAt: localToInstant(l.endsAt,zone), note:l.note })), ...(isNew ? {initialPassword:draft.initialPassword} : {}) };
    mutation.mutate(body);
  }
  const fieldLabel = (key: string) => key==='branchSchedules'?(lang==='ar'?'الفروع وساعات العمل':'Branches and working hours'): key==='price'&&resource==='services' ? lang==='ar'?'أتعاب الطبيب / الخدمة (JOD)':'Doctor / service fee (JOD)' : t(`p2.fields.${key}`);
  const input = (key: 'name'|'phone'|'email'|'jobTitle'|'price'|'capacity'|'durationMinutes', type='text', required=false) => key === 'phone' ? <PhoneField key={key} label={fieldLabel(key)} value={draft.phone} onChange={value=>set('phone',value)} error={errors.phone} testId="input-phone"/> : <FormField key={key} label={fieldLabel(key)} value={draft[key]} onChange={(e)=>set(key,e.target.value)} type={type} required={required} error={errors[key]} data-testid={`input-${key}`} maxLength={key==='name'||key==='jobTitle'?120:key==='email'?200:undefined} dir={key==='name' ? draft.nameLang==='ar'?'rtl':'ltr' : ['email','price','capacity','durationMinutes'].includes(key)?'ltr':undefined} lang={key==='name'?draft.nameLang:undefined} inputMode={['price','durationMinutes','capacity'].includes(key)?'decimal':undefined}/>;
  const nameFields = <>{input('name','text',true)}</>;
  function changeBranch(value: string) {
    touched.current.add('branchId');
    const next = value ? Number(value) : null, nextZone = branchZone(options,next);
    setDraft((old) => ({ ...old, branchId: next,
      timeOff: old.timeOff.map((entry) => {
      const start=localToInstant(entry.startsAt,zone), end=localToInstant(entry.endsAt,zone);
      return { ...entry, startsAt:start?instantToLocal(start,nextZone):entry.startsAt, endsAt:end?instantToLocal(end,nextZone):entry.endsAt };
    }) }));
  }
  const branchField = <SelectField label={fieldLabel('branchId')} value={draft.branchId??''} onChange={changeBranch} testId="select-branchId" error={errors.branchId} required={resource==='rooms'}><option value="">{t(resource==='rooms'?'p2.chooseBranch':'p2.allBranches')}</option>{options.branches.map((b)=><option key={b.id} value={b.id} lang={b.nameLang} dir={b.nameLang==='ar'?'rtl':'ltr'}>{b.name}</option>)}</SelectField>;
  const compatible = (id: number | null | undefined) => draft.branchId===null || id==null || id===draft.branchId;
  const selectedServices = options.services.filter((o) => (isEmployee?(o.branchId==null||draft.branchSchedules.some(s=>s.branchId===o.branchId)):compatible(o.branchId)) || draft.serviceIds.includes(o.id));
  const selectedEmployees = options.employees.filter((o) => (draft.branchId===null||(o.branchSchedules?.length?o.branchSchedules.some(s=>s.branchId===draft.branchId):compatible(o.branchId))) || draft.employeeIds.includes(o.id));
  const errorEntries = Object.entries(errors).filter(([,v])=>Boolean(v));
  return <form ref={formRef} onSubmit={submit} noValidate className="space-y-5" data-testid={`form-${resource}`} data-assistant-key={assistantKey}>
    <div ref={alertRef} tabIndex={-1} className="outline-none" aria-live="polite"><FormError message={requestError}/>{errorEntries.length>0 && <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"><p className="font-medium">{t('p2.invalidFields')}</p>{errorEntries.map(([field,message])=><p key={field}>{fieldLabel(field)}: {message}</p>)}</div>}</div>
    {isEmployee && <><p className="text-sm text-primary" data-testid="staff-step">{t('p2.step',{step})}</p><ol className="grid grid-cols-3 gap-2 text-xs">{['roleStep','personStep','accessStep'].map((key,i)=><li key={key} aria-current={step===i+1?'step':undefined} className={`rounded-md border p-2 ${step===i+1?'border-primary bg-primary/5 font-semibold':''}`}>{t(`p2.${key}`)}</li>)}</ol></>}
    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-5">
      {isEmployee && step===1 && <SelectField label={fieldLabel('role')} value={draft.role} onChange={(v)=>{set('role',v as StaffRole);set('permissions',options.rolePresets[v as StaffRole]??[]);}} testId="select-role">{STAFF_ROLES.map((role)=><option key={role} value={role}>{t(`roles.${role}`)}</option>)}</SelectField>}
      {(!isEmployee || step===2) && <><div className="grid min-w-0 gap-4 sm:grid-cols-2">{nameFields}{resource!=='branches'&&!isEmployee && branchField}
      {resource==='branches' && <SelectField label={fieldLabel('timeZone')} value={draft.timeZone} onChange={(v)=>set('timeZone',v)} testId="select-timeZone">{[...new Set([draft.timeZone,...options.timeZones])].map((tz)=><option key={tz} value={tz}>{tz}</option>)}</SelectField>}
      {resource==='services' && <>{input('durationMinutes','number',true)}{input('price','text',true)}<p className="self-center text-xs text-muted-foreground">{lang==='ar'?'أتعاب الخدمة بالدينار الأردني؛ تُضاف أسعار المنتجات المحتسبة على المريض حسب الكمية.':'Service fees use JOD. Products charged to patients are added separately by quantity.'}</p><SelectField label={fieldLabel('category')} value={draft.category} onChange={(v)=>set('category',v as Draft['category'])} testId="select-category">{CATEGORIES.map((v)=><option key={v} value={v}>{t(`p2.categories.${v}`)}</option>)}</SelectField><CheckField label={lang==='ar'?'رتوش / موعد متابعة — السعر الافتراضي صفر':'Retouch / follow-up appointment — default price zero'} checked={draft.followUpEnabled} onChange={v=>set('followUpEnabled',v)} testId="check-followUpEnabled"/><CheckField label={fieldLabel('requiresRoom')} checked={draft.requiresRoom} onChange={(v)=>set('requiresRoom',v)} testId="check-requiresRoom"/><CheckField label={fieldLabel('isActive')} checked={draft.isActive} onChange={(v)=>set('isActive',v)} testId="check-isActive"/></>}
      {resource==='rooms' && <>{input('capacity','number',true)}<SelectField label={fieldLabel('status')} value={draft.status} onChange={(v)=>set('status',v as Draft['status'])} testId="select-status"><option value="available">{t('p2.available')}</option><option value="maintenance">{t('p2.maintenance')}</option></SelectField></>}
{(isEmployee || resource==='customers') && <>{input('email','email',isEmployee)}{input('phone','tel')}{isEmployee && <>{input('jobTitle')}{isNew && !assistantKey && <PasswordField label={fieldLabel('initialPassword')} value={draft.initialPassword} onChange={(e)=>set('initialPassword',e.target.value)} error={errors.initialPassword} autoComplete="new-password" hint={t('owner.initialPasswordHint')} data-testid="input-initialPassword" minLength={10} maxLength={200}/>}<CheckField label={fieldLabel('isActive')} checked={draft.isActive} onChange={(v)=>set('isActive',v)} testId="check-isActive"/></>}</>}
      </div>
      {resource==='branches' && <><FormField label={lang==='ar'?'موقع الفرع':'Branch address'} value={draft.address} onChange={e=>set('address',e.target.value)} maxLength={400} testId="input-address" error={errors.address}/><FormField label={lang==='ar'?'رابط الخريطة':'Map link'} type="url" value={draft.mapUrl} onChange={e=>set('mapUrl',e.target.value)} maxLength={500} testId="input-mapUrl" error={errors.mapUrl}/><HoursEditor label={fieldLabel('openingHours')} value={draft.openingHours} onChange={(v)=>set('openingHours',v)} testId="opening-hours" error={errors.openingHours}/></>}
      {resource==='services'&&!assistantKey&&<div className="col-span-full"><DefinitionEditor value={draft.definition} onChange={d=>set('definition',d)} language={lang}/>{errors.definition&&<FormError message={errors.definition}/>}</div>}
      {resource==='services' && <><section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">{lang==='ar'?'المعدات المطلوبة للخدمة':'Equipment needed for this service'} *</h3><EquipmentPicker value={draft.requiredEquipment} onChange={v=>{set('requiredEquipment',v);if(v.length)setNoEquipment(false);}} lang={lang}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noEquipment} onChange={event=>{setNoEquipment(event.target.checked);if(event.target.checked)set('requiredEquipment',[]);}}/>{lang==='ar'?'لا تحتاج معدات':'No equipment needed'}</label>{errors.requiredEquipment&&<FormError message={errors.requiredEquipment}/>}</section><MultiPicker label={fieldLabel('employeeIds')} options={selectedEmployees} selected={draft.employeeIds} onChange={(v)=>set('employeeIds',v)} testId="employee-choice"/><p className="text-xs text-muted-foreground">{t('p2.selectHint')}</p></>}
      {resource==='rooms' && <><section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">{lang==='ar'?'معدات الغرفة':'Room equipment'}</h3><EquipmentPicker value={draft.roomEquipment} onChange={v=>set('roomEquipment',v)} lang={lang} suggestions={selectedServices.flatMap(item=>item.requiredEquipment??[])}/>{errors.roomEquipment&&<FormError message={errors.roomEquipment}/>}<p className="text-xs text-muted-foreground">{lang==='ar'?'توفر الغرفة يتبع أيام وساعات عمل الفرع.':'Room availability follows branch opening days and hours.'}</p></section><RoomServicePicker options={selectedServices} selected={draft.serviceIds} onChange={(v)=>set('serviceIds',v)}/></>}
      {isEmployee && ['doctor','service_provider'].includes(draft.role) && <><MultiPicker label={fieldLabel('serviceIds')} options={selectedServices} selected={draft.serviceIds} onChange={(v)=>set('serviceIds',v)} testId="service-choice"/><p className="text-xs text-muted-foreground">{t('p2.selectHint')}</p></>}
      {resource==='rooms' && !options.branches.length && <p role="alert" className="text-sm text-destructive">{t('p2.noBranch')}</p>}
      {resource==='customers' && <><p className="text-xs text-muted-foreground">{t('p2.contactHint')}</p><TextareaField label={fieldLabel('notes')} value={draft.notes} onChange={(v)=>set('notes',v)} testId="input-notes"/><TextareaField label={fieldLabel('sensitiveNotes')} value={draft.sensitiveNotes} onChange={(v)=>set('sensitiveNotes',v)} testId="input-sensitiveNotes" hint={t('p2.sensitiveHint')} maxLength={10000}/></>}
      {isEmployee && <details open={scheduleOpen} onToggle={(e)=>setScheduleOpen(e.currentTarget.open)} className="rounded-lg border p-3"><summary className="focus-ring cursor-pointer rounded text-sm font-semibold" data-testid="staff-schedule">{t('p2.schedule')}</summary><div className="mt-4 space-y-4"><StaffBranchField branches={options.branches.map(b=>({key:String(b.id),name:b.name,timeZone:b.timeZone,openingHours:b.openingHours}))} value={draft.branchSchedules.map(s=>({branchKey:String(s.branchId),workingHours:s.workingHours,breaks:s.breaks}))} language={lang} onChange={value=>{const shifts=value.map(s=>({branchId:Number(s.branchKey),workingHours:s.workingHours,breaks:s.breaks}));set('branchSchedules',shifts);set('branchId',shifts.length===1?shifts[0]!.branchId:null);if(shifts[0]){set('workingHours',shifts[0].workingHours);set('breaks',shifts[0].breaks);}}}/>{errors.branchSchedules&&<p role="alert" className="text-sm text-destructive">{errors.branchSchedules}</p>}<fieldset className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">{fieldLabel('timeOff')}</legend><p className="text-xs text-muted-foreground">{t('p2.timeOffZone',{zone})}</p>{draft.timeOff.map((leave,i)=><div key={i} className="space-y-3 border-b pb-3"><div className="grid min-w-0 gap-3 sm:grid-cols-2">{(['startsAt','endsAt'] as const).map((key)=><label key={key} className="min-w-0 text-xs">{t(key==='startsAt'?'p2.from':'p2.to')}<input type="datetime-local" value={leave[key]} onChange={(e)=>set('timeOff',draft.timeOff.map((l,j)=>j===i?{...l,[key]:e.target.value}:l))} className={`${controlClass} mt-1 px-1`} data-testid={`time-off-${i}-${key}`}/></label>)}</div><TextareaField label={fieldLabel('notes')} value={leave.note} onChange={(v)=>set('timeOff',draft.timeOff.map((l,j)=>j===i?{...l,note:v}:l))} testId={`time-off-${i}-note`} maxLength={500}/><Button type="button" variant="ghost" size="sm" onClick={()=>set('timeOff',draft.timeOff.filter((_,j)=>j!==i))} data-testid={`time-off-${i}-remove`}>{t('p2.removeTimeOff')}</Button></div>)}{draft.timeOff.length<100 && <Button type="button" variant="outline" onClick={()=>set('timeOff',[...draft.timeOff,{startsAt:'',endsAt:'',note:''}])} data-testid="add-time-off">{t('p2.addTimeOff')}</Button>}{errors.timeOff && <p role="alert" className="text-sm text-destructive">{errors.timeOff}</p>}</fieldset></div></details>}
      </>}
      {isEmployee && step===3 && <><div className="rounded-lg bg-muted/50 p-4 text-sm"><h3 className="font-semibold">{t('p2.review')}</h3><p className="mt-2" lang={draft.nameLang} dir={draft.nameLang==='ar'?'rtl':'ltr'}>{draft.name}</p><p dir="ltr" className="break-all">{draft.email}</p><p>{t(`roles.${draft.role}`)}</p><p className="mt-2 text-xs text-muted-foreground">{t('p2.reviewHint')}</p></div><fieldset className="space-y-3"><legend className="mb-2 font-medium">{fieldLabel('permissions')}</legend><p className="text-xs text-muted-foreground">{t('p2.manageIncludesRead')}</p><p className="text-xs text-muted-foreground" data-testid="appointment-scope-hint">{t('p3.appointmentsScopeHint')}</p><div className="overflow-hidden rounded-lg border"><div className="grid grid-cols-[1fr_75px_75px] bg-muted/50 p-3 text-xs font-semibold"><span>{fieldLabel('permissions')}</span><span>{t('p2.read')}</span><span>{t('p2.manage')}</span></div>{PERMISSION_AREAS.map((area)=><div key={area} className="grid grid-cols-[1fr_75px_75px] items-center border-t p-3 text-sm"><span>{t(`p2.areas.${area}`)}</span>{['read','manage'].map((level)=>{
        const p=`${area}.${level}`, implied=level==='read'&&draft.permissions.includes(`${area}.manage`);
        return <label key={p} className="flex min-h-8 items-center"><span className="sr-only">{t(`p2.areas.${area}`)} — {t(`p2.${level}`)}</span><input type="checkbox" className="focus-ring size-4 accent-primary" checked={draft.permissions.includes(p)||implied} disabled={!options.grantablePermissions.includes(p)||implied} onChange={(e)=>set('permissions',e.target.checked?[...draft.permissions,p]:draft.permissions.filter((x)=>x!==p))} data-testid={`permission-${p}`}/></label>;
      })}</div>)}</div></fieldset></>}
    </fieldset>
    <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending} data-testid="cancel-record">{t('common.cancel')}</Button>
      {(!isEmployee||assistantKey||step===1)&&<Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="record-back">{t('common.back')}</Button>}
      {isEmployee && !assistantKey && step>1 && <Button type="button" variant="outline" onClick={()=>setStep((s)=>s-1)} disabled={mutation.isPending} data-testid="staff-back">{t('common.back')}</Button>}
      <Button type="submit" disabled={mutation.isPending||(!assistantKey&&resource==='rooms'&&!options.branches.length)} data-testid="save-record">{assistantKey?(lang==='ar'?'مراجعة وتأكيد بيانات الشركة':'Review and confirm company details'):mutation.isPending?t('common.loading'):isEmployee&&step<3?t('common.next'):isEmployee&&isNew?t('p2.createAccount'):t('p2.saveChanges')}</Button>
    </div>
  </form>;
}
