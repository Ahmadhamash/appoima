import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, asciiPhoneDigits, nationalPhoneDigits, normalizePhone, phoneRules, splitPhone, type PhoneCountry } from '@workspace/service-definition';

export type PhoneInputOptions = { value: string; label: string; language: 'ar' | 'en'; testId: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean; error?: string };
export function phoneValidationMessage(language: 'ar' | 'en') {
  return language === 'ar' ? 'اختَر رمز الدولة وأدخل رقم هاتف صحيحًا بالأرقام فقط.' : 'Choose a country code and enter a valid phone number using digits only.';
}
/** Used by both React manual forms and the guided setup's DOM forms. */
export function createPhoneInput(options: PhoneInputOptions) {
  const ar = options.language === 'ar', node = document.createElement('div'); node.className = 'phone-field';
  const label = document.createElement('label'), controls = document.createElement('div'), countrySelect = document.createElement('select'), input = document.createElement('input'), hint = document.createElement('small'), error = document.createElement('small');
  const id = `phone-${crypto.randomUUID()}`; input.id = id; label.htmlFor = id; label.textContent = options.label;
  controls.className = 'phone-controls'; controls.dir = 'ltr';
  countrySelect.dataset.testid = `${options.testId}-country`; countrySelect.setAttribute('aria-label', ar ? 'رمز الدولة' : 'Country code');
  const names = new Intl.DisplayNames([options.language], { type: 'region' });
  const preferred: PhoneCountry[] = ['JO', 'PS', 'SA', 'AE', 'LB', 'EG', 'IQ', 'KW', 'QA', 'BH', 'OM', 'US', 'GB'];
  const countries = [...preferred, ...PHONE_COUNTRIES.filter(country => !preferred.includes(country)).sort((a, b) => (names.of(a) ?? a).localeCompare(names.of(b) ?? b, options.language))];
  for (const country of countries) { const option = document.createElement('option'); option.value = country; option.textContent = `${names.of(country)} +${phoneRules(country).callingCode}`; countrySelect.append(option); }
  input.type = 'tel'; input.inputMode = 'numeric'; input.autocomplete = 'tel-national'; input.pattern = '[0-9]*'; input.required = !!options.required; input.dataset.testid = options.testId;
  input.setAttribute('aria-describedby', `${id}-hint ${id}-error`); hint.id = `${id}-hint`; error.id = `${id}-error`; error.className = 'phone-error'; error.setAttribute('role', 'alert');
  controls.append(countrySelect, input); node.append(label, controls, hint, error);
  let country = DEFAULT_PHONE_COUNTRY, value = options.value, touched = false, externalError = options.error;
  function refresh() {
    const rules = phoneRules(country); countrySelect.value = country; input.maxLength = rules.maxDigits;
    hint.textContent = ar ? `بدون رمز الدولة. عدد الأرقام المسموح: ${rules.lengths.join('، ')}.` : `Without the country code. Allowed digit counts: ${rules.lengths.join(', ')}.`;
    const invalid = !!value && !normalizePhone(value, country);
    input.setCustomValidity(invalid ? phoneValidationMessage(options.language) : '');
    input.setAttribute('aria-invalid', String(!!externalError || touched && invalid));
    error.textContent = externalError || (touched && invalid ? phoneValidationMessage(options.language) : ''); error.hidden = !error.textContent;
  }
  function setValue(next: string) { value = next; const parts = splitPhone(next, country); country = parts.country; input.value = parts.digits; refresh(); }
  function emit() { input.value = nationalPhoneDigits(input.value, country); value = input.value ? `+${phoneRules(country).callingCode}${input.value}` : ''; externalError = undefined; refresh(); options.onChange(value); }
  input.oninput = emit;
  input.onkeydown = event => { if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !/[0-9٠-٩۰-۹]/.test(event.key)) event.preventDefault(); };
  input.onpaste = event => {
    event.preventDefault(); const raw = asciiPhoneDigits(event.clipboardData?.getData('text') ?? '').trim();
    if (/^(\+|00)/.test(raw)) { const parts = splitPhone(raw, country); country = parts.country; input.value = parts.digits; }
    else input.value = input.value.slice(0, input.selectionStart ?? 0) + raw.replace(/\D/g, '') + input.value.slice(input.selectionEnd ?? input.value.length);
    emit();
  };
  input.onblur = () => { touched = true; refresh(); };
  input.oninvalid = () => { touched = true; refresh(); };
  countrySelect.onchange = () => { country = countrySelect.value as PhoneCountry; touched = true; emit(); };
  setValue(options.value);
  input.disabled = countrySelect.disabled = !!options.disabled;
  return { node, input, countrySelect, update(next: { value: string; error?: string; disabled?: boolean }) { externalError = next.error; input.disabled = countrySelect.disabled = !!next.disabled; if (next.value !== value) setValue(next.value); else refresh(); } };
}
