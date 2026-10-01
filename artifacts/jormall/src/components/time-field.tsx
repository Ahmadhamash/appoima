import { useLayoutEffect, useRef, useState, useId } from 'react';
import { useI18n } from '@/lib/i18n';
import { createTimeInput } from './time-input';

type Props = { label: string; value: string; onChange: (value: string) => void; testId: string; required?: boolean; disabled?: boolean; error?: string };

export function TimeInput({ label, value, onChange, testId, required, disabled, error }: Props) {
  const { lang } = useI18n(), host = useRef<HTMLDivElement>(null), widget = useRef<ReturnType<typeof createTimeInput> | null>(null), callback = useRef(onChange);
  callback.current = onChange;
  useLayoutEffect(() => {
    const field = createTimeInput({ value, label, language: lang, testId, required, disabled, onChange: next => callback.current(next) });
    widget.current = field; host.current?.replaceChildren(field.node);
    return () => { field.node.remove(); widget.current = null; };
  }, [label, lang, testId, required]);
  useLayoutEffect(() => {
    widget.current?.setValue(value); widget.current?.disable(!!disabled);
    widget.current?.input.setAttribute('aria-invalid', String(!!error));
    widget.current?.input.setCustomValidity(error ?? '');
  }, [value, disabled, error, label, lang, testId, required]);
  return <div className="min-w-0" ref={host}/>;
}

export function TimeField(props: Props) {
  return <div className="min-w-0 space-y-1.5"><label htmlFor={props.testId} className="text-sm font-medium">{props.label}</label><TimeInput {...props}/>{props.error && <p role="alert" className="text-xs text-destructive">{props.error}</p>}</div>;
}

/** Keeps local YYYY-MM-DDTHH:mm values, including branch-local time-off editing. */
export function DateTimeField({ label, value, onChange, testId, required, disabled, error }: Props) {
  const { lang } = useI18n(), id = useId(), emitted = useRef(value);
  const [date, setDate] = useState(value.split('T')[0] ?? ''), [clock, setClock] = useState(value.split('T')[1] ?? '');
  useLayoutEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value; setDate(value.split('T')[0] ?? ''); setClock(value.split('T')[1] ?? '');
  }, [value]);
  function update(nextDate: string, nextClock: string) {
    setDate(nextDate); setClock(nextClock);
    emitted.current = nextDate && nextClock ? `${nextDate}T${nextClock}` : '';
    onChange(emitted.current);
  }
  return <fieldset className="min-w-0 space-y-1.5"><legend className="text-sm font-medium">{label}</legend><div className="grid min-w-0 gap-2 sm:grid-cols-2"><input id={id} type="date" value={date} required={required || !!clock} disabled={disabled} aria-label={`${label} (${lang === 'ar' ? 'التاريخ' : 'date'})`} className="focus-ring min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 py-2 text-sm" data-testid={`${testId}-date`} onChange={event => update(event.target.value, event.target.value ? clock || '00:00' : '')}/><TimeInput label={label} value={clock} onChange={next => update(date, next)} testId={testId} required={required || !!date} disabled={disabled} error={error}/></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</fieldset>;
}
