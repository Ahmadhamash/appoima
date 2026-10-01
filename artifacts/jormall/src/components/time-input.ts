import { formatClockTime, parseClockTime } from '../lib/time-format';

type Options = { value: string; label: string; language: 'ar' | 'en'; testId: string; required?: boolean; disabled?: boolean; onChange: (value: string) => void };

/** Explicit 12-hour editor shared by manual forms and the guided setup. */
export function createTimeInput(options: Options) {
  const node = document.createElement('div'), input = document.createElement('input'), period = document.createElement('select');
  node.className = 'time-input'; node.dir = 'ltr';
  input.type = 'text'; input.placeholder = 'h:mm'; input.maxLength = 5;
  input.pattern = '(0?[1-9]|1[0-2]):[0-5][0-9]'; input.required = !!options.required;
  input.id = options.testId; input.dataset.testid = options.testId; input.autocomplete = 'off';
  input.setAttribute('aria-label', `${options.label} (${options.language === 'ar' ? 'ساعة:دقيقة' : 'h:mm'})`);
  period.dataset.testid = `${options.testId}-period`;
  period.setAttribute('aria-label', `${options.label} AM/PM`);
  for (const value of ['AM', 'PM']) {
    const option = document.createElement('option'); option.value = value; option.textContent = value; period.append(option);
  }
  node.append(input, period);
  let value = options.value;
  const setValue = (next: string) => {
    value = next;
    const formatted = formatClockTime(next);
    input.value = formatted === '—' ? '' : formatted.split(' ')[0]!;
    period.value = formatted.endsWith('PM') ? 'PM' : 'AM';
    node.dataset.clock = next;
  };
  const emit = () => { value = parseClockTime(input.value, period.value); node.dataset.clock = value; options.onChange(value); };
  input.oninput = emit; period.onchange = emit;
  input.onblur = () => { if (value) input.value = formatClockTime(value).split(' ')[0]!; };
  setValue(options.value);
  const disable = (disabled: boolean) => { input.disabled = period.disabled = disabled; };
  disable(!!options.disabled);
  return { node, input, period, value: () => value, disable, setValue(next: string) { if (next !== value) setValue(next); } };
}
