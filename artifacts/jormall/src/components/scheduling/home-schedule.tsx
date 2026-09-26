import { WaitingHome } from '@/components/operations/waiting-home';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type SessionUser } from '@/lib/api';
import { can } from '@/lib/setup-api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { EnteredName } from '@/components/setup/controls';
import { AppointmentList } from './appointment-list';
import { formatAppointmentTime, type AppointmentSummary } from '@/lib/scheduling-api';
import {useManagerBranch} from '@/lib/manager-branch';
export function HomeSchedule({user}: {user:SessionUser}) {
  const {selectedBranchId}=useManagerBranch();
  const {t,lang}=useI18n(),errorMessage=useErrorMessage(),provider=user.role==='doctor'||user.role==='service_provider';
  const enabled=provider||can(user,'appointments.read');
  const q=useQuery({queryKey:['scheduling','home',user.id,selectedBranchId],queryFn:()=>api<{items:AppointmentSummary[];total:number;next:AppointmentSummary|null;ownOnly:boolean}>(`/clinic/scheduling/home${selectedBranchId?`?branchId=${selectedBranchId}`:''}`),enabled,refetchInterval:30000,refetchOnWindowFocus:true});
  if(!enabled)return <p className="rounded-lg border p-4 text-sm text-muted-foreground">{t('p3.accessDenied')}</p>;
  return <section className="mt-5 space-y-4" data-testid="role-home-schedule">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t(provider?'p3.ownToday':'p3.today')}</h2>{can(user,'appointments.manage')&&<Link href="/appointments/new" className="focus-ring inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" data-testid="home-create-appointment">{t('p3.create')}</Link>}</div>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<div className="space-y-3"><FormError message={errorMessage(q.error)}/><Button variant="outline" onClick={()=>void q.refetch()} data-testid="retry-home-schedule">{t('common.retry')}</Button></div>:q.data&&<>
      {provider&&<div className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="next-customer"><h3 className="text-sm font-semibold">{t('p3.nextCustomer')}</h3>{q.data.next?<><p className="mt-2 text-lg font-semibold"><EnteredName item={q.data.next.customer}/></p><p className="mt-1 text-sm"><EnteredName item={q.data.next.service}/> · {formatAppointmentTime(q.data.next.startsAt,q.data.next.branch.timeZone,lang,true)}</p><Link href={`/appointments/${q.data.next.id}`} className="focus-ring mt-3 inline-block rounded text-sm font-medium underline" data-testid="open-next-customer">{t('p3.open')}</Link></>:<p className="mt-2 text-sm">{t('p3.noNext')}</p>}</div>}
      <p className="text-xs text-muted-foreground">{t('p3.branchTimes')}</p><AppointmentList items={q.data.items}/>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-muted-foreground">{t('p3.showing',{shown:q.data.items.length,total:q.data.total})}</span><Link href="/appointments/view" className="focus-ring rounded font-medium underline" data-testid="home-view-appointments">{t('p3.view')}</Link></div>
    </>}
    <WaitingHome/>
  </section>;
}
