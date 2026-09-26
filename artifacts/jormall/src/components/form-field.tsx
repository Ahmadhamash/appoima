import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  trailing?: ReactNode;
  testId?: string;
};

/** Input with a visible label, optional hint, and an accessible inline error. */
export function FormField({ label, hint, error, optional, trailing, className, testId, ...input }: Props) {
  const id = useId();
  const { t } = useI18n();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional && <span className="text-xs text-muted-foreground">{t('common.optional')}</span>}
      </div>
      <div className="relative">
        <Input
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          data-testid={testId}
          className={cn(trailing && 'pe-10')}
          {...input}
        />
        {trailing}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: Omit<Props, 'type' | 'trailing'>) {
  const [show, setShow] = useState(false);
  const { t } = useI18n();
  return (
    <FormField
      {...props}
      type={show ? 'text' : 'password'}
      className={props.className}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('common.hidePassword') : t('common.showPassword')}
          aria-pressed={show}
          className="focus-ring absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      }
    />
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}
