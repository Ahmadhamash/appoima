import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className, tone = 'default' }: { className?: string; tone?: 'default' | 'sidebar' }) {
  const { lang, setLang, t } = useI18n();
  const base =
    tone === 'sidebar'
      ? 'border-sidebar-border text-sidebar-foreground'
      : 'border-border text-foreground';
  const activeCls = tone === 'sidebar' ? 'bg-sidebar-accent' : 'bg-secondary';
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn('inline-flex items-center gap-1 rounded-md border p-0.5 text-xs font-medium', base, className)}
    >
      <Languages className="mx-1 size-3.5 opacity-70" aria-hidden />
      {(['en', 'ar'] as const).map((l) => (
        <button
          key={l}
          type="button"
          data-setup-language="true"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn(
            'focus-ring rounded px-2 py-1 transition-colors hover-elevate',
            lang === l ? activeCls : 'opacity-70',
          )}
          data-testid={`button-lang-${l}`}
        >
          {l === 'en' ? 'EN' : 'ع'}
        </button>
      ))}
    </div>
  );
}
