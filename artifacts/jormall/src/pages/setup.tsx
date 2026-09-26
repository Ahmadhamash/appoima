import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth-layout';
import { FormField, PasswordField, FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { api, type SessionUser } from '@/lib/api';
import { useAuth, homePath } from '@/lib/auth';
import { useErrorMessage, useI18n } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';

export default function SetupPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const { setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api<{ user: SessionUser }>('/setup', { method: 'POST', body }),
    onSuccess: ({ user }) => {
      setUser(user);
      toast({ title: t('setup.success') });
      navigate(homePath(user));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('errors.nameRequired');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t('errors.emailInvalid');
    if (form.password.length < 10) errs.password = t('errors.passwordTooShort');
    if (form.password !== form.confirm) errs.confirm = t('errors.passwordsDontMatch');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({ name: form.name.trim(), email: form.email.trim(), password: form.password });
  };

  return (
    <AuthLayout title={t('setup.title')} intro={t('setup.intro')}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormField
          label={t('setup.name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={fieldErrors.name}
          autoComplete="name"
          required
          testId="input-name"
        />
        <FormField
          label={t('setup.email')}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fieldErrors.email}
          autoComplete="email"
          dir="ltr"
          required
          testId="input-email"
        />
        <PasswordField
          label={t('setup.password')}
          hint={t('setup.passwordHint')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={fieldErrors.password}
          autoComplete="new-password"
          required
          testId="input-password"
        />
        <PasswordField
          label={t('setup.confirmPassword')}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          error={fieldErrors.confirm}
          autoComplete="new-password"
          required
          testId="input-confirm"
        />
        <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
        <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit">
          {t('setup.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
