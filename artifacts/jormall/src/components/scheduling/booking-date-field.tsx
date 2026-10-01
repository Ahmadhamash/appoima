import { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { arSA, enGB } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import type { Week } from '@/lib/setup-api';
import { bookingDateAllowed, branchToday, dateInputValue, nextBookingDate } from '@/lib/booking-date';

const localDate = (value: string) => new Date(`${value}T12:00:00`);

/** A calendar-only control: closed dates cannot be entered or selected by keyboard. */
export function BookingDateField({ value, onChange, openingHours, timeZone, testId = 'slot-date' }: { value: string; onChange: (value: string) => void; openingHours: Week | undefined; timeZone: string; testId?: string }) {
  const { t, lang, dir } = useI18n(), id = useId(), [open, setOpen] = useState(false);
  const allowed = (date: string) => bookingDateAllowed(date, openingHours, timeZone);
  const selected = value && allowed(value) ? localDate(value) : undefined;
  const first = nextBookingDate(openingHours, timeZone);
  return <div className="min-w-0 space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{t('p3.date')}</label><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button id={id} type="button" className="focus-ring flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm" data-testid={testId} aria-label={t('p3.date')} disabled={!first}><span>{selected ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(selected) : lang === 'ar' ? 'اختر التاريخ' : 'Select date'}</span><CalendarDays className="size-4 shrink-0" aria-hidden/></button></PopoverTrigger><PopoverContent align="start" className="w-auto max-w-[calc(100vw-24px)] p-0" dir={dir} data-testid={`${testId}-calendar`}><Calendar mode="single" autoFocus locale={lang === 'ar' ? arSA : enGB} selected={selected} defaultMonth={selected ?? localDate(first || branchToday(timeZone))} disabled={day => !allowed(dateInputValue(day))} onSelect={day => { if (!day) return; const date = dateInputValue(day); if (!allowed(date)) return; onChange(date); setOpen(false); }}/></PopoverContent></Popover></div>;
}
