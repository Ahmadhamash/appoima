import { useState, type FormEvent } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth-layout';
import { PasswordField, FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { api, type SessionUser } from '@/lib/api';
import { useAuth, homePath } from '@/lib/auth';
import { useErrorMessage, useI18n } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';

export default function ChangePasswordPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const { user, setUser, signOut } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api<{ user: SessionUser }>('/auth/change-password', { method: 'POST', body }),
    onSuccess: ({ user }) => {
      setUser(user);
      toast({ title: t('changePassword.success') });
      setDone(true);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.current) errs.current = t('common.required');
    if (form.next.length < 10) errs.next = t('errors.passwordTooShort');
    if (form.next !== form.confirm) errs.confirm = t('errors.passwordsDontMatch');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({ currentPassword: form.current, newPassword: form.next });
  };

  const firstTime = user?.mustChangePassword;
  if (done && user && !user.mustChangePassword) return <Redirect to={homePath(user)} />;

  return (
    <AuthLayout title={t('changePassword.title')} intro={firstTime ? t('changePassword.firstTimeIntro') : t('changePassword.intro')}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <PasswordField
          label={t('changePassword.current')}
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
          error={fieldErrors.current}
          autoComplete="current-password"
          autoFocus
          required
          testId="input-current"
        />
        <PasswordField
          label={t('changePassword.newPassword')}
          hint={t('setup.passwordHint')}
          value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })}
          error={fieldErrors.next}
          autoComplete="new-password"
          required
          testId="input-new"
        />
        <PasswordField
          label={t('changePassword.confirm')}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          error={fieldErrors.confirm}
          autoComplete="new-password"
          required
          testId="input-confirm"
        />
        <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
        <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit">
          {t('changePassword.submit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
          data-testid="button-signout"
        >
          {t('common.signOut')}
        </Button>
      </form>
    </AuthLayout>
  );
}
