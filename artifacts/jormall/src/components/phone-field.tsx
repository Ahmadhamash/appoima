import { useLayoutEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { createPhoneInput } from './phone-input';

export function PhoneField({ value, onChange, label, testId, error, required, disabled }: { value: string; onChange: (value: string) => void; label: string; testId: string; error?: string; required?: boolean; disabled?: boolean }) {
  const { lang } = useI18n(), host = useRef<HTMLDivElement>(null), callback = useRef(onChange), widget = useRef<ReturnType<typeof createPhoneInput> | null>(null);
  callback.current = onChange;
  useLayoutEffect(() => {
    const field = createPhoneInput({ value, label, language: lang, testId, required, disabled, error, onChange: next => callback.current(next) });
    widget.current = field; host.current?.replaceChildren(field.node);
    return () => { widget.current = null; host.current?.replaceChildren(); };
  }, [lang, label, testId, required]);
  useLayoutEffect(() => { widget.current?.update({ value, error, disabled }); }, [value, error, disabled, lang, label, testId, required]);
  return <div ref={host} />;
}
