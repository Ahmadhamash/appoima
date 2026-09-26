import { Link } from 'wouter';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-3 text-xl font-semibold" data-testid="text-page-title">
        {t('common.notFound')}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('common.notFoundHint')}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/">{t('common.goHome')}</Link>
      </Button>
    </div>
  );
}
