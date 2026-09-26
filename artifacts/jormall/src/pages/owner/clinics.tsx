import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type ClinicOverview } from '@/lib/api';
import { useErrorMessage, useI18n } from '@/lib/i18n';
import { CreateClinicDialog } from './clinic-form-dialog';
import { cn } from '@/lib/utils';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function setupSummary(c: ClinicOverview) {
  const steps = [c.progress.hasManager, c.progress.hasBranch, c.progress.staffCount > 1];
  const done = steps.filter(Boolean).length;
  return { done, total: steps.length, ready: done === steps.length };
}

export function ClinicStatusBadge({ status }: { status: ClinicOverview['status'] }) {
  const { t } = useI18n();
  return (
    <Badge variant={status === 'active' ? 'default' : 'secondary'} className={cn(status === 'active' && 'bg-primary/15 text-primary border-primary/20')}>
      {status === 'active' ? t('common.active') : t('common.inactive')}
    </Badge>
  );
}

export function SetupBadge({ clinic }: { clinic: ClinicOverview }) {
  const { t } = useI18n();
  const s = setupSummary(clinic);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', s.ready ? 'text-primary' : 'text-accent-foreground')}>
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: s.total }).map((_, i) => (
          <span key={i} className={cn('h-1.5 w-3 rounded-full', i < s.done ? (s.ready ? 'bg-primary' : 'bg-accent-foreground/70') : 'bg-muted-foreground/25')} />
        ))}
      </span>
      {s.ready ? t('owner.setupReady') : `${t('owner.setupPending')} · ${s.done}/${s.total}`}
    </span>
  );
}

export default function ClinicsPage() {
  const { t, lang } = useI18n();
  const errorMessage = useErrorMessage();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ['clinics', debounced],
    queryFn: () => api<{ clinics: ClinicOverview[] }>(`/clinics${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}`),
  });

  const clinics = query.data?.clinics ?? [];
  const isEmptyPlatform = !query.isLoading && !debounced && clinics.length === 0;

  return (
    <>
      <PageHeader
        title={t('owner.title')}
        description={t('owner.intro')}
        action={
          !isEmptyPlatform && (
            <Button onClick={() => setOpen(true)} data-testid="button-add-clinic">
              <Plus className="size-4" aria-hidden />
              {t('owner.addClinic')}
            </Button>
          )
        }
      />

      {isEmptyPlatform ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center sm:p-12">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-6" aria-hidden />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('home.nextStep')}</p>
          <h2 className="mt-1 text-lg font-semibold">{t('owner.firstStep')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t('owner.firstStepHint')}</p>
          <Button className="mt-5" onClick={() => setOpen(true)} data-testid="button-add-clinic">
            <Plus className="size-4" aria-hidden />
            {t('owner.addClinic')}
          </Button>
        </div>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('owner.searchPlaceholder')}
              aria-label={t('owner.searchPlaceholder')}
              className="ps-9"
              data-testid="input-search"
            />
          </div>

          {query.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {errorMessage(query.error)}
              <Button variant="outline" size="sm" className="ms-3" onClick={() => query.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : clinics.length === 0 ? (
            <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t('owner.noResults')}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              {/* Desktop table */}
              <table className="hidden w-full text-sm md:table">
                <thead className="bg-muted/50 text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">{t('owner.columns.name')}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">{t('owner.columns.manager')}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">{t('owner.columns.branches')}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">{t('owner.columns.status')}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium">{t('owner.columns.setup')}</th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t hover:bg-muted/40 focus-within:bg-muted/40"
                      onClick={() => navigate(`/clinics/${c.id}`)}
                      data-testid={`row-clinic-${c.id}`}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/clinics/${c.id}`} className="focus-ring rounded font-medium" lang={c.nameLang} dir={c.nameLang === 'ar' ? 'rtl' : 'ltr'}>
                          {c.name}
                        </Link>
                        {c.nameLang !== lang && (
                          <span className="ms-2 text-xs text-muted-foreground">{t('common.enteredIn', { lang: t(c.nameLang === 'ar' ? 'common.arabic' : 'common.english') })}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.manager ? (
                          <div>
                            <div>{c.manager.name}</div>
                            <div className="text-xs text-muted-foreground" dir="ltr">{c.manager.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('owner.noManager')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{c.progress.branchCount}</td>
                      <td className="px-4 py-3"><ClinicStatusBadge status={c.status} /></td>
                      <td className="px-4 py-3"><SetupBadge clinic={c} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <ul className="divide-y md:hidden">
                {clinics.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clinics/${c.id}`} className="focus-ring block p-4 hover:bg-muted/40" data-testid={`card-clinic-${c.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium" lang={c.nameLang}>{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.manager ? c.manager.name : t('owner.noManager')}</p>
                        </div>
                        <ClinicStatusBadge status={c.status} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <SetupBadge clinic={c} />
                        <span>{t('owner.columns.branches')}: {c.progress.branchCount}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('owner.privacyNote')}
      </p>

      <CreateClinicDialog open={open} onOpenChange={setOpen} onCreated={(c) => navigate(`/clinics/${c.id}`)} />
    </>
  );
}
