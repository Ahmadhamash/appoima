import { WorkspaceHome, useClinicWorkspace } from '@/components/workspace/workspace-home';
import { workspaceName } from '@workspace/service-definition';
import { HomeSchedule } from '@/components/scheduling/home-schedule';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CalendarDays, Check, ClipboardList, Clock, Stethoscope, Sparkles, type LucideIcon } from 'lucide-react';
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
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

function Greeting({ user, clinic }: { user: SessionUser; clinic?: MyClinic }) {
  const { t, lang } = useI18n();
  const workspace = useClinicWorkspace();
  const clinicName = workspace.data?.profile ? workspaceName(workspace.data.profile, lang) : clinic?.name;
  const fmt = useDateFormat();
  return (
    <div className="mb-6">
      <p className="text-sm text-muted-foreground">{t('home.todayIs', { date: fmt.long(new Date()) })}</p>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
        {t('home.greeting', { name: '\uFFF0' }).split('\uFFF0').map((part, index) => <span key={index}>{index > 0 && <EnteredName item={user}/>} {part}</span>)}
      </h1>
      {clinicName && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t('home.yourClinic')}: <span className="font-medium text-foreground" dir="auto">{clinicName}</span>
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
    { key: 'booking', done: progress?.hasFirstAppointment ?? false, href: '/appointments/new', permission: 'appointments.manage' },
  ];
  const current = steps.find((s) => !s.done)?.key;
  const completeCount=steps.filter(s=>s.done).length;

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
          {progress && !steps.every((s) => s.done) && <Card data-testid="card-checklist" className="overflow-hidden rounded-2xl border-primary/15 shadow-sm">
            <CardHeader className="space-y-3 bg-primary/[0.035] pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardList className="size-5 text-primary" aria-hidden />
                    {t('manager.checklistTitle')}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{t('manager.checklistIntro')}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary" data-testid="checklist-progress-label">{t('manager.checklistProgress',{done:completeCount,total:steps.length})}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-valuenow={completeCount} aria-valuemin={0} aria-valuemax={steps.length} aria-label={t('manager.checklistTitle')}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{width:`${completeCount/steps.length*100}%`}}/>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <ol className="grid gap-3 sm:grid-cols-2">
                {steps.map((s, i) => {
                  const isCurrent = s.key === current;
                  return (
                    <li
                      key={s.key}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn('flex min-h-36 items-start gap-3 rounded-xl border p-4',isCurrent?'border-primary/40 bg-primary/[0.06] shadow-sm':s.done?'border-primary/15 bg-primary/[0.025]':'border-border bg-card')}
                      data-testid={`checklist-${s.key}`}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold',
                          s.done ? 'border-primary bg-primary text-primary-foreground' : isCurrent ? 'border-primary bg-background text-primary' : 'border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {s.done ? <Check className="size-4" /> : i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col items-start">
                        <span className={cn('mb-1 text-xs font-semibold',isCurrent?'text-primary':'text-muted-foreground')}>{t(s.done?'manager.completedStep':isCurrent?'manager.currentStep':'manager.upcomingStep')}</span>
                        <p className="font-semibold leading-snug">{t(`manager.steps.${s.key}.title`)}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`manager.steps.${s.key}.hint`)}</p>
                        {s.href && can(user, s.permission) && (s.done || isCurrent) && <Link href={s.href} data-setup-step="true" className={cn('focus-ring mt-3 inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-semibold',isCurrent?'bg-primary text-primary-foreground hover:bg-primary/90':'border border-primary/20 text-primary hover:bg-primary/5')} data-testid={isCurrent?'continue-setup':`open-setup-${s.key}`}>{t(isCurrent?`manager.steps.${s.key}.action`:'manager.openStep')}</Link>}
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
