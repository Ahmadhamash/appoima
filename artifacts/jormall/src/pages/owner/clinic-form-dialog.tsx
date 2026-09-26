import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FormField, PasswordField, FormError } from '@/components/form-field';
import { api, type ClinicOverview } from '@/lib/api';
import { useErrorMessage, useI18n } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';

type ManagerInput = { name: string; email: string; initialPassword: string };

function validateManager(m: ManagerInput, t: (k: string) => string) {
  const errs: Record<string, string> = {};
  if (!m.name.trim()) errs.managerName = t('errors.nameRequired');
  if (!/^\S+@\S+\.\S+$/.test(m.email)) errs.managerEmail = t('errors.emailInvalid');
  if (m.initialPassword.length < 10) errs.initialPassword = t('errors.passwordTooShort');
  return errs;
}

function ManagerFields({
  value,
  onChange,
  errors,
}: {
  value: ManagerInput;
  onChange: (v: ManagerInput) => void;
  errors: Record<string, string>;
}) {
  const { t } = useI18n();
  return (
    <>
      <FormField
        label={t('owner.managerName')}
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        error={errors.managerName}
        autoComplete="off"
        testId="input-manager-name"
      />
      <FormField
        label={t('owner.managerEmail')}
        type="email"
        dir="ltr"
        value={value.email}
        onChange={(e) => onChange({ ...value, email: e.target.value })}
        error={errors.managerEmail}
        autoComplete="off"
        testId="input-manager-email"
      />
      <PasswordField
        label={t('owner.initialPassword')}
        hint={t('owner.initialPasswordHint')}
        value={value.initialPassword}
        onChange={(e) => onChange({ ...value, initialPassword: e.target.value })}
        error={errors.initialPassword}
        autoComplete="new-password"
        testId="input-initial-password"
      />
    </>
  );
}

const emptyManager: ManagerInput = { name: '', email: '', initialPassword: '' };

export function CreateClinicDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (clinic: ClinicOverview) => void;
}) {
  const { t, lang } = useI18n();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [withManager, setWithManager] = useState(true);
  const [manager, setManager] = useState<ManagerInput>(emptyManager);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName('');
    setManager(emptyManager);
    setWithManager(true);
    setErrors({});
    mutation.reset();
  };

  const mutation = useMutation({
    mutationFn: (body: { name: string; nameLang: 'en' | 'ar'; manager?: ManagerInput }) =>
      api<{ clinic: ClinicOverview }>('/clinics', { method: 'POST', body }),
    onSuccess: ({ clinic }) => {
      qc.invalidateQueries({ queryKey: ['clinics'] });
      toast({
        title: t('owner.created'),
        description: clinic.manager
          ? t('owner.createdWithManager', { clinic: clinic.name, manager: clinic.manager.name })
          : undefined,
      });
      onOpenChange(false);
      reset();
      onCreated?.(clinic);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('errors.nameRequired');
    if (withManager) Object.assign(errs, validateManager(manager, t));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      name: name.trim(),
      nameLang: lang,
      manager: withManager ? { ...manager, name: manager.name.trim(), email: manager.email.trim() } : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader className="text-start">
            <DialogTitle>{t('owner.createTitle')}</DialogTitle>
            <DialogDescription>{t('owner.createIntro')}</DialogDescription>
          </DialogHeader>

          <FormField
            label={t('owner.clinicName')}
            hint={t('owner.clinicNameHint')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            autoFocus
            testId="input-clinic-name"
          />

          <fieldset className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">{t('owner.managerSection')}</legend>
            {withManager && <ManagerFields value={manager} onChange={setManager} errors={errors} />}
            <div className="flex items-center gap-2">
              <Checkbox
                id="without-manager"
                checked={!withManager}
                onCheckedChange={(c) => setWithManager(c !== true)}
                data-testid="checkbox-without-manager"
              />
              <Label htmlFor="without-manager" className="font-normal">
                {t('owner.withoutManager')}
              </Label>
            </div>
          </fieldset>

          <FormError message={mutation.error ? errorMessage(mutation.error) : null} />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-create-clinic">
              {t('owner.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddManagerDialog({
  clinicId,
  open,
  onOpenChange,
}: {
  clinicId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [manager, setManager] = useState<ManagerInput>(emptyManager);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (body: ManagerInput) => api(`/clinics/${clinicId}/managers`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinics'] });
      toast({ title: t('owner.managerAdded') });
      onOpenChange(false);
      setManager(emptyManager);
      setErrors({});
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateManager(manager, t);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({ ...manager, name: manager.name.trim(), email: manager.email.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader className="text-start">
            <DialogTitle>{t('owner.addManager')}</DialogTitle>
            <DialogDescription>{t('owner.createIntro')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ManagerFields value={manager} onChange={setManager} errors={errors} />
          </div>
          <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-add-manager">
              {t('owner.addManager')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
