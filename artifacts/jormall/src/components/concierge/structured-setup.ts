import { DAYS, type Draft, type Language, type Week, type StaffDraft } from './contract';
import { el, button } from './dom';
import { createStaffBranchSchedules } from '../staff-branch-schedules';
import { createPhoneInput } from '../phone-input';
import { createBranchHoursEditor } from '../weekly-schedule';

const emptyWeek = (): Week => Object.fromEntries(DAYS.map(day => [day, []])) as unknown as Week;
/** Explicit fields keep setup independent of AI interpretation. */
export function buildStructuredSetup(source: Draft, kind: 'branches' | 'staff', language: Language, save: (draft: Draft, advance: boolean) => Promise<void>, changed: (draft: Draft) => void, archiveBranch?: (key:string|string[],draft:Draft)=>Promise<void>) {
 const draft = structuredClone(source), ar = language === 'ar', w = (a: string, e: string) => ar ? a : e;
 const newBranch = () => ({key:`branch_${crypto.randomUUID().slice(0,8)}`,existingId:null,name:null,nameLang:language,address:null,mapUrl:null,timeZone:'Asia/Amman',openingHours:emptyWeek()});
 if(kind==='branches'&&!draft.branches.length)draft.branches.push(newBranch());
 const form = el('form', 'jc-structured-setup'), list = el('div', 'jc-structured-list'); form.noValidate = true;
 form.dataset.testid = `concierge-${kind}-form`;
 const field = (host: HTMLElement, title: string, input: HTMLElement) => { const label = el('label', 'jc-service-field'); label.append(el('span', '', title), input); host.append(label); };
 const count = el('input'); count.type = 'number'; count.min = kind === 'branches' ? '1' : '0'; count.max = String(50 - Object.entries(draft).filter(([key]) => key !== kind).reduce((n, [, rows]) => n + rows.length, 0)); count.step = '1'; count.value = String(draft[kind].length); count.required = true; count.dataset.testid = `setup-${kind}-count`;
 field(form, kind === 'staff' ? w('عدد الموظفين', 'Number of staff members') : w('عدد الفروع', 'Number of branches'), count);
 const textField = (host: HTMLElement, row: any, key: string, title: string, required = false, type = 'text', max = 120) => {
  const input = el('input'); input.type = type; input.value = row[key] ?? ''; input.required = required; input.maxLength = max; input.dataset.testid = `setup-${row.key}-${key}`;
  const validate = () => {
   let invalid = required && !input.value.trim();
   if (type === 'email' && input.value) invalid ||= !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
   if (type === 'url' && input.value) { try { const url = new URL(input.value); invalid ||= !['http:', 'https:'].includes(url.protocol) || !!url.username || !!url.password; } catch { invalid = true; } }
   input.setCustomValidity(invalid ? w('أدخل قيمة صحيحة لهذا الحقل.', 'Enter a valid value for this field.') : '');
  };
  input.oninput = () => { validate(); row[key] = input.value.trim() || null; if (key === 'name') row.nameLang = /[\u0600-\u06ff]/.test(input.value) ? 'ar' : 'en'; changed(draft); }; validate(); field(host, title, input);
 };
 const schedule = (host: HTMLElement, row: any, key: string, title: string) => {
  const section = el('section', 'jc-structured-hours');section.dataset.setupTitle=title;section.append(el('h3', '', title));
  const week: Week = row[key] ?? emptyWeek(); row[key] = week;
  section.append(createBranchHoursEditor(week,{id:`setup-${row.key}`,language,sharedHours:true},next=>{row[key]=next;changed(draft);}).node);host.append(section);return section;
 };
 const render = (_index = 0) => {
  list.replaceChildren();
  const cards: HTMLElement[] = [];
  draft[kind].forEach((row, index) => {
   const card = el('fieldset', 'jc-service-batch-row'); card.dataset.testid = `setup-${kind}-card`; card.append(el('legend', '', `${kind === 'staff' ? w('الموظف', 'Staff member') : w('الفرع', 'Branch')} ${index + 1}`));
   const fields = el('div', 'jc-service-batch-fields'); textField(fields, row, 'name', w('الاسم', 'Name'), true);
   if (kind === 'branches') {
    textField(fields, row, 'address', w('موقع الفرع: المدينة، الشارع، المبنى', 'Branch address: city, street, building'), true, 'text', 400);
    textField(fields, row, 'mapUrl', w('رابط الموقع على الخريطة (اختياري)', 'Map link (optional)'), false, 'url', 500);
    fields.dataset.setupTitle=w('بيانات الفرع','Branch details');card.append(fields);schedule(card, row, 'openingHours', w('أيام وساعات الدوام', 'Opening days and hours'));
   } else {
    const person = row as StaffDraft;
    textField(fields, person, 'email', w('البريد الإلكتروني للدخول', 'Sign-in email'), true, 'email', 200);
    fields.append(createPhoneInput({value:person.phone??'',label:w('الهاتف (اختياري)', 'Phone (optional)'),language,testId:`setup-${row.key}-phone`,onChange:value=>{person.phone=value||null;changed(draft);}}).node);
    textField(fields, person, 'jobTitle', w('المسمى الوظيفي (اختياري)', 'Job title (optional)'));
    const select = (title: string, key: 'role' | 'branchKey', options: [string, string][]) => { const input = el('select'); input.required = true; input.dataset.testid = `setup-${row.key}-${key}`; for (const [value, label] of [['', w('اختر', 'Choose')], ...options]) { const option = el('option', '', label); option.value = value!; input.append(option); } input.value = person[key] ?? ''; input.onchange = () => { const value = input.value || null; if (person[key] === value) return; (person as any)[key] = value; if (key === 'branchKey') { person.serviceKeys = (person.serviceKeys ?? []).filter(k => draft.services.some(s => s.key === k && (s.branchScope === 'all' || person.branchSchedules?.some(shift=>shift.branchKey===s.branchKey)))); render(index); } else changed(draft); }; field(fields, title, input); };
    select(w('الدور', 'Role'), 'role', [['secretary', w('سكرتير / سكرتيرة', 'Secretary')], ['doctor', w('طبيب', 'Doctor')], ['service_provider', w('مقدم خدمة', 'Service provider')], ['other_staff', w('موظف آخر', 'Other staff')]]);
    card.append(fields);
    const first=draft.branches.find(b=>b.key===person.branchKey)??draft.branches[0];
    person.branchSchedules??=first?[{branchKey:first.key,workingHours:person.workingHours??first.openingHours??emptyWeek(),breaks:person.breaks??emptyWeek()}]:[];
    const assignments = el('div', 'jc-staff-assignments');
    const services = el('fieldset'); services.append(el('legend', '', w('الخدمات التي يقدمها', 'Services provided')));
    for (const service of draft.services.filter(s => s.branchScope === 'all' || person.branchSchedules?.some(shift=>shift.branchKey===s.branchKey))) { const label = el('label', 'jc-check'), check = el('input'); check.type = 'checkbox'; check.checked = !!person.serviceKeys?.includes(service.key); check.onchange = () => { person.serviceKeys = check.checked ? [...person.serviceKeys ?? [], service.key] : (person.serviceKeys ?? []).filter(k => k !== service.key); changed(draft); }; label.append(check, document.createTextNode(service.name ?? '')); services.append(label); } assignments.append(services);
    const shiftBranches=draft.branches.map(b=>({key:b.key,name:b.name??w('فرع','Branch'),timeZone:b.timeZone??'Asia/Amman',openingHours:b.openingHours}));
    assignments.prepend(createStaffBranchSchedules(shiftBranches,person.branchSchedules,language,`setup-${person.key}-branches`,next=>{const keysChanged=JSON.stringify(next.map(s=>s.branchKey))!==JSON.stringify(person.branchSchedules?.map(s=>s.branchKey));person.branchSchedules=next;person.branchKey=next.length===1?next[0]!.branchKey:null;person.workingHours=next[0]?.workingHours??null;person.breaks=next[0]?.breaks??emptyWeek();person.serviceKeys=(person.serviceKeys??[]).filter(k=>draft.services.some(s=>s.key===k&&(s.branchScope==='all'||next.some(n=>n.branchKey===s.branchKey))));changed(draft);if(keysChanged)render(index);}).node);
    card.append(assignments);
    fields.dataset.setupTitle=w('بيانات الموظف','Staff details');assignments.dataset.setupTitle=w('الدوام حسب الفرع','Schedule per branch');services.dataset.setupTitle=w('الخدمات','Services');services.remove();card.append(services);
   } if(kind==='branches'&&archiveBranch)card.append(button(w('حذف الفرع','Delete branch'),()=>{if(!window.confirm(w('حذف هذا الفرع؟ سيتم نقل بياناته وكل السجلات المرتبطة به إلى الأرشيف.','Delete this branch? Its data and related records will move to the archive.')))return;void archiveBranch(row.key,draft);},'jc-button jc-remove',`setup-delete-${row.key}`));cards.push(card);
  }); changed(draft);
  list.append(...cards);
 };
 const parked = [...draft[kind]];
 count.oninput = () => {
  if (!count.checkValidity() || count.value === '') return;
  const size = Number(count.value),removed=draft[kind].slice(size);
  const populated=removed.some(row=>row.name||('existingId'in row&&(row.existingId||row.address||row.mapUrl||DAYS.some(d=>row.openingHours?.[d].length)))||('email'in row&&(row.email||row.phone||row.jobTitle||row.role)));
  if(populated&&!window.confirm(w(`إزالة ${removed.length} نماذج تمت تعبئتها؟ ستُنقل بيانات الفروع والسجلات المرتبطة إلى الأرشيف.`,`Remove ${removed.length} populated forms? Branch data and related records will move to the archive.`))){count.value=String(draft[kind].length);return;}
  if(kind==='branches'&&removed.length&&archiveBranch){count.disabled=true;void archiveBranch(removed.map(row=>row.key),draft).finally(()=>{count.disabled=false;});return;}
  draft[kind].forEach((row, i) => { parked[i] = row; });
  const rows = Array.from({ length: size }, (_, i) => parked[i] ?? (kind === 'branches' ? newBranch() : { key: `staff_${crypto.randomUUID().slice(0, 8)}`, name: null, nameLang: language, email: null, phone: null, jobTitle: null, role: null, branchKey: draft.branches.length === 1 ? draft.branches[0]!.key : null, serviceKeys: [], workingHours: null, breaks: emptyWeek() }));
  (draft[kind] as any[]) = rows; render();
 };
 const error = el('p', 'jc-error'); error.hidden = true; error.setAttribute('role', 'alert');
 const submit = button(w('حفظ ومتابعة', 'Save and continue'), () => {}, 'jc-button jc-primary', `setup-${kind}-continue`); submit.type = 'submit';
 form.onsubmit = event => {
  event.preventDefault(); error.hidden = true;
  const invalidField = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')).find(input => !input.validity.valid);
  if (invalidField) {
   const card = invalidField.closest<HTMLElement>('.jc-service-batch-row');
   if (card) list.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: Array.from(list.querySelectorAll('.jc-service-batch-row')).indexOf(card) }));
   if (card) card.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: invalidField.closest('.jc-staff-assignments,.jc-structured-hours') ? 1 : 0 }));
   invalidField.closest('.weekly-schedule')?.dispatchEvent(new CustomEvent('jormall:schedule-reveal',{detail:invalidField.dataset.testid}));
   const hours = invalidField.closest('details'); if (hours) hours.open = true;
   invalidField.reportValidity(); return;
  }
  const invalidIndex = draft[kind].findIndex(row => { if('branchSchedules' in row){return !row.branchSchedules?.length||row.branchSchedules.some(s=>!DAYS.some(d=>s.workingHours[d].length)||DAYS.some(d=>s.workingHours[d].some(r=>!r.open||!r.close||r.open>=r.close)));}const hours = 'openingHours' in row ? row.openingHours : row.workingHours; return !hours || !DAYS.some(day => hours[day].length) || DAYS.some(day => hours[day].some(r => !r.open || !r.close || r.open >= r.close)); });
  if (invalidIndex >= 0) {
   list.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: invalidIndex }));
   error.textContent = w('حدّد يوم عمل واحدًا على الأقل لكل سجل، ووقت انتهاء بعد البداية.', 'Choose at least one working day per record, with the end after the start.'); error.hidden = false;
   const card = list.querySelectorAll<HTMLElement>('[data-testid="setup-staff-card"], [data-testid="setup-branches-card"]')[invalidIndex];
   card?.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: 1 }));
   for (const details of card?.querySelectorAll('details') ?? []) details.open = true;
   return;
  }
  void save(draft, true);
 };
 form.append(list, error, submit); render(); return form;
}
