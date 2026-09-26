import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth-layout';
import { FormField, PasswordField, FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { api, type SessionUser } from '@/lib/api';
import { useAuth, homePath } from '@/lib/auth';
import { useErrorMessage, useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const { setUser } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<{ user: SessionUser }>('/auth/login', { method: 'POST', body }),
    onSuccess: ({ user }) => {
      setUser(user);
      navigate(user.mustChangePassword ? '/change-password' : homePath(user));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t('errors.emailInvalid');
    if (!form.password) errs.password = t('common.required');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({ email: form.email.trim(), password: form.password });
  };

  return (
    <AuthLayout title={t('login.title')} intro={t('login.intro')}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormField
          label={t('login.email')}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fieldErrors.email}
          autoComplete="username"
          dir="ltr"
          autoFocus
          required
          testId="input-email"
        />
        <PasswordField
          label={t('login.password')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={fieldErrors.password}
          autoComplete="current-password"
          required
          testId="input-password"
        />
        <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
        <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit">
          {mutation.isPending ? t('login.signingIn') : t('login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
