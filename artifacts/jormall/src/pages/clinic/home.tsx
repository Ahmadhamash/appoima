import { WorkspaceHome } from '@/components/workspace/workspace-home';
import { HomeSchedule } from '@/components/scheduling/home-schedule';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CalendarDays, Check, Circle, ClipboardList, Clock, Stethoscope, Sparkles, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type MyClinic, type SessionUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDateFormat, useErrorMessage, useI18n } from '@/lib/i18n';
import { can } from '@/lib/setup-api';
import { EnteredName } from '@/components/setup/controls';
import { cn } from '@/lib/utils';

export function useMyClinic() {
  return useQuery({
    queryKey: ['me', 'clinic'],
    queryFn: () => api<{ clinic: MyClinic }>('/me/clinic'),
    staleTime: 30_000,
  });
}

function Greeting({ user, clinic }: { user: SessionUser; clinic?: MyClinic }) {
  const { t } = useI18n();
  const fmt = useDateFormat();
  return (
    <div className="mb-6">
      <p className="text-sm text-muted-foreground">{t('home.todayIs', { date: fmt.long(new Date()) })}</p>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
        {t('home.greeting', { name: '\uFFF0' }).split('\uFFF0').map((part, index) => <span key={index}>{index > 0 && <EnteredName item={user}/>} {part}</span>)}
      </h1>
      {clinic && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t('home.yourClinic')}: <span className="font-medium text-foreground" lang={clinic.nameLang} dir={clinic.nameLang === 'ar' ? 'rtl' : 'ltr'}>{clinic.name}</span>
        </p>
      )}
    </div>
  );
}

/** One clear next step. Later phases wire the primary action to real screens. */
function ManagerHome({ user }: { user: SessionUser }) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const q = useMyClinic();
  const progress = q.data?.clinic.progress;
  const steps = [
    { key: 'hours', done: progress?.hasBranchHours ?? false, href: '/business/settings', permission: 'settings.manage' },
    { key: 'catalog', done: progress?.hasCatalog ?? false, href: '/business/services', permission: 'services.manage' },
    { key: 'staff', done: progress?.hasStaff ?? false, href: '/people/employees', permission: 'employees.manage' },
    { key: 'booking', done: progress?.hasFirstAppointment ?? false, href: '/appointments/view', permission: 'appointments.read' },
  ];
  const current = steps.find((s) => !s.done)?.key;

  return (
    <>
      <WorkspaceHome />
      <Greeting user={user} clinic={q.data?.clinic} />
      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{errorMessage(q.error)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          {progress && !steps.every((s) => s.done) && <Card data-testid="card-checklist">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4 text-primary" aria-hidden />
                {t('manager.checklistTitle')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t('manager.checklistIntro')}</p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1">
                {steps.map((s, i) => {
                  const isCurrent = s.key === current;
                  return (
                    <li
                      key={s.key}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn('flex items-start gap-3 rounded-lg p-3', isCurrent && 'bg-primary/5 ring-1 ring-primary/20')}
                      data-testid={`checklist-${s.key}`}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                          s.done ? 'border-primary bg-primary text-primary-foreground' : isCurrent ? 'border-primary text-primary' : 'border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {s.done ? <Check className="size-3.5" /> : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-medium', s.done && 'text-muted-foreground line-through')}>{t(`manager.steps.${s.key}.title`)}</p>
                        <p className="text-sm text-muted-foreground">{t(`manager.steps.${s.key}.hint`)}</p>
                        {isCurrent && (s.href && can(user, s.permission) ? <Link href={s.href} className="focus-ring mt-2 inline-block rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" data-testid="continue-setup">{t('p2.startSetup')}</Link> : null)}
                      </div>
                      <span className="sr-only">{s.done ? t('common.done') : t('common.notYet')}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>}

          {progress && <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('manager.title')}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-2xl font-semibold tabular-nums">{progress?.branchCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{t('owner.columns.branches')}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-2xl font-semibold tabular-nums">{progress?.staffCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{t('owner.columns.staff')}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {can(user, 'appointments.read') && <Link href="/appointments" className="focus-ring inline-flex items-center gap-2 rounded font-medium text-foreground hover:underline">
                  <CalendarDays className="size-4 text-primary" aria-hidden />
                  {t('sections.appointments.view')}
                </Link>}
                <p className="mt-1">{t('sections.appointments.viewHint')}</p>
              </CardContent>
            </Card>
          </div>}
        </div>
      )}
      <HomeSchedule user={user}/>
    </>
  );
}

function SimpleHome({user}: {user:SessionUser; titleKey?:string; icon?:LucideIcon; nextStep?:boolean}) {
  const q=useMyClinic();
  return <><WorkspaceHome/><Greeting user={user} clinic={q.data?.clinic}/><HomeSchedule user={user}/></>;
}

export default function ClinicHomePage() {
  const { user } = useAuth();
  if (!user) return null;
  switch (user.home) {
    case 'manager':
      return <ManagerHome user={user} />;
    case 'secretary':
      return <SimpleHome user={user} titleKey="secretary" icon={CalendarDays} nextStep />;
    case 'doctor':
      return <SimpleHome user={user} titleKey="doctor" icon={Stethoscope} nextStep />;
    case 'provider':
      return <SimpleHome user={user} titleKey="provider" icon={Sparkles} nextStep />;
    default:
      return <SimpleHome user={user} titleKey="staff" icon={Clock} />;
  }
}

