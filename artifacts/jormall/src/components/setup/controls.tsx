import { useEffect, useRef, useId, type ReactNode } from 'react';
import { createBranchHoursEditor } from '../weekly-schedule';
import { useI18n } from '@/lib/i18n';
import { DAYS, type Week, type Option } from '@/lib/setup-api';
export const controlClass = 'focus-ring block min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60';

export function SelectField({ label, value, onChange, children, testId, error, required = false }: { label: string; value: string | number; onChange: (v: string) => void; children: ReactNode; testId: string; error?: string; required?: boolean }) {
  const id = useId();
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}{required ? ' *' : ''}</label><select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={controlClass} data-testid={testId} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} required={required}>{children}</select>{error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
export function TextareaField({ label, value, onChange, testId, hint, maxLength = 5000 }: { label: string; value: string; onChange: (v: string) => void; testId: string; hint?: string; maxLength?: number }) {
  const id = useId();
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label><textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${controlClass} min-h-24`} data-testid={testId} maxLength={maxLength} aria-describedby={hint ? `${id}-hint` : undefined}/>{hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}</div>;
}
export function CheckField({ label, checked, onChange, testId, disabled = false }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId: string; disabled?: boolean }) {
  return <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="focus-ring size-4 shrink-0 accent-primary" disabled={disabled}/><span>{label}</span></label>;
}
export function EnteredName({ item }: { item: {name: string; nameLang: 'en' | 'ar'} }) {
  return <bdi lang={item.nameLang} dir={item.nameLang === 'ar' ? 'rtl' : 'ltr'} className="break-words">{item.name}</bdi>;
}
export function MultiPicker({ label, options, selected, onChange, testId }: { label: string; options: Option[]; selected: number[]; onChange: (ids: number[]) => void; testId: string }) {
  const { t } = useI18n();
  return <fieldset className="min-w-0 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">{label}</legend><p className="mb-2 text-xs text-muted-foreground">{t('p2.selectedCount', { count: selected.length })}</p><div className="max-h-48 overflow-y-auto">{options.length ? options.map((o) => <label key={o.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id))} data-testid={`${testId}-${o.id}`} className="focus-ring size-4 shrink-0 accent-primary"/><span><EnteredName item={o}/>{o.isActive === false && <span className="ms-2 text-xs text-muted-foreground">({t('p2.inactiveChoice')})</span>}</span></label>) : <p className="text-sm text-muted-foreground">{t('p2.noChoices')}</p>}</div></fieldset>;
}

export function RoomServicePicker({ options, selected, onChange }: { options: Option[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const groups = [...new Set(options.map(service => service.definition?.section || (ar ? 'خدمات أخرى' : 'Other services')))];
  return <fieldset className="min-w-0 space-y-3 rounded-2xl border border-[#e2e8f0] bg-[#fcfdff] p-4" data-testid="room-services-picker">
    <legend className="px-1 text-sm font-bold text-[#1b2d48]">{ar ? 'الخدمات التي يمكن تنفيذها في الغرفة' : 'Services available in this room'}</legend>
    <p className="text-xs text-[#718098]">{ar ? 'اختر الخدمات المناسبة لتجهيزات هذه الغرفة. تظهر عند الحجز للموظفين.' : 'Choose services this room is equipped for. Staff will see them when booking.'}</p>
    <p className="text-xs font-semibold text-primary">{ar ? `${selected.length} خدمة محددة` : `${selected.length} selected`}</p>
    {groups.length ? groups.map(group => <div key={group} className="rounded-xl border border-[#e8edf3] bg-white p-3"><h3 className="mb-2 text-sm font-semibold text-primary">{group}</h3><div className="grid gap-1 sm:grid-cols-2">{options.filter(service => (service.definition?.section || (ar ? 'خدمات أخرى' : 'Other services')) === group).map(service => <label key={service.id} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-[#fffaf2]"><input type="checkbox" checked={selected.includes(service.id)} onChange={event => onChange(event.target.checked ? [...selected, service.id] : selected.filter(id => id !== service.id))} data-testid={`service-choice-${service.id}`} className="focus-ring size-4 shrink-0 accent-primary"/><span><EnteredName item={service}/>{service.isActive === false && <span className="ms-1 text-xs text-[#8794a7]">({ar ? 'غير نشطة' : 'Inactive'})</span>}</span></label>)}</div></div>) : <p className="text-sm text-[#718098]">{ar ? 'أضف الخدمات أولًا، ثم اربطها بالغرفة.' : 'Add services first, then assign them to this room.'}</p>}
  </fieldset>;
}
export function HoursEditor({ label, value, onChange, testId, error, hint }: { label: string; value: Week; onChange: (v: Week) => void; testId: string; error?: string; hint?: string }) {
  const { lang } = useI18n();
  const host = useRef<HTMLDivElement>(null), widget = useRef<ReturnType<typeof createBranchHoursEditor> | null>(null);
  const callback = useRef(onChange), latest = useRef(value); callback.current = onChange; latest.current = value;
  useEffect(() => {
    const editor = createBranchHoursEditor(latest.current, { id: testId, language: lang, label, hint, manualBranch: true }, next => callback.current(next));
    widget.current = editor; host.current?.replaceChildren(editor.node);
    return () => { editor.node.remove(); widget.current = null; };
  }, [lang, label, hint, testId]);
  useEffect(() => widget.current?.setValue(value), [value]);
  return <div className="min-w-0 space-y-2"><div ref={host}/>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
export function HoursReadout({ value }: { value: Week }) {
  const { t } = useI18n();
  return <dl className="space-y-2 text-sm">{DAYS.map((day) => <div key={day} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{t(`p2.days.${day}`)}</dt><dd dir="ltr">{value[day].length ? value[day].map((r) => `${r.open}–${r.close}`).join(' / ') : t('p2.closed')}</dd></div>)}</dl>;
}
