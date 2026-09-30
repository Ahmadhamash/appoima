import { Link } from 'wouter';
import { EnteredName } from '@/components/setup/controls';
import { useI18n } from '@/lib/i18n';
import { formatAppointmentTime, type AppointmentSummary } from '@/lib/scheduling-api';

type Staff = { id: number; name: string; nameLang: 'ar' | 'en' };
const colors = [
  'border-[#b9e9d1] bg-[#eafff2]',
  'border-[#bcd9fa] bg-[#ebf5ff]',
  'border-[#f6d3dc] bg-[#fff0f4]',
  'border-[#eed7b7] bg-[#fff8ed]',
  'border-[#d8cdfc] bg-[#f4f0ff]',
];
export function DayBoard({ items, staff = [], compact = false }: { items: AppointmentSummary[]; staff?: Staff[]; compact?: boolean }) {
  const { t, lang } = useI18n(), ar = lang === 'ar';
  const employees = Array.from(new Map([...staff, ...items.map(item => item.employee)].map(item => [item.id, item])).values()).slice(0, 6);
  const zone = items[0]?.branch.timeZone ?? 'Asia/Amman';
  const minutes = (instant: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant)).split(':').map(Number);
    return parts[0]! * 60 + parts[1]!;
  };
  const firstHour = Math.min(9, ...items.map(item => Math.floor(minutes(item.startsAt) / 60)));
  const lastHour = Math.max(17, ...items.map(item => Math.ceil(minutes(item.endsAt) / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const height = hours.length * 64;
  const tone = (item: AppointmentSummary, index: number) => item.status === 'cancelled' ? 'border-[#f6c7d4] bg-[#fff0f4]' : item.status === 'completed' ? 'border-[#b9e9d1] bg-[#eafff2]' : item.status === 'confirmed' ? 'border-[#bcd9fa] bg-[#ebf5ff]' : colors[index % colors.length]!;
  return <section className="overflow-hidden rounded-2xl border border-[#e0e6ef] bg-white shadow-sm" data-testid="appointment-day-board">
    {!compact && <div className="flex items-center justify-between border-b border-[#e9edf3] px-5 py-4"><h2 className="font-bold text-[#1b2d48]">{ar ? 'جدول المواعيد اليومي' : 'Daily schedule'}</h2><span className="text-xs text-[#8491a2]">{items.length} {ar ? 'موعد' : 'appointments'}</span></div>}
    <div className="overflow-x-auto">
      <div style={{ display: 'grid', gridTemplateColumns: `76px repeat(${Math.max(1, employees.length)}, minmax(170px, 1fr))`, minWidth: Math.max(650, employees.length * 175 + 76) }}>
        <div className="grid h-16 place-items-center border-b border-e border-[#e8edf3] text-xs font-semibold">{t('p3.time')}</div>
        {employees.map((employee, index) => <div key={employee.id} className="flex h-16 items-center justify-center gap-2 border-b border-e border-[#e8edf3] px-2 text-center text-sm font-semibold"><span className={'grid size-8 shrink-0 place-items-center rounded-full text-[#1b2d48] ' + colors[index % colors.length]!.split(' ')[1]}>{employee.name.slice(0, 1)}</span><EnteredName item={employee}/></div>)}
        <div className="border-e border-[#e8edf3]" style={{ height }}>{hours.map(hour => <div key={hour} className="h-16 border-b border-[#e8edf3] px-2 pt-1 text-center text-xs text-[#56687e]" dir="ltr">{String(hour).padStart(2, '0')}:00</div>)}</div>
        {employees.map((employee, employeeIndex) => <div key={employee.id} className="relative border-e border-[#e8edf3]" style={{ height, backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 63px, #e8edf3 63px, #e8edf3 64px)' }}>
          {items.filter(item => item.employee.id === employee.id).map(item => {
            const start = minutes(item.startsAt), end = minutes(item.endsAt);
            const top = Math.max(0, (start - firstHour * 60) * 64 / 60);
            const cardHeight = Math.max(40, (end - start) * 64 / 60 - 4);
            return <Link key={item.id} href={'/appointments/' + item.id} data-testid={'appointment-row-' + item.id} className={'focus-ring absolute inset-x-1.5 z-[1] overflow-hidden rounded-lg border px-2 py-1.5 text-start text-xs hover:shadow-md ' + tone(item, employeeIndex)} style={{ top, height: cardHeight }}>
              <strong className="block truncate text-[#21334f]"><EnteredName item={item.customer}/></strong>
              <span className="block truncate text-[#536881]"><EnteredName item={item.service}/></span>
              <span className="block text-[11px] font-medium text-primary" dir="ltr">{formatAppointmentTime(item.startsAt, zone, lang)} – {formatAppointmentTime(item.endsAt, zone, lang)}</span>
            </Link>;
          })}
        </div>)}
      </div>
    </div>
    {!items.length && <p className="border-t border-[#e8edf3] p-4 text-center text-xs text-[#8491a2]" data-testid="appointments-empty">{t('p3.noAppointments')}</p>}
  </section>;
}
