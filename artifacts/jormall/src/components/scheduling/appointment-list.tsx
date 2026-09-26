import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnteredName } from '@/components/setup/controls';
import { useI18n } from '@/lib/i18n';
import { formatAppointmentTime, type AppointmentSummary } from '@/lib/scheduling-api';
export function AppointmentList({items}: {items:AppointmentSummary[]}) {
  const {t,lang}=useI18n();
  if(!items.length)return <p className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground" data-testid="appointments-empty">{t('p3.noAppointments')}</p>;
  return <div className="space-y-3" data-testid="appointment-list">{items.map((a)=><article key={a.id} className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto]" data-testid={`appointment-row-${a.id}`}>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('p3.time')}</p><p className="mt-1 text-sm font-semibold">{formatAppointmentTime(a.startsAt,a.branch.timeZone,lang,true)}</p><p className="text-xs text-muted-foreground">{formatAppointmentTime(a.endsAt,a.branch.timeZone,lang)} · <bdi>{a.branch.timeZone}</bdi></p><p className="mt-1 text-xs"><EnteredName item={a.branch}/></p></div>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('p3.customer')}</p><p className="mt-1 text-sm font-medium"><EnteredName item={a.customer}/></p></div>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('p3.service')}</p><p className="mt-1 text-sm"><EnteredName item={a.service}/></p></div>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('p3.employee')}</p><p className="mt-1 text-sm"><EnteredName item={a.employee}/></p></div>
    <div><p className="text-xs text-muted-foreground">{t('p3.status')}</p><Badge variant={a.status==='cancelled'?'outline':'secondary'} className="mt-1">{t(`p3.statuses.${a.status}`)}</Badge></div>
    <div className="flex flex-wrap items-center gap-2"><Link href={`/appointments/${a.id}`} className="focus-ring inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted" data-testid={`open-appointment-${a.id}`}>{a.nextActions?.[0]?t(`p3.actions.${a.nextActions[0]}`):t('p3.open')}</Link></div>
  </article>)}</div>;
}
export function Pagination({page,pageSize,total,onPage}: {page:number;pageSize:number;total:number;onPage:(page:number)=>void}) {
  const {t}=useI18n();
  return <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{t('p3.showing',{shown:Math.max(0,Math.min(pageSize,total-(page-1)*pageSize)),total})}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page===1} onClick={()=>onPage(page-1)} data-testid="appointments-prev">{t('common.previous')}</Button><Button type="button" variant="outline" size="sm" disabled={page*pageSize>=total} onClick={()=>onPage(page+1)} data-testid="appointments-next">{t('common.next')}</Button></div></div>;
}
