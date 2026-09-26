import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitcher } from './language-switcher';

export function AuthLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-lg font-bold">
            J
          </span>
          <span className="text-lg font-semibold">{t('app.name')}</span>
        </div>
        <div className="max-w-md space-y-4">
          <p className="text-3xl font-semibold leading-snug">{t('app.tagline')}</p>
          <div className="flex gap-2" aria-hidden>
            <span className="h-1.5 w-16 rounded-full bg-sidebar-primary" />
            <span className="h-1.5 w-8 rounded-full bg-accent" />
            <span className="h-1.5 w-4 rounded-full bg-sidebar-accent" />
          </div>
        </div>
        <p className="text-xs text-sidebar-foreground/60">© {new Date().getFullYear()} {t('app.name')}</p>
      </aside>
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
              J
            </span>
            <span className="font-semibold">{t('app.name')}</span>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
