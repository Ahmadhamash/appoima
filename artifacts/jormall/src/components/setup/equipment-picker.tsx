import { useState } from 'react';
import { Button } from '@/components/ui/button';

export const COMMON_EQUIPMENT = [
  ['Laser Device', 'جهاز ليزر'],
  ['HydraFacial Machine', 'جهاز هايدرافيشل'],
  ['Injection Kit', 'أدوات حقن'],
  ['Skin Analysis Device', 'جهاز تحليل البشرة'],
  ['Cryotherapy', 'جهاز تبريد'],
] as const;

export function EquipmentPicker({ value, onChange, lang, suggestions = [] }: {
  value: string[]; onChange: (value: string[]) => void; lang: 'ar' | 'en'; suggestions?: string[];
}) {
  const [custom, setCustom] = useState('');
  const choices = [...new Set([...COMMON_EQUIPMENT.map(([name]) => name), ...suggestions])];
  const label = (name: string) => lang === 'ar' ? COMMON_EQUIPMENT.find(([item]) => item === name)?.[1] ?? name : name;
  const add = (name: string) => {
    const clean = name.trim();
    if (!clean || clean.length > 80 || value.some(item => item.toLocaleLowerCase() === clean.toLocaleLowerCase()) || value.length >= 40) return;
    onChange([...value, clean]);
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{choices.map(name => <button key={name} type="button" aria-pressed={value.includes(name)} onClick={() => value.includes(name) ? onChange(value.filter(item => item !== name)) : add(name)} className={`rounded-xl border px-3 py-2 text-sm transition-colors ${value.includes(name) ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:border-primary/50'}`}>{value.includes(name) ? '✓ ' : '+ '}{label(name)}</button>)}</div>
    <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm" value={custom} maxLength={80} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(custom); setCustom(''); } }} placeholder={lang === 'ar' ? 'أضف معدة أخرى' : 'Add other equipment'} aria-label={lang === 'ar' ? 'معدة أخرى' : 'Other equipment'}/><Button type="button" variant="outline" onClick={() => { add(custom); setCustom(''); }}>{lang === 'ar' ? 'إضافة' : 'Add'}</Button></div>
    {value.length > 0 && <div className="flex flex-wrap gap-2">{value.map(name => <button key={name} type="button" onClick={() => onChange(value.filter(item => item !== name))} className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary" aria-label={`${lang === 'ar' ? 'إزالة' : 'Remove'} ${name}`}>{label(name)} ×</button>)}</div>}
  </div>;
}
