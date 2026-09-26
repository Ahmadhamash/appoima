import { createDefinition } from '@workspace/service-definition';
import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form-field';
import { api } from '@/lib/api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { CATEGORIES, type Options } from '@/lib/setup-api';
import { CheckField, MultiPicker, SelectField, controlClass } from './controls';

type ServiceRow = { key: number; name: string; durationMinutes: string; price: string };
const freshRow = (key: number): ServiceRow => ({ key, name: '', durationMinutes: '30', price: '0' });

export function ServiceBatchForm({ options, sections, onSaved, onCancel }: { options: Options; sections: string[]; onSaved: (message: string) => void; onCancel: () => void }) {
  const { lang, t } = useI18n();
  const errorMessage = useErrorMessage();
  const sectionListId = useId();
  const ar = lang === 'ar';
  const [section, setSection] = useState('');
  const [rows, setRows] = useState<ServiceRow[]>([freshRow(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [currency, setCurrency] = useState('JOD');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('Other');
  const [requiresRoom, setRequiresRoom] = useState(false);
  const [employeeIds, setEmployeeIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (services: unknown[]) => api<{ ids: number[] }>('/clinic/services/batch', { method: 'POST', body: { services } }),
    onSuccess: () => onSaved(ar ? 'تمت إضافة الخدمات الفرعية' : 'Subservices added'),
    onError: err => setError(errorMessage(err)),
  });
  const update = (key: number, field: keyof Omit<ServiceRow, 'key'>, value: string) => {
    setRows(old => old.map(row => row.key === key ? { ...row, [field]: value } : row));
    setError('');
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const group = section.trim();
    const names = rows.map(row => row.name.trim());
    if (!group || group.length > 80) { setError(ar ? 'اكتب اسم الخدمة الرئيسية (حتى 80 حرفًا).' : 'Enter a main service name (up to 80 characters).'); return; }
    if (rows.some((row, index) => !names[index] || names[index]!.length > 120 || !Number.isInteger(Number(row.durationMinutes)) || Number(row.durationMinutes) < 1 || Number(row.durationMinutes) > 1440 || !/^\d{1,9}(\.\d{1,3})?$/.test(row.price.trim()))) {
      setError(ar ? 'راجع اسم كل خدمة فرعية ومدتها وسعرها.' : 'Check each subservice name, duration, and price.'); return;
    }
    if (new Set(names.map(name => name.toLocaleLowerCase())).size !== names.length) { setError(ar ? 'أسماء الخدمات الفرعية لازم تكون مختلفة.' : 'Subservice names must be unique.'); return; }
    const services = rows.map((row, index) => ({
      name: names[index], nameLang: lang, branchId,
      definition: { ...createDefinition('custom', lang), section: group, medicalScope: 'medical' as const },
      durationMinutes: Number(row.durationMinutes), price: row.price.trim(), currency, category,
      isActive: true, requiresRoom, employeeIds,
    }));
    setError('');
    mutation.mutate(services);
  }
  return <form onSubmit={submit} noValidate className="space-y-5" data-testid="form-service-batch">
    <FormError message={error}/>
    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-5">
      <div className="rounded-2xl border border-[#eadfca] bg-[#fffbf4] p-4">
        <label htmlFor="service-main-name" className="mb-2 block text-sm font-semibold text-[#1b2d48]">{ar ? 'الخدمة الرئيسية' : 'Main service'} <span aria-hidden>*</span></label>
        <input id="service-main-name" list={sectionListId} value={section} onChange={event => { setSection(event.target.value); setError(''); }} placeholder={ar ? 'مثال: الليزر' : 'For example: Laser'} maxLength={80} className={`${controlClass} rounded-xl bg-white`} data-testid="service-main-name" dir="auto"/>
        <datalist id={sectionListId}>{sections.map(name => <option key={name} value={name}/>)}</datalist>
        <p className="mt-2 text-xs text-[#786f62]">{ar ? 'اكتب اسم قسم جديد أو اختر قسمًا موجودًا لتظهر تحته الخدمات الفرعية.' : 'Enter a new section or choose an existing one for these subservices.'}</p>
      </div>
      <section className="space-y-3" aria-labelledby="subservices-heading">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="subservices-heading" className="font-bold text-[#1b2d48]">{ar ? 'الخدمات الفرعية' : 'Subservices'}</h3><p className="text-xs text-[#718098]">{ar ? 'كل خدمة تظهر كخيار مستقل عند الحجز.' : 'Each one appears as a separate booking option.'}</p></div><Button type="button" variant="outline" disabled={rows.length >= 20} onClick={() => { setRows(old => [...old, freshRow(nextKey)]); setNextKey(nextKey + 1); }} data-testid="add-subservice" className="border-[#bea36d] text-[#80632d]"><Plus className="me-1 size-4"/>{ar ? 'إضافة خدمة فرعية' : 'Add subservice'}</Button></div>
        {rows.map((row, index) => <div key={row.key} className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm" data-testid={`subservice-row-${index}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><strong className="text-sm text-[#1b2d48]">{ar ? `خدمة فرعية ${index + 1}` : `Subservice ${index + 1}`}</strong>{rows.length > 1 && <button type="button" onClick={() => setRows(old => old.filter(item => item.key !== row.key))} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#a34b4b] hover:bg-[#fff1f1]" aria-label={ar ? `حذف الخدمة الفرعية ${index + 1}` : `Remove subservice ${index + 1}`}><Trash2 className="size-4"/>{ar ? 'حذف' : 'Remove'}</button>}</div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
            <label className="block min-w-0 text-sm font-medium">{ar ? 'اسم الخدمة' : 'Service name'} *<input value={row.name} onChange={event => update(row.key, 'name', event.target.value)} placeholder={ar ? 'مثال: ليزر رجالي للوجه' : 'For example: Men’s facial laser'} maxLength={120} className={`${controlClass} mt-1.5 rounded-xl`} data-testid={`subservice-name-${index}`} dir="auto"/></label>
            <label className="block min-w-0 text-sm font-medium">{ar ? 'المدة (دقيقة)' : 'Duration (min)'} *<input type="number" min={1} max={1440} value={row.durationMinutes} onChange={event => update(row.key, 'durationMinutes', event.target.value)} className={`${controlClass} mt-1.5 rounded-xl`} data-testid={`subservice-duration-${index}`} dir="ltr"/></label>
            <label className="block min-w-0 text-sm font-medium">{ar ? `السعر (${currency})` : `Price (${currency})`} *<input type="text" inputMode="decimal" value={row.price} onChange={event => update(row.key, 'price', event.target.value)} className={`${controlClass} mt-1.5 rounded-xl`} data-testid={`subservice-price-${index}`} dir="ltr"/></label>
          </div>
        </div>)}
      </section>
      <details className="rounded-2xl border border-[#e2e8f0] bg-white p-4"><summary className="focus-ring cursor-pointer text-sm font-semibold text-[#1b2d48]">{ar ? 'إعدادات القسم والخدمات' : 'Section and service settings'}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField label={ar ? 'الفرع' : 'Branch'} value={branchId ?? ''} onChange={value => setBranchId(value ? Number(value) : null)} testId="service-batch-branch"><option value="">{ar ? 'كل الفروع' : 'All branches'}</option>{options.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField><SelectField label={ar ? 'العملة' : 'Currency'} value={currency} onChange={setCurrency} testId="service-batch-currency">{[...new Set(['JOD', ...options.currencies])].map(value => <option key={value} value={value}>{value}</option>)}</SelectField><SelectField label={ar ? 'التصنيف' : 'Category'} value={category} onChange={value => setCategory(value as typeof category)} testId="service-batch-category">{CATEGORIES.map(value => <option key={value} value={value}>{t(`p2.categories.${value}`)}</option>)}</SelectField><CheckField label={ar ? 'تحتاج غرفة عند الحجز' : 'Requires a room for booking'} checked={requiresRoom} onChange={setRequiresRoom} testId="service-batch-requires-room"/></div><div className="mt-4"><MultiPicker label={ar ? 'الموظفون الذين يقدمون هذه الخدمات' : 'Staff who provide these services'} options={options.employees.filter(employee => branchId === null || employee.branchId == null || employee.branchId === branchId)} selected={employeeIds} onChange={setEmployeeIds} testId="service-batch-employee"/><p className="mt-2 text-xs text-[#718098]">{ar ? 'يمكنك ربط الموظفين لاحقًا من صفحة الموظفين.' : 'You can assign staff later from the employees page.'}</p></div></details>
    </fieldset>
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white py-3"><Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>{t('common.cancel')}</Button><Button type="submit" disabled={mutation.isPending} className="bg-[#80632d] text-white hover:bg-[#6c5225]" data-testid="save-service-batch">{mutation.isPending ? t('common.loading') : ar ? `حفظ ${rows.length} خدمة فرعية` : `Save ${rows.length} subservice${rows.length === 1 ? '' : 's'}`}</Button></div>
  </form>;
}
