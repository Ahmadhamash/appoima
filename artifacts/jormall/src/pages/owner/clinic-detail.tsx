import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Circle, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api, type ClinicOverview } from '@/lib/api';
import { useDateFormat, useErrorMessage, useI18n } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { AddManagerDialog } from './clinic-form-dialog';
import { ClinicStatusBadge, SetupBadge } from './clinics';
import { cn } from '@/lib/utils';

type Manager = { id: number; name: string; email: string; isActive: boolean; mustChangePassword: boolean };

export default function ClinicDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { t } = useI18n();
  const fmt = useDateFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const query = useQuery({
    queryKey: ['clinics', 'detail', id],
    queryFn: () => api<{ clinic: ClinicOverview; managers: Manager[] }>(`/clinics/${id}`),
    enabled: Number.isInteger(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'inactive') => api<{ clinic: ClinicOverview }>(`/clinics/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinics'] });
      toast({ title: t('owner.statusUpdated') });
    },
    onError: (err) => toast({ title: errorMessage(err), variant: 'destructive' }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {query.error ? errorMessage(query.error) : t('errors.clinic_not_found')}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/clinics">{t('owner.backToClinics')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { clinic, managers } = query.data;
  const steps = [
    { key: 'manager', done: clinic.progress.hasManager },
    { key: 'branch', done: clinic.progress.hasBranch },
    { key: 'staff', done: clinic.progress.staffCount > 1 },
  ];

  return (
    <>
      <Link href="/clinics" className="focus-ring mb-4 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground" data-testid="link-back">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t('owner.backToClinics')}
      </Link>
      <PageHeader
        eyebrow={t('owner.detailTitle')}
        title={clinic.name}
        description={`${t('owner.created_at')}: ${fmt.short(new Date(clinic.createdAt))}`}
        action={
          <div className="flex items-center gap-2">
            <ClinicStatusBadge status={clinic.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => (clinic.status === 'active' ? setConfirmOpen(true) : statusMutation.mutate('active'))}
              disabled={statusMutation.isPending}
              data-testid="button-toggle-status"
            >
              {clinic.status === 'active' ? t('owner.deactivate') : t('owner.activate')}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              {t('owner.columns.setup')}
              <SetupBadge clinic={clinic} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {steps.map((s) => (
                <li key={s.key} className="flex items-center gap-3 text-sm" data-testid={`step-${s.key}`}>
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full border',
                      s.done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 text-muted-foreground',
                    )}
                    aria-hidden
                  >
                    {s.done ? <Check className="size-3.5" /> : <Circle className="size-2 fill-current" />}
                  </span>
                  <span className={cn(!s.done && 'text-muted-foreground')}>{t(`owner.setupSteps.${s.key}`)}</span>
                  <span className="sr-only">{s.done ? t('common.done') : t('common.notYet')}</span>
                </li>
              ))}
            </ol>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('owner.columns.branches')}</dt>
                <dd className="font-medium tabular-nums">{clinic.progress.branchCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('owner.columns.staff')}</dt>
                <dd className="font-medium tabular-nums">{clinic.progress.staffCount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{t('owner.managers')}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-open-add-manager">
              <Plus className="size-4" aria-hidden />
              {t('owner.addManager')}
            </Button>
          </CardHeader>
          <CardContent>
            {managers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('owner.noManager')}</p>
            ) : (
              <ul className="divide-y">
                {managers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid={`manager-${m.id}`}>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground" dir="ltr">{m.email}</p>
                    </div>
                    <span className={cn('shrink-0 text-xs', m.mustChangePassword ? 'text-accent-foreground' : 'text-primary')}>
                      {m.mustChangePassword ? t('owner.firstLoginPending') : t('owner.firstLoginDone')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AddManagerDialog clinicId={id} open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>{t('owner.deactivate')}</AlertDialogTitle>
            <AlertDialogDescription>{t('owner.deactivateConfirm', { clinic: clinic.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => statusMutation.mutate('inactive')} data-testid="button-confirm-deactivate">
              {t('owner.deactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
