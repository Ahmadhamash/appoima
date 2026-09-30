import { DAYS, type Draft, type Language, type Week, type StaffDraft } from './contract';
import { el, button } from './dom';
import { setupPager } from './paging';

const emptyWeek = (): Week => Object.fromEntries(DAYS.map(day => [day, []])) as unknown as Week;
/** Explicit fields keep setup independent of AI interpretation. */
export function buildStructuredSetup(source: Draft, kind: 'branches' | 'staff', language: Language, save: (draft: Draft, advance: boolean) => Promise<void>, changed: (draft: Draft) => void) {
 const draft = structuredClone(source), ar = language === 'ar', w = (a: string, e: string) => ar ? a : e;
 const form = el('form', 'jc-structured-setup'), list = el('div', 'jc-structured-list'); form.noValidate = true;
 form.dataset.testid = `concierge-${kind}-form`;
 const field = (host: HTMLElement, title: string, input: HTMLElement) => { const label = el('label', 'jc-service-field'); label.append(el('span', '', title), input); host.append(label); };
 const count = el('input'); count.type = 'number'; count.min = kind === 'branches' ? '1' : '0'; count.max = String(50 - Object.entries(draft).filter(([key]) => key !== kind).reduce((n, [, rows]) => n + rows.length, 0)); count.step = '1'; count.value = String(draft[kind].length); count.required = true; count.dataset.testid = `setup-${kind}-count`;
 field(form, kind === 'staff' ? w('كم موظف بدك تضيف؟', 'How many staff members?') : w('كم فرع عندك؟', 'How many branches?'), count);
 const textField = (host: HTMLElement, row: any, key: string, title: string, required = false, type = 'text', max = 120) => {
  const input = el('input'); input.type = type; input.value = row[key] ?? ''; input.required = required; input.maxLength = max; input.dataset.testid = `setup-${row.key}-${key}`;
  input.oninput = () => { row[key] = input.value.trim() || null; if (key === 'name') row.nameLang = /[\u0600-\u06ff]/.test(input.value) ? 'ar' : 'en'; changed(draft); }; field(host, title, input);
 };
 const schedule = (host: HTMLElement, row: any, key: string, title: string) => {
  const section = el('details', 'jc-structured-hours'); section.append(el('summary', '', title));
  const week: Week = row[key] ?? emptyWeek(); row[key] = week;
  const names = ar ? ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  DAYS.forEach((day, i) => {
   const line = el('div', 'jc-hours-row'), check = el('input'); check.type = 'checkbox'; check.checked = week[day].length > 0; check.dataset.testid = `setup-${row.key}-${key}-${day}`;
   const label = el('label', 'jc-check'); label.append(check, document.createTextNode(names[i]!)); line.append(label);
   const ranges = el('div');
   const draw = () => { ranges.replaceChildren(); week[day].forEach((range, index) => { const group = el('div', 'jc-hours-row'); for (const part of ['open', 'close'] as const) { const input = el('input'); input.type = 'time'; input.required = true; input.value = range[part]; input.dataset.testid = `setup-${row.key}-${key}-${day}-${index}-${part}`; input.setAttribute('aria-label', `${title} ${names[i]} ${part === 'open' ? w('من', 'from') : w('إلى', 'to')}`); input.oninput = () => { range[part] = input.value; changed(draft); }; group.append(input); } ranges.append(group); }); };
   check.onchange = () => { week[day] = check.checked ? [{ open: '09:00', close: '17:00' }] : []; draw(); changed(draft); }; draw(); line.append(ranges); section.append(line);
  }); host.append(section);
 };
 const render = (page = Number(list.dataset.setupPage) || 0) => {
  const staffPages = new Map(Array.from(list.querySelectorAll<HTMLElement>('[data-testid="setup-staff-card"]')).map((card, index) => [index, Number(card.dataset.setupPage) || 0]));
  list.replaceChildren();
  const cards: HTMLElement[] = [];
  draft[kind].forEach((row, index) => {
   const card = el('fieldset', 'jc-service-batch-row'); card.dataset.testid = `setup-${kind}-card`; card.append(el('legend', '', `${kind === 'staff' ? w('الموظف', 'Staff member') : w('الفرع', 'Branch')} ${index + 1}`));
   const fields = el('div', 'jc-service-batch-fields'); textField(fields, row, 'name', w('الاسم', 'Name'), true);
   if (kind === 'branches') {
    textField(fields, row, 'address', w('موقع الفرع: المدينة، الشارع، المبنى', 'Branch address: city, street, building'), true, 'text', 400);
    textField(fields, row, 'mapUrl', w('رابط الموقع على الخريطة (اختياري)', 'Map link (optional)'), false, 'url', 500);
    card.append(fields); schedule(card, row, 'openingHours', w('أيام وساعات الدوام', 'Opening days and hours'));
   } else {
    const person = row as StaffDraft;
    textField(fields, person, 'email', w('البريد الإلكتروني للدخول', 'Sign-in email'), true, 'email', 200);
    textField(fields, person, 'phone', w('الهاتف (اختياري)', 'Phone (optional)'), false, 'tel', 50);
    textField(fields, person, 'jobTitle', w('المسمى الوظيفي (اختياري)', 'Job title (optional)'));
    const select = (title: string, key: 'role' | 'branchKey', options: [string, string][]) => { const input = el('select'); input.required = true; input.dataset.testid = `setup-${row.key}-${key}`; for (const [value, label] of [['', w('اختر', 'Choose')], ...options]) { const option = el('option', '', label); option.value = value!; input.append(option); } input.value = person[key] ?? ''; input.onchange = () => { const value = input.value || null; if (person[key] === value) return; (person as any)[key] = value; if (key === 'branchKey') { person.serviceKeys = (person.serviceKeys ?? []).filter(k => draft.services.some(s => s.key === k && (s.branchScope === 'all' || s.branchKey === person.branchKey))); render(index); } else changed(draft); }; field(fields, title, input); };
    select(w('الدور', 'Role'), 'role', [['secretary', w('سكرتير / سكرتيرة', 'Secretary')], ['doctor', w('طبيب', 'Doctor')], ['service_provider', w('مقدم خدمة', 'Service provider')], ['other_staff', w('موظف آخر', 'Other staff')]]);
    select(w('الفرع', 'Branch'), 'branchKey', draft.branches.map(b => [b.key, b.name ?? w('فرع', 'Branch')])); card.append(fields);
    const assignments = el('div', 'jc-staff-assignments');
    const services = el('fieldset'); services.append(el('legend', '', w('الخدمات التي يقدمها', 'Services provided')));
    for (const service of draft.services.filter(s => s.branchScope === 'all' || s.branchKey === person.branchKey)) { const label = el('label', 'jc-check'), check = el('input'); check.type = 'checkbox'; check.checked = !!person.serviceKeys?.includes(service.key); check.onchange = () => { person.serviceKeys = check.checked ? [...person.serviceKeys ?? [], service.key] : (person.serviceKeys ?? []).filter(k => k !== service.key); changed(draft); }; label.append(check, document.createTextNode(service.name ?? '')); services.append(label); } assignments.append(services);
    schedule(assignments, person, 'workingHours', w('أيام وساعات عمل الموظف', 'Staff working hours')); schedule(assignments, person, 'breaks', w('أوقات الاستراحة (اختياري)', 'Break times (optional)'));
    card.append(assignments);
    const detailPager = setupPager(card, [fields, assignments], language, `staff-detail-pages-${row.key}`);
    if (detailPager) card.insertBefore(detailPager, fields);
    card.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: staffPages.get(index) ?? 0 }));
   } cards.push(card);
  }); changed(draft);
  list.append(...cards);
  if (kind === 'staff') {
   const pager = setupPager(list, cards, language, 'concierge-staff-pages');
   if (pager) list.prepend(pager);
   list.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: page }));
  }
 };
 const parked = [...draft[kind]];
 count.oninput = () => {
  if (!count.checkValidity() || count.value === '') return;
  const size = Number(count.value); draft[kind].forEach((row, i) => { parked[i] = row; });
  const rows = Array.from({ length: size }, (_, i) => parked[i] ?? (kind === 'branches' ? { key: `branch_${crypto.randomUUID().slice(0, 8)}`, existingId: null, name: null, nameLang: language, address: null, mapUrl: null, timeZone: 'Asia/Amman', openingHours: emptyWeek() } : { key: `staff_${crypto.randomUUID().slice(0, 8)}`, name: null, nameLang: language, email: null, phone: null, jobTitle: null, role: null, branchKey: draft.branches.length === 1 ? draft.branches[0]!.key : null, serviceKeys: [], workingHours: null, breaks: emptyWeek() }));
  (draft[kind] as any[]) = rows; render(Math.max(0, Math.min(size - 1, Number(list.dataset.setupPage) || 0)));
 };
 const error = el('p', 'jc-error'); error.hidden = true; error.setAttribute('role', 'alert');
 const submit = button(w('حفظ ومتابعة', 'Save and continue'), () => {}, 'jc-button jc-primary', `setup-${kind}-continue`); submit.type = 'submit';
 form.onsubmit = event => {
  event.preventDefault(); error.hidden = true;
  const invalidField = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')).find(input => !input.validity.valid);
  if (invalidField) {
   const card = invalidField.closest<HTMLElement>('[data-testid="setup-staff-card"]');
   if (card) list.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: Array.from(list.querySelectorAll('[data-testid="setup-staff-card"]')).indexOf(card) }));
   if (card) card.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: invalidField.closest('.jc-staff-assignments') ? 1 : 0 }));
   const hours = invalidField.closest('details'); if (hours) hours.open = true;
   invalidField.reportValidity(); return;
  }
  const invalidIndex = draft[kind].findIndex(row => { const hours = 'openingHours' in row ? row.openingHours : row.workingHours; return !hours || !DAYS.some(day => hours[day].length) || DAYS.some(day => hours[day].some(r => !r.open || !r.close || r.open >= r.close)); });
  if (invalidIndex >= 0) {
   if (kind === 'staff') list.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: invalidIndex }));
   error.textContent = w('حدّد يوم عمل واحدًا على الأقل لكل سجل، ووقت انتهاء بعد البداية.', 'Choose at least one working day per record, with the end after the start.'); error.hidden = false;
   const card = list.querySelectorAll<HTMLElement>('[data-testid="setup-staff-card"], [data-testid="setup-branches-card"]')[invalidIndex];
   if (kind === 'staff') card?.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: 1 }));
   for (const details of card?.querySelectorAll('details') ?? []) details.open = true;
   return;
  }
  void save(draft, true);
 };
 form.append(list, error, submit); render(); return form;
}
