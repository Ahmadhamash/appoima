import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/setup-api';
import { useI18n,useErrorMessage } from '@/lib/i18n';
import type { Page,WaitingEntry } from '@/lib/operations-api';
import { FormError } from '@/components/form-field';
import { EnteredName } from '@/components/setup/controls';
import {useManagerBranch} from '@/lib/manager-branch';
export function WaitingHome() {
  const {selectedBranchId}=useManagerBranch();
  const {user}=useAuth(),{t}=useI18n(),errorMessage=useErrorMessage(),allowed=can(user,'appointments.manage');
  const q=useQuery({queryKey:['operations','waiting-home',selectedBranchId],queryFn:()=>api<Page<WaitingEntry>>(`/clinic/waiting-list?status=offered&page=1&pageSize=5${selectedBranchId?`&branchId=${selectedBranchId}`:''}`),enabled:allowed,refetchInterval:30000});
  if(!allowed)return null;
  return <section className="mt-5 space-y-3 rounded-xl border bg-card p-4" data-testid="waiting-home"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{t('p4.offeredHome')}</h2><Link href="/appointments/waiting-list" className="focus-ring rounded text-sm underline" data-testid="home-waiting-list">{t('p4.waitingTitle')}</Link></div>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!q.data?.items.length?<p className="text-sm text-muted-foreground">{t('p4.noOffers')}</p>:<><div className="space-y-2">{q.data.items.map(entry=><div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><p className="font-medium"><EnteredName item={entry.customer}/></p><p className="text-muted-foreground"><EnteredName item={entry.service}/> · <EnteredName item={entry.branch}/></p></div><Link href={`/appointments/${entry.cancelledAppointmentId}`} className="focus-ring rounded underline" data-testid={`home-review-replacement-${entry.id}`}>{t('p4.reviewSuggestion')}</Link></div>)}</div><p className="text-xs text-muted-foreground">{t('p3.showing',{shown:q.data.items.length,total:q.data.total})}</p></>}
  </section>;
}
