import { formatInstantTime } from '@/lib/time-format';
import { Children, cloneElement, isValidElement, useEffect, useState, type ReactNode } from 'react';
import {PaymentSummary} from '@/components/operations/patient-payment';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Boxes, Wrench, Calculator, CheckCircle2, AlertCircle, Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/setup-api';
import { useI18n } from '@/lib/i18n';
import type { CostCatalog, CostEquipment, CostProfile, CostBreakdown, CostActual, CostActualInput, CostAppointment } from '@/lib/costing-api';

const inputClass = 'focus-ring w-full min-w-0 rounded-xl border bg-white px-3 py-2 text-sm';
const panelClass = 'rounded-2xl border bg-white p-4 sm:p-6';
function useCopy() { const { lang } = useI18n(); return (ar: string, en: string) => lang === 'ar' ? ar : en; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-2 text-sm"><span className="font-medium">{label}</span>{Children.map(children,child=>isValidElement<{ 'aria-label'?: string }>(child)&&typeof child.type==='string'&&['input','select','textarea'].includes(child.type)?cloneElement(child,{'aria-label':child.props['aria-label']??label}):child)}</label>; }
function Amount({ value }: { value: string | null }) { return <bdi dir="ltr">{value ?? '—'}{value !== null && ' JOD'}</bdi>; }
function CostError({ error }: { error: unknown }) {
  const L = useCopy(); if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  const messages: Record<string, string> = {
    costing_invalid_link: L('اختَر موارد من نفس الفرع والعيادة، وموظفين نشطين.', 'Choose active resources from the same clinic and branch.'),
    costing_branch_locked: L('فرع المعدة ثابت. أضف سجلًا جديدًا للفرع الآخر.', 'Equipment branch is fixed. Add a separate asset in the other branch.'),
    costing_incomplete: L('أكمل جميع بيانات التكلفة قبل تثبيتها.', 'Complete the cost data before finalizing.'),
    costing_snapshot_locked: L('تكلفة الموعد مثبّتة بالفعل ولا يمكن تغييرها.', 'This appointment cost is already finalized.'),
    validation_error: L('تحقق من الأرقام والحقول المطلوبة.', 'Check numbers and required fields.'),
  };
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{messages[code] ?? L('تعذّر حفظ أو تحميل البيانات. تحقق من المدخلات وحاول مرة ثانية.', 'Could not save or load data. Check the fields and try again.')}</p>;
}
function useSave(onSaved?: () => void) {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ path, body, method = 'PUT' }: { path: string; body: unknown; method?: string }) => api(path, { method, body }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['costing'] }); onSaved?.(); } });
}

function Breakdown({ data }: { data: CostBreakdown }) {
  const L = useCopy();
  const warningLabels: Record<string, string> = {
    billing_selling_price_required:L('أدخل سعر بيع المنتجات المحتسبة على المريض في المخزون.','Set selling prices for products charged to patients in Inventory.'),
    billing_product_inactive:L('أحد المنتجات المحتسبة على المريض غير نشط.','A product charged to the patient is inactive.'),
    recipe_missing: L('لم تُحفظ وصفة التكلفة لهذا الفرع.', 'Save the cost recipe for this branch.'),
    actual_price_missing:L('اعتمد سعر الموعد من تفاصيله قبل تثبيت التكلفة.', 'Confirm the appointment price in its details before finalizing cost.'),
    currency_mismatch: L('عملة الخدمة مختلفة؛ الحساب يحتاج أسعارًا بالدينار الأردني.', 'Service currency differs. JOD rates are required.'),
    actual_consumption_missing: L('سجّل استهلاك المواد الفعلي من تفاصيل الموعد، حتى لو لم تُستخدم مواد.', 'Record actual material consumption in appointment details, including an explicit zero if none were used.'),
    material_rate_missing: L('سعر إحدى المواد غير محدد.', 'A material unit cost is missing.'),
    material_unavailable: L('إحدى المواد غير نشطة أو غير متاحة في الفرع.', 'A material is inactive or unavailable in this branch.'),
    employee_missing: L('اختَر الموظف الذي ينفذ الخدمة.', 'Choose the employee who performs the service.'),
    employee_rate_missing: L('أدخل تكلفة ساعة الموظف.', 'Set the employee hourly cost.'),
    employee_service_mismatch: L('اربط الموظف بالخدمة من قسم الخدمات.', 'Link the employee to this service in Services.'),
    room_missing: L('الخدمة تحتاج غرفة.', 'This service requires a room.'),
    room_rate_missing: L('أدخل تكلفة ساعة الغرفة.', 'Set the room hourly cost.'),
    room_service_mismatch: L('الغرفة غير متوافقة مع الخدمة أو معداتها.', 'The room is incompatible with the service or its equipment.'),
    equipment_inactive: L('إحدى المعدات غير نشطة.', 'An equipment asset is inactive.'),
    required_equipment_cost_missing:L('أضف معدات الخدمة المطلوبة إلى الوصفة، وحدد نوع المعدة المطابق.', 'Add required service equipment to the recipe and specify its matching equipment type.'),
    equipment_room_mismatch: L('اختَر الغرفة التي توجد فيها معدات الوصفة.', 'Choose the room where the recipe equipment is located.'),
    equipment_operator_mismatch: L('الموظف غير مرتبط بإحدى معدات الخدمة.', 'The employee is not an operator of one of the service assets.'),
  };
  const groups = ['materials', 'equipment', 'employee', 'room', 'overhead'];
  const labels: Record<string, string> = { materials: L('الماتيريال', 'Materials'), equipment: L('المعدات', 'Equipment'), employee: L('وقت الموظف', 'Employee time'), room: L('وقت الغرفة', 'Room time'), overhead: L('تكاليف إضافية', 'Additional costs') };
  return <section className={panelClass} data-testid="cost-breakdown">
    <div className="mb-5 flex items-center gap-3"><Calculator className="size-6 text-primary"/><h2 className="font-bold">{L('تفصيل تكلفة الجلسة', 'Session cost breakdown')}</h2></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-primary/10 p-4"><p className="mb-2 text-xs">{L('التكلفة الكاملة', 'Full cost')}</p><strong className="text-2xl" data-testid="cost-total"><Amount value={data.total}/></strong></div>
      <div className="rounded-xl bg-slate-50 p-4"><p className="mb-2 text-xs">{L('مبلغ المريض', 'Patient payment')}</p><strong className="text-xl"><bdi dir="ltr">{data.price} {data.priceCurrency}</bdi></strong></div>
      <div className="rounded-xl bg-emerald-50 p-4"><p className="mb-2 text-xs">{L('هامش الجلسة', 'Session margin')}</p><strong className="text-xl" data-testid="cost-profit"><Amount value={data.profit}/></strong></div>
    </div>
    {data.complete ? <p className="my-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4"/>{L('كل عناصر التكلفة محددة', 'All cost components are configured')}</p> : <div role="status" className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="mb-2 flex items-center gap-2 font-semibold"><AlertCircle className="size-4"/>{L('التكلفة غير مكتملة', 'Cost is incomplete')}</p><ul className="list-inside list-disc space-y-1">{data.warnings.map(w => <li key={w}>{warningLabels[w] ?? w}</li>)}</ul><p className="mt-3">{L('المجموع المعروف فقط: ', 'Known subtotal only: ')}<Amount value={data.knownSubtotal}/></p></div>}
    {data.billing&&<div className="mt-4"><PaymentSummary payment={data.billing}/></div>}
    <div className="mt-4 space-y-4">{groups.map(group => {
      const rows = data.lines.filter(line => line.kind === group); if (!rows.length) return null;
      return <div key={group}><h3 className="mb-2 text-xs font-bold text-slate-500">{labels[group]}</h3>{rows.map((line, index) => <div key={index} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"><div><strong>{line.kind === 'overhead' ? labels.overhead : line.name}</strong><p className="mt-1 text-xs text-slate-500">{line.quantity && <bdi>{line.quantity} {line.unit} × {line.unitCost ?? '—'} JOD</bdi>}{line.minutes !== undefined && <span>{line.minutes} {L('دقيقة', 'min')}{line.hourlyCost !== undefined && <> · <bdi>{line.hourlyCost} JOD/{L('ساعة', 'hour')}</bdi></>}</span>}{line.uses !== undefined && <span> · {line.uses} {L('استخدام', 'uses')}</span>}</p></div><strong><Amount value={line.amount}/></strong></div>)}</div>;
    })}</div>
    <p className="mt-4 text-xs leading-6 text-slate-500">{L('الأرقام حسب أسعار التكلفة المدخلة. كل عنصر يُقرّب إلى 0.001 دينار ثم يُجمع. تجنب إدخال مصروف المعدة أو الموظف مرة ثانية ضمن تكلفة الغرفة أو التكاليف الإضافية.', 'Uses configured cost rates. Each component is rounded to 0.001 JOD, then summed. Avoid counting equipment or staff costs again in room costs or additional costs.')}</p>
  </section>;
}

function EquipmentForm({ catalog: c, item, branchId, close }: { catalog: CostCatalog; item?: CostEquipment; branchId: number; close: () => void }) {
  const L = useCopy(), save = useSave(close);
  const [form, setForm] = useState<Omit<CostEquipment, 'id'>>(() => item ? { ...item } : { name: '', equipmentType:'', branchId, roomId: null, employeeIds: [], purchaseCost: '', residualValue: '0', lifetimeUses: 1000, maintenancePerUse: '0', operatingHourlyCost: '0', isActive: true });
  const set = (patch: Partial<typeof form>) => setForm(old => ({ ...old, ...patch }));
  const staff = c.employees.filter(e => e.isActive && (!e.branchId || e.branchId === form.branchId));
  return <form className={panelClass + ' space-y-5'} onSubmit={e => { e.preventDefault(); const { name, equipmentType, branchId, roomId, purchaseCost, residualValue, lifetimeUses, maintenancePerUse, operatingHourlyCost, isActive, employeeIds } = form; save.mutate({ path: `/clinic/costing/equipment${item ? `/${item.id}` : ''}`, method: item ? 'PUT' : 'POST', body: { name, equipmentType, branchId, roomId, purchaseCost, residualValue, lifetimeUses, maintenancePerUse, operatingHourlyCost, isActive, employeeIds } }); }} data-testid="cost-equipment-form">
    <h2 className="font-bold">{item ? L('تعديل المعدة', 'Edit equipment') : L('إضافة معدة', 'Add equipment')}</h2>
    <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
      <Field label={L('اسم المعدة', 'Equipment name')}><input required maxLength={120} className={inputClass} value={form.name} onChange={e => set({ name: e.target.value })}/></Field>
      <Field label={L('نوع المعدة المطلوب بالخدمات', 'Equipment type required by services')}><input list="cost-equipment-types" maxLength={120} className={inputClass} value={form.equipmentType} onChange={e=>set({equipmentType:e.target.value})}/><datalist id="cost-equipment-types">{[...new Set(c.services.flatMap(s=>s.requiredEquipment))].map(value=><option key={value} value={value}/>)}</datalist></Field>
      <Field label={L('الفرع', 'Branch')}><select disabled={!!item} className={inputClass} value={form.branchId} onChange={e => set({ branchId: Number(e.target.value), roomId: null, employeeIds: [] })}>{c.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label={L('موقع المعدة / الغرفة', 'Equipment location / room')}><select className={inputClass} value={form.roomId ?? ''} onChange={e => set({ roomId: e.target.value ? Number(e.target.value) : null })}><option value="">{L('متنقلة داخل الفرع', 'Mobile within branch')}</option>{c.rooms.filter(r => r.branchId === form.branchId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <Field label={L('عدد الاستخدامات طوال العمر المتوقع', 'Expected lifetime uses')}><input type="number" required min={1} max={1000000000} step={1} className={inputClass} value={form.lifetimeUses} onChange={e => set({ lifetimeUses: Number(e.target.value) })}/></Field>
      {(['purchaseCost', 'residualValue', 'maintenancePerUse', 'operatingHourlyCost'] as const).map((key, i) => <Field key={key} label={[L('سعر الشراء (JOD)', 'Purchase cost (JOD)'), L('القيمة المتبقية (JOD)', 'Residual value (JOD)'), L('صيانة لكل استخدام (JOD)', 'Maintenance per use (JOD)'), L('تشغيل لكل ساعة (JOD)', 'Operating cost per hour (JOD)')][i]!}><input required type="number" min="0" max="999999999.999" step="0.001" className={inputClass} value={form[key]} onChange={e => set({ [key]: e.target.value })}/></Field>)}
      <div className="sm:col-span-2"><p className="mb-2 text-sm font-semibold">{L('الموظفون المسموح لهم باستخدام المعدة', 'Employees allowed to operate this asset')}</p><div className="flex flex-wrap gap-2">{staff.map(e => <label key={e.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={form.employeeIds.includes(e.id)} onChange={event => set({ employeeIds: event.target.checked ? [...form.employeeIds, e.id] : form.employeeIds.filter(id => id !== e.id) })}/>{e.name}</label>)}</div>{!staff.length && <Link className="text-sm underline" href="/people/employees">{L('أضف الموظفين أولًا', 'Add employees first')}</Link>}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => set({ isActive: e.target.checked })}/>{L('المعدة نشطة', 'Active equipment')}</label>
    </fieldset>
    <p className="text-xs text-slate-500">{L('تكلفة الاستخدام = (الشراء − القيمة المتبقية) ÷ الاستخدامات المتوقعة + الصيانة + التشغيل حسب الوقت. إهلاك المعدة توزيع تقديري حسب العمر المدخل.', 'Usage cost = (purchase − residual) ÷ expected uses + maintenance + operating time. Depreciation is an allocation based on the entered useful life.')}</p>
    <CostError error={save.error}/><div className="flex gap-2"><Button disabled={save.isPending || !form.employeeIds.length} type="submit">{L('حفظ المعدة', 'Save equipment')}</Button><Button type="button" variant="outline" onClick={close}>{L('إلغاء', 'Cancel')}</Button></div>
  </form>;
}
function RateRow({ kind, id, name, unit, value, disabled }: { kind: 'employees' | 'rooms' | 'materials'; id: number; name: string; unit: string; value: string | null; disabled: boolean }) {
  const L = useCopy(), [rate, setRate] = useState(value ?? ''), save = useSave();
  useEffect(() => { setRate(value ?? ''); }, [value]);
  return <form onSubmit={e => { e.preventDefault(); save.mutate({ path: `/clinic/costing/rates/${kind}/${id}`, body: { value: rate } }); }} className="space-y-2 border-b py-4"><div className="flex flex-wrap items-end gap-3"><Field label={`${name} · JOD / ${unit}`}><input aria-label={`${name} ${unit}`} disabled={disabled || save.isPending} type="number" required min="0" max="999999999.999" step="0.001" className={inputClass} placeholder={L('غير محدد', 'Not configured')} value={rate} onChange={e => setRate(e.target.value)}/></Field>{!disabled && <Button type="submit" variant="outline" disabled={save.isPending || rate === ''}>{L('حفظ', 'Save')}</Button>}{save.isSuccess && <span role="status" className="text-xs text-emerald-700">{L('تم الحفظ', 'Saved')}</span>}</div><CostError error={save.error}/></form>;
}

function RecipeForm({ catalog: c, serviceId, profile }: { catalog: CostCatalog; serviceId: number; profile: CostProfile }) {
  const L = useCopy(), save = useSave(), [form, setForm] = useState(profile);
  useEffect(() => { setForm(profile); }, [JSON.stringify(profile)]);
  const service = c.services.find(s => s.id === serviceId)!;
  const materials = c.materials.filter(m => m.branchId === profile.branchId && m.isActive), equipment = c.equipment.filter(e => e.branchId === profile.branchId && e.isActive);
  const set = (patch: Partial<CostProfile>) => setForm(old => ({ ...old, ...patch }));
  return <form className={panelClass + ' space-y-5'} onSubmit={e => { e.preventDefault(); const { branchId, overhead, materials, equipment } = form; save.mutate({ path: `/clinic/costing/services/${serviceId}`, body: { branchId, overhead, materials, equipment } }); }} data-testid="cost-recipe-form">
    <h2 className="font-bold">{L('وصفة الخدمة في هذا الفرع', 'Service recipe in this branch')}</h2><p className="text-xs text-slate-500">{L('اربط المواد وكمياتها لكل موعد. تُضاف أسعار المنتجات المحتسبة على المريض إلى أتعاب الطبيب، وتبقى المستهلكات ضمن تكلفة العيادة فقط.','Link materials and quantities per appointment. Products charged to patients add their selling prices to the doctor’s fee; consumables stay in clinic costs.')}</p>
    <fieldset disabled={!c.canManage || save.isPending} className="space-y-5">
      <div><h3 className="mb-2 text-sm font-semibold">{L('الماتيريال وكميتها لكل جلسة', 'Materials and quantity per session')}</h3><p className="mb-3 text-xs text-slate-500">{L('الكمية بنفس وحدة المخزون: مثلًا 0.100 من عبوة = عُشر العبوة.', 'Use the stock unit: e.g. 0.100 bottle means one tenth of a bottle.')}</p>
        {form.materials.map((line, i) => <div key={i} className="mb-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]"><select aria-label={L('المادة', 'Material')} required className={inputClass} value={line.itemId || ''} onChange={e => set({ materials: form.materials.map((v, j) => j === i ? { ...v, itemId: Number(e.target.value) } : v) })}><option value="">{L('اختَر مادة', 'Choose material')}</option>{materials.filter(m => m.id === line.itemId || !form.materials.some(l => l.itemId === m.id)).map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit}) · {m.billingType==='patient_charge'?L('يُضاف للمريض','Charged to patient'):L('تكلفة العيادة','Clinic cost')}</option>)}</select><input aria-label={L('كمية المادة', 'Material quantity')} type="number" required min="0.001" max="999999999.999" step="0.001" className={inputClass} value={line.quantity} onChange={e => set({ materials: form.materials.map((v, j) => j === i ? { ...v, quantity: e.target.value } : v) })}/><Button type="button" variant="outline" onClick={() => set({ materials: form.materials.filter((_, j) => j !== i) })}>{L('حذف', 'Remove')}</Button></div>)}
        <Button type="button" variant="outline" disabled={form.materials.length >= materials.length} onClick={() => set({ materials: [...form.materials, { itemId: 0, quantity: '1' }] })}><Plus className="me-2 size-4"/>{L('إضافة مادة', 'Add material')}</Button></div>
      <div><h3 className="mb-3 text-sm font-semibold">{L('المعدات ومدة استخدامها', 'Equipment and usage time')}</h3>
        {form.equipment.map((line, i) => <div key={i} className="mb-3 grid items-end gap-2 sm:grid-cols-[1fr_100px_100px_auto]"><Field label={L('المعدة', 'Asset')}><select required className={inputClass} value={line.equipmentId || ''} onChange={e => set({ equipment: form.equipment.map((v, j) => j === i ? { ...v, equipmentId: Number(e.target.value) } : v) })}><option value="">{L('اختَر معدة', 'Choose equipment')}</option>{equipment.filter(asset => asset.id === line.equipmentId || !form.equipment.some(l => l.equipmentId === asset.id)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></Field><Field label={L('الاستخدامات', 'Uses')}><input type="number" required min={1} max={1000000} className={inputClass} value={line.uses} onChange={e => set({ equipment: form.equipment.map((v, j) => j === i ? { ...v, uses: Number(e.target.value) } : v) })}/></Field><Field label={L('الدقائق', 'Minutes')}><input type="number" required min={0} max={1440} className={inputClass} value={line.minutes} onChange={e => set({ equipment: form.equipment.map((v, j) => j === i ? { ...v, minutes: Number(e.target.value) } : v) })}/></Field><Button type="button" variant="outline" onClick={() => set({ equipment: form.equipment.filter((_, j) => j !== i) })}>{L('حذف', 'Remove')}</Button></div>)}
        <Button type="button" variant="outline" disabled={form.equipment.length >= equipment.length} onClick={() => set({ equipment: [...form.equipment, { equipmentId: 0, uses: 1, minutes: service.durationMinutes }] })}><Plus className="me-2 size-4"/>{L('إضافة معدة', 'Add equipment')}</Button></div>
      <Field label={L('تكاليف إضافية لكل جلسة (JOD)', 'Additional costs per session (JOD)')}><input required type="number" min="0" max="999999999.999" step="0.001" className={inputClass} value={form.overhead} onChange={e => set({ overhead: e.target.value })}/></Field>
      {c.canManage && <Button type="submit" data-testid="cost-save-recipe">{L('اعتماد وصفة التكلفة', 'Save cost recipe')}</Button>}
    </fieldset><CostError error={save.error}/>{save.isSuccess && <p role="status" className="text-sm text-emerald-700">{L('تم اعتماد الوصفة', 'Recipe saved')}</p>}
  </form>;
}
function ServiceCosting({ catalog: c, branchId }: { catalog: CostCatalog; branchId: number }) {
  const L = useCopy(), services = c.services.filter(s => s.isActive && (!s.branchId || s.branchId === branchId));
  const [serviceId, setServiceId] = useState(services[0]?.id ?? 0), [employeeId, setEmployeeId] = useState<number | null>(null), [roomId, setRoomId] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['costing', 'quote', serviceId, branchId, employeeId, roomId], enabled: !!serviceId, queryFn: () => api<CostBreakdown>(`/clinic/costing/services/${serviceId}/quote`, { method: 'POST', body: { branchId, employeeId, roomId } }) });
  if (!services.length) return <div className={panelClass}><p>{L('أضف خدمة لهذا الفرع أولًا.', 'Add a service for this branch first.')}</p><Link href="/business/services" className="mt-3 inline-block underline">{L('إدارة الخدمات', 'Manage services')}</Link></div>;
  return <div className="space-y-5"><div className={panelClass + ' grid gap-4 sm:grid-cols-3'}><Field label={L('الخدمة', 'Service')}><select className={inputClass} value={serviceId} onChange={e => { setServiceId(Number(e.target.value)); setEmployeeId(null); setRoomId(null); }}>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label={L('الموظف المنفذ', 'Employee')}><select className={inputClass} value={employeeId ?? ''} onChange={e => setEmployeeId(e.target.value ? Number(e.target.value) : null)}><option value="">{L('اختَر الموظف', 'Choose employee')}</option>{q.data?.eligibleEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field><Field label={L('الغرفة', 'Room')}><select className={inputClass} value={roomId ?? ''} onChange={e => setRoomId(e.target.value ? Number(e.target.value) : null)}><option value="">{L('بدون غرفة / اختَر غرفة', 'No room / choose room')}</option>{q.data?.eligibleRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field><p className="text-xs text-slate-500 sm:col-span-3">{L('خيارات الموظفين والغرف تتبع روابط الخدمة الموجودة. أي عدم توافق مع المعدات يظهر في الحساب.', 'Employee and room choices follow the existing service links. Equipment mismatches appear in the calculation.')}</p></div>
    <CostError error={q.error}/>{q.isPending && <p role="status">{L('جارٍ الحساب…', 'Calculating…')}</p>}{q.data && <div className="grid items-start gap-5 xl:grid-cols-2"><RecipeForm key={`${serviceId}-${branchId}`} catalog={c} serviceId={serviceId} profile={q.data.profile}/><Breakdown data={q.data}/></div>}
  </div>;
}
function ActualCosting({ catalog: c, branchId }: { catalog: CostCatalog; branchId: number }) {
  const { lang } = useI18n();
  const L = useCopy(), client = useQueryClient(), [id, setId] = useState(0), [form, setForm] = useState<CostActualInput | null>(null), [confirmed, setConfirmed] = useState(false);
  const list = useQuery({ queryKey: ['costing', 'appointments'], queryFn: () => api<{ appointments: CostAppointment[] }>('/clinic/costing/appointments') });
  const q = useQuery({ queryKey: ['costing', 'actual', id], enabled: !!id, queryFn: () => api<CostActual>(`/clinic/costing/appointments/${id}`) });
  useEffect(() => { setForm(q.data?.actual ?? null); setConfirmed(false); }, [q.data]);
  const calculate = useMutation({ mutationFn: (freeze: boolean) => api<CostActual>(`/clinic/costing/appointments/${id}/${freeze ? 'finalize' : 'preview'}`, { method: 'POST', body: form }), onSuccess: data => { client.setQueryData(['costing', 'actual', id], data); } });
  const appointments = list.data?.appointments.filter(a => a.branchId === branchId) ?? [];
  return <div className="space-y-5"><div className={panelClass}><Field label={L('موعد مكتمل (آخر 200 موعد)', 'Completed appointment (latest 200)')}><select className={inputClass} value={id || ''} onChange={e => { setId(Number(e.target.value)); calculate.reset(); }}><option value="">{L('اختَر موعدًا', 'Choose appointment')}</option>{appointments.map(a => <option key={a.id} value={a.id}>#{a.id} · {c.services.find(s => s.id === a.serviceId)?.name} · {formatInstantTime(a.startsAt,undefined,lang,true)}</option>)}</select></Field>{list.isSuccess && !appointments.length && <p className="mt-3 text-sm text-slate-500">{L('لا توجد مواعيد مكتملة لهذا الفرع.', 'No completed appointments in this branch.')}</p>}</div>
    <CostError error={list.error || q.error || calculate.error}/>
    {q.data?.frozen && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" data-testid="cost-frozen">{L('تكلفة الموعد مثبّتة، بأسعار وقت الاعتماد.', 'Appointment cost is finalized using rates at confirmation time.')}</p>}
    {q.data && !q.data.frozen && form && <form className={panelClass + ' space-y-4'} onSubmit={e => { e.preventDefault(); calculate.mutate(false); }}>
      <h2 className="font-bold">{L('تأكيد الاستخدام الفعلي', 'Confirm actual usage')}</h2><Field label={L('وقت الموظف والغرفة الفعلي بالدقائق', 'Actual employee and room time in minutes')}><input className={inputClass} type="number" required min={1} max={1440} value={form.actualMinutes} onChange={e => { setForm({ ...form, actualMinutes: Number(e.target.value) }); setConfirmed(false); }}/></Field>
      {form.equipment.map((line, i) => <div key={line.equipmentId} className="grid items-end gap-3 sm:grid-cols-3"><strong className="text-sm">{c.equipment.find(e => e.id === line.equipmentId)?.name}</strong><Field label={L('الاستخدامات الفعلية', 'Actual uses')}><input className={inputClass} type="number" required min={0} max={1000000} value={line.uses} onChange={e => { setForm({ ...form, equipment: form.equipment.map((v, j) => i === j ? { ...v, uses: Number(e.target.value) } : v) }); setConfirmed(false); }}/></Field><Field label={L('دقائق التشغيل الفعلية', 'Actual operating minutes')}><input className={inputClass} type="number" required min={0} max={1440} value={line.minutes} onChange={e => { setForm({ ...form, equipment: form.equipment.map((v, j) => i === j ? { ...v, minutes: Number(e.target.value) } : v) }); setConfirmed(false); }}/></Field></div>)}
      <p className="text-xs text-slate-500">{L('الوقت والاستخدامات مبدئيًا من الوصفة والموعد؛ عدّلها حسب الواقع. المواد تُقرأ من سجل الاستهلاك الفعلي.', 'Initial time and usage come from the recipe and appointment. Adjust to actual values. Materials come from the actual consumption ledger.')}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={calculate.isPending} type="submit" variant="outline">{L('معاينة الحساب', 'Preview cost')}</Button>{c.canManage && <Button type="button" disabled={calculate.isPending || !confirmed} onClick={() => calculate.mutate(true)}>{L('تثبيت تكلفة الموعد', 'Finalize appointment cost')}</Button>}</div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{L('راجعت الوقت والاستخدام الفعلي وأسعار التكلفة؛ أعتمد الحساب النهائي.', 'I reviewed actual time, usage and cost rates, and confirm the final calculation.')}</label>
      <Link href={`/appointments/${id}`} className="inline-block text-sm underline">{L('تفاصيل الموعد وتسجيل المواد', 'Appointment details and material consumption')}</Link>
    </form>}
    {q.data && <Breakdown data={q.data.breakdown}/>}
  </div>;
}

export default function EquipmentMaterialsPage() {
  const { user } = useAuth(), L = useCopy();
  const allowed = user?.role === 'manager' && ['inventory', 'services', 'employees', 'rooms', 'settings'].every(area => can(user, `${area}.read`));
  const [branch, setBranch] = useState(0), [tab, setTab] = useState('equipment'), [editing, setEditing] = useState<CostEquipment | 'new' | null>(null);
  const q = useQuery({ queryKey: ['costing', 'catalog'], enabled: allowed, queryFn: () => api<CostCatalog>('/clinic/costing/catalog') });
  const c = q.data, branchId = branch || c?.branches[0]?.id || 0;
  if (!allowed) return <p role="alert">{L('هذا القسم للمدير بصلاحيات إدارة العيادة.', 'This section requires clinic manager access.')}</p>;
  return <div className="space-y-6" data-testid="equipment-materials-page"><Link className="text-sm underline" href="/home">{L('الرئيسية', 'Home')}</Link><PageHeader title={L('المعدات والماتيريال', 'Equipment & Materials')} description={L('اربط موارد العيادة بالخدمات واعرف تكلفة كل جلسة.', 'Connect clinic resources to services and calculate each session cost.')}/>
    <CostError error={q.error}/>{q.isPending && <p role="status">{L('جارٍ تحميل الموارد…', 'Loading resources…')}</p>}
    {c && <><div className="flex flex-wrap items-end justify-between gap-4"><Field label={L('الفرع', 'Branch')}><select className={inputClass} value={branchId || ''} onChange={e => { setBranch(Number(e.target.value)); setEditing(null); }}>{c.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><div className="flex flex-wrap gap-2" role="group" aria-label={L('أقسام التكلفة', 'Cost sections')}>{[['equipment', L('المعدات', 'Equipment')], ['rates', L('الماتيريال وتكلفة الموارد', 'Materials & resource rates')], ['services', L('ربط الخدمات وحساب الكوست', 'Service recipes & cost')], ['actual', L('التكلفة الفعلية للمواعيد', 'Actual appointment cost')]].map(([key, label]) => <Button key={key} variant={tab === key ? 'default' : 'outline'} aria-pressed={tab === key} onClick={() => { setTab(key!); setEditing(null); }} data-testid={`cost-tab-${key}`}>{label}</Button>)}</div></div>
    {!branchId ? <div className={panelClass}><p>{L('أضف فرعًا أولًا لربط المعدات والماتيريال.', 'Add a branch to connect equipment and materials.')}</p><Link href="/business/settings" className="mt-3 inline-block underline">{L('إضافة فرع', 'Add branch')}</Link></div> : <>
      {tab === 'equipment' && <>{c.canManage && !editing && <Button onClick={() => setEditing('new')} data-testid="cost-add-equipment"><Plus className="me-2 size-4"/>{L('إضافة معدة', 'Add equipment')}</Button>}{editing && <EquipmentForm key={editing === 'new' ? 'new' : editing.id} catalog={c} item={editing === 'new' ? undefined : editing} branchId={branchId} close={() => setEditing(null)}/>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{c.equipment.filter(e => e.branchId === branchId).map(e => <article key={e.id} className={panelClass + ' space-y-3'}><div className="flex items-center justify-between gap-3"><Wrench className="size-7 text-primary"/>{c.canManage && <Button variant="ghost" aria-label={L('تعديل المعدة', 'Edit equipment')} onClick={() => setEditing(e)}><Pencil className="size-4"/></Button>}</div><h2 className="text-lg font-bold">{e.name}</h2><p className="text-sm text-slate-500">{e.roomId ? c.rooms.find(r => r.id === e.roomId)?.name : L('متنقلة داخل الفرع', 'Mobile within branch')} · {e.isActive ? L('نشطة', 'Active') : L('غير نشطة', 'Inactive')}</p><p className="text-sm">{L('سعر الشراء: ', 'Purchase: ')}<Amount value={e.purchaseCost}/></p><p className="text-sm">{L('العمر المتوقع: ', 'Expected life: ')}{e.lifetimeUses} {L('استخدام', 'uses')}</p><div className="flex flex-wrap gap-1">{e.employeeIds.map(id => <span key={id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{c.employees.find(v => v.id === id)?.name}</span>)}</div></article>)}</div>{!c.equipment.some(e => e.branchId === branchId) && !editing && <div className={panelClass + ' text-center text-slate-500'}><Boxes className="mx-auto mb-3 size-8"/>{L('أضف أول معدة واربطها بالغرفة والموظفين.', 'Add your first asset and connect its room and operators.')}</div>}</>}
      {tab === 'rates' && <><div className="grid items-start gap-5 xl:grid-cols-3">{(['materials', 'employees', 'rooms'] as const).map(kind => <section key={kind} className={panelClass}><h2 className="mb-3 font-bold">{kind === 'materials' ? L('الماتيريال', 'Materials') : kind === 'employees' ? L('تكلفة الموظفين', 'Employee costs') : L('تكلفة الغرف', 'Room costs')}</h2><p className="mb-3 text-xs leading-6 text-slate-500">{kind === 'materials' ? L('سعر الوحدة الموجودة في المخزون، شامل المصاريف المرتبطة بشرائها.', 'Cost per stock unit, including associated purchase costs.') : kind === 'employees' ? L('تكلفة الساعة = إجمالي تكلفة الموظف ÷ ساعات العمل المنتجة. أدخل سعر الساعة.', 'Hourly cost = total employee expense ÷ productive work hours. Enter the hourly rate.') : L('تكلفة الساعة = مصاريف الغرفة ÷ ساعات التشغيل المنتجة. أدخل سعر الساعة.', 'Hourly cost = room expenses ÷ productive operating hours. Enter the hourly rate.')}</p>{c[kind].filter(r => !r.branchId || r.branchId === branchId).map(r => <RateRow key={r.id} kind={kind} id={r.id} name={r.name} unit={'unit' in r ? r.unit : L('ساعة', 'hour')} value={'unitCost' in r ? r.unitCost : r.hourlyCost} disabled={!c.canManage}/>)}<Link className="mt-3 inline-block text-sm underline" href={kind === 'materials' ? '/business/inventory' : kind === 'employees' ? '/people/employees' : '/business/rooms'}>{L('إضافة وإدارة السجلات', 'Add and manage records')}</Link></section>)}</div></>}
      {tab === 'services' && <ServiceCosting key={branchId} catalog={c} branchId={branchId}/>}
      {tab === 'actual' && <ActualCosting key={branchId} catalog={c} branchId={branchId}/>}
    </>}
    </>}
  </div>;
}
