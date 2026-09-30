import { type Draft, type Language, type ServiceDraft } from './contract';
import { button, el } from './dom';
import { setupPager } from './paging';
import { createDefinition, definitionIssues, normalizeServiceName } from '@workspace/service-definition';
import { setupNotice } from './setup-notice';

const CATEGORIES: NonNullable<ServiceDraft['category']>[] = ['Skin', 'Laser', 'Massage', 'Hair', 'Nails', 'Makeup', 'Other'];
const LABELS: Record<typeof CATEGORIES[number], [string, string]> = { Skin: ['البشرة والجسم', 'Skin and body'], Laser: ['الليزر', 'Laser'], Massage: ['المساج', 'Massage'], Hair: ['الشعر', 'Hair'], Nails: ['الأظافر', 'Nails'], Makeup: ['المكياج', 'Makeup'], Other: ['أخرى', 'Other'] };
const GENERIC = ['خدمات العيادة', 'Clinic services'];
const validDuration = (value: number | null) => value !== null && Number.isInteger(value) && value >= 1 && value <= 1440;
const validPrice = (value: string | null) => value !== null && /^\d{1,9}(\.\d{1,3})?$/.test(value);
const categoryFor = (name: string): ServiceDraft['category'] => /ليزر|laser|ipl|co2/i.test(name) ? 'Laser' : /مساج|massage|تدليك/i.test(name) ? 'Massage' : /أظافر|nails|manicure|pedicure/i.test(name) ? 'Nails' : /مكياج|makeup/i.test(name) ? 'Makeup' : /شعر|hair|تصفيف/i.test(name) ? 'Hair' : /بشر|جلد|skin|facial|lpg|exilis|cryolipolysis|btl|carboxy|ultratone|نحت|تجميد|دهون|جسم/i.test(name) ? 'Skin' : 'Other';

export function buildServiceBatch(source: Draft, language: Language, save: (draft: Draft, advance: boolean) => Promise<void>, back?: (draft: Draft) => Promise<void>, changed?: (draft: Draft) => void): HTMLElement {
 const draft = structuredClone(source), ar = language === 'ar', w = (arabic: string, english: string) => ar ? arabic : english;
 const compact = innerWidth <= 760 || innerHeight < 750;
 const categoryName = (category: ServiceDraft['category']) => category ? LABELS[category][ar ? 0 : 1] : '';
 const total = () => Object.values(draft).reduce((count, rows) => count + rows.length, 0);
 const definition = (service: ServiceDraft) => service.definition ??= createDefinition(service.category === 'Laser' ? 'laser' : 'custom', language);
 const section = (service: ServiceDraft) => {
  const name = service.definition?.section;
  if (name && !GENERIC.includes(name)) { const category = CATEGORIES.find(value => LABELS[value].includes(name)); return category ? categoryName(category) : name; }
  return categoryName(service.category) || w('خدمات جديدة', 'New services');
 };
 const newService = (parent?: ServiceDraft): ServiceDraft => ({ key: `service_${crypto.randomUUID().replaceAll('-', '')}`, name: null, nameLang: null, branchKey: draft.branches.length === 1 ? draft.branches[0]!.key : null, branchScope: draft.branches.length === 1 ? 'branch' : null, durationMinutes: null, price: null, currency: 'JOD', category: parent?.category ?? null, requiresRoom: null, definition: parent ? { ...createDefinition(parent.category === 'Laser' ? 'laser' : 'custom', language), section: section(parent) } : null, followUpEnabled: false });
 if (!draft.services.length && total() < 50) draft.services.push(newService());
 for (const service of draft.services) {
  service.currency = 'JOD'; if (service.name) service.nameLang ??= /[\u0600-\u06ff]/.test(service.name) ? 'ar' : 'en';
  if (!service.branchScope) { if (service.branchKey) service.branchScope = 'branch'; else if (draft.branches.length === 1) { service.branchScope = 'branch'; service.branchKey = draft.branches[0]!.key; } }
  if (service.name && !service.category) service.category = categoryFor(service.name);
 }
 const root = el('section', 'jc-service-batch jc-service-entry'); root.dataset.testid = 'concierge-service-batch';
 const progress = el('p', 'jc-service-batch-progress'); progress.setAttribute('role', 'status');
 const toolbar = el('div', 'jc-room-toolbar'), rows = el('div', 'jc-service-batch-rows');
 const selected = new Set<string>(), originalCategories = new Map(source.services.map(service => [service.key, service.category])), categoryManual = new Set<string>();
 const customLabels = new Map(draft.services.map(service => [service.key, service.category === 'Other' && service.definition && !GENERIC.includes(service.definition.section) ? service.definition.section : '']));
 const option = (select: HTMLSelectElement, value: string, label: string) => { const item = el('option', '', label); item.value = value; select.append(item); };
 const labeled = (label: string, input: HTMLElement) => { const field = el('label', 'jc-service-field'); field.append(el('span', '', label), input); return field; };
 const missing = (service: ServiceDraft) => {
  const fields: string[] = [];
  if (!service.name?.trim()) fields.push(w('اسم الخدمة', 'Service name'));
  if (!validDuration(service.durationMinutes)) fields.push(w('المدة', 'Duration'));
  if (!validPrice(service.price)) fields.push(w('السعر', 'Price'));
  if (!service.category) fields.push(w('التصنيف', 'Category'));
  if (service.category === 'Other' && !customLabels.get(service.key)?.trim()) fields.push(w('اسم التصنيف الآخر', 'Other category name'));
  if (service.requiresRoom === null) fields.push(w('احتياج الغرفة', 'Room requirement'));
  if (!service.branchScope || service.branchScope === 'branch' && !service.branchKey) fields.push(w('الفرع', 'Branch'));
  if (definitionIssues(service.definition).some(issue => issue.code !== 'medical_review_required')) fields.push(w('تعريف الخدمة يحتاج تعديلًا', 'Service definition needs an edit'));
  const identity = normalizeServiceName(service.name ?? '') + '|' + (service.branchKey ?? 'all');
  if (service.name && draft.services.some(other => other.key !== service.key && normalizeServiceName(other.name ?? '') + '|' + (other.branchKey ?? 'all') === identity)) fields.push(w('اسم مكرر في نفس الفرع', 'Duplicate name in this branch'));
  return fields;
 };
 const ready = (service: ServiceDraft) => missing(service).length === 0;
 const refresh = () => {
  const completed = draft.services.filter(ready).length;
  progress.textContent = w(`اكتملت ${completed} من ${draft.services.length} خدمة`, `${completed} of ${draft.services.length} services ready`);
  saveButton.textContent = draft.services.length > 0 && completed === draft.services.length ? w('حفظ الخدمات والمتابعة', 'Save services and continue') : w('حفظ التقدم', 'Save progress');
  bulk.hidden = draft.services.length < 2; changed?.(draft);
 };
 const bulk = el('details', 'jc-service-bulk'); bulk.append(el('summary', '', w('تفاصيل مشتركة لخدمات تختارها (اختياري)', 'Shared details for selected services (optional)')));
 const selection = el('div', 'jc-service-bulk-selection'), bulkFields = el('div', 'jc-service-bulk-fields');
 const bulkDuration = el('input'), bulkPrice = el('input'), bulkCategory = el('select'), bulkRoom = el('select'), bulkCustom = el('input');
 bulkDuration.type = 'number'; bulkDuration.min = '1'; bulkDuration.max = '1440'; bulkDuration.step = '1'; bulkPrice.type = 'number'; bulkPrice.min = '0'; bulkPrice.step = '.001';
 option(bulkCategory, '', w('التصنيف كما هو', 'Keep categories')); for (const category of CATEGORIES) option(bulkCategory, category, categoryName(category));
 option(bulkRoom, '', w('الغرفة كما هي', 'Keep room choices')); option(bulkRoom, 'true', w('تحتاج غرفة', 'Needs a room')); option(bulkRoom, 'false', w('لا تحتاج غرفة', 'No room needed'));
 bulkFields.append(labeled(w('مدة موحدة', 'Common duration'), bulkDuration), labeled(w('سعر موحد', 'Common price'), bulkPrice), labeled(w('التصنيف', 'Category'), bulkCategory), labeled(w('الغرفة', 'Room'), bulkRoom));
 bulkCustom.maxLength = 80; bulkCustom.dataset.testid = 'service-bulk-custom-category'; const bulkCustomField = labeled(w('اسم التصنيف الآخر', 'Other category name'), bulkCustom); bulkCustomField.hidden = true; bulkCategory.onchange = () => { bulkCustomField.hidden = bulkCategory.value !== 'Other'; };
 const selectionPage = el('div', 'jc-bulk-part'), valuesPage = el('div', 'jc-bulk-part');
 selectionPage.append(el('p', '', w('اختر الخدمات اللي إلها نفس التفاصيل. بنعبّي النواقص فقط.', 'Choose services that share these details. Only missing values are filled.')), selection); valuesPage.append(bulkFields, bulkCustomField); bulk.append(selectionPage, valuesPage);
 const bulkPager = setupPager(bulk, [selectionPage, valuesPage], language, 'service-bulk-detail-pages'); if (bulkPager) bulk.insertBefore(bulkPager, selectionPage);
 const renderSelection = () => {
  selection.replaceChildren(); const parts: HTMLElement[] = [];
  for (let offset = 0; offset < draft.services.length; offset += 4) {
   const part = el('div', 'jc-service-bulk-choices');
   for (const service of draft.services.slice(offset, offset + 4)) {
    const label = el('label', 'jc-check'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(service.key); check.dataset.testid = `service-bulk-select-${service.key}`;
    check.onchange = () => { if (check.checked) selected.add(service.key); else selected.delete(service.key); }; label.title = service.name ?? ''; label.append(check, el('span', '', service.name || w('خدمة جديدة', 'New service'))); part.append(label);
   }
   parts.push(part); selection.append(part);
  }
  const pager = setupPager(selection, parts, language, 'service-bulk-selection-pages'); if (pager) selection.prepend(pager);
 };
 let activeKey = draft.services[0]?.key;
 const renderServices = (target = activeKey) => {
  const savedPages = new Map(Array.from(rows.querySelectorAll<HTMLElement>('.jc-service-batch-row')).map(row => [row.dataset.testid, Number(row.dataset.setupPage) || 0]));
  root.querySelector('[data-testid="concierge-service-pages"]')?.remove(); rows.replaceChildren();
  const groups = new Map<string, ServiceDraft[]>(); for (const service of draft.services) { const name = section(service); groups.set(name, [...groups.get(name) ?? [], service]); }
  const cards: HTMLElement[] = [], keys: string[] = [], sections: HTMLElement[] = [];
  for (const [groupName, services] of groups) {
   const group = el('section', 'jc-service-group'); group.dataset.testid = 'concierge-service-group'; group.dataset.groupName = groupName;
   const heading = el('div', 'jc-service-group-heading'), groupTitle = el('h3', '', groupName); groupTitle.title = groupName;
   heading.append(groupTitle, button(w('+ خدمة فرعية', '+ Subservice'), () => addService(services[0]), 'jc-link', `service-sub-add-${services[0]!.key}`)); group.append(heading);
   for (const service of services) {
    const row = el('article', 'jc-service-batch-row'); row.dataset.testid = `concierge-service-${service.key}`;
    const title = el('div', 'jc-service-batch-title'), titleText = el('strong'), badge = el('span', 'jc-service-state'); title.append(el('span', 'jc-service-index', String(draft.services.indexOf(service) + 1)), titleText, badge);
    title.append(button(w('حذف', 'Remove'), () => {
     if (service.name && !window.confirm(w('حذف هذه الخدمة؟', 'Remove this service?'))) return;
     draft.services = draft.services.filter(item => item.key !== service.key); selected.delete(service.key);
     for (const room of draft.rooms) room.serviceKeys = room.serviceKeys?.filter(key => key !== service.key) ?? null; for (const person of draft.staff) person.serviceKeys = person.serviceKeys?.filter(key => key !== service.key) ?? null;
     renderSelection(); renderServices(draft.services[0]?.key);
    }, 'jc-link', `service-remove-${service.key}`)); row.append(title);
    const name = el('input'), duration = el('input'), price = el('input'), category = el('select'), room = el('select'), custom = el('input'), parent = el('input');
    name.value = service.name ?? ''; name.maxLength = 120; name.dataset.testid = `service-name-${service.key}`; name.placeholder = w('مثال: ليزر الجسم كامل', 'For example: Full body laser');
    duration.type = 'number'; duration.min = '1'; duration.max = '1440'; duration.step = '1'; duration.value = service.durationMinutes === null ? '' : String(service.durationMinutes); duration.dataset.testid = `service-duration-${service.key}`;
    price.type = 'number'; price.min = '0'; price.step = '.001'; price.value = service.price ?? ''; price.dataset.testid = `service-price-${service.key}`;
    option(category, '', w('اختر التصنيف', 'Choose category')); for (const value of CATEGORIES) option(category, value, categoryName(value)); category.value = service.category ?? ''; category.dataset.testid = `service-category-${service.key}`;
    option(room, '', w('حدّد', 'Choose')); option(room, 'true', w('نعم', 'Yes')); option(room, 'false', w('لا', 'No')); room.value = service.requiresRoom === null ? '' : String(service.requiresRoom); room.dataset.testid = `service-room-${service.key}`;
    custom.value = customLabels.get(service.key) ?? ''; custom.maxLength = 80; custom.dataset.testid = `service-custom-category-${service.key}`; const customField = labeled(w('اسم التصنيف الآخر / الخدمة الرئيسية', 'Other category / main service name'), custom); customField.classList.add('jc-service-name-field'); customField.hidden = service.category !== 'Other';
    parent.value = service.definition && !GENERIC.includes(service.definition.section) ? section(service) : ''; parent.placeholder = w('حسب التصنيف، أو اكتب اسمًا رئيسيًا', 'By category, or enter a main service name'); parent.maxLength = 80; parent.dataset.testid = `service-parent-${service.key}`; const parentField = labeled(w('الخدمة الرئيسية (اختياري)', 'Main service (optional)'), parent); parentField.hidden = service.category === 'Other';
    const dataList = el('datalist'); dataList.id = `service-groups-${service.key}`; for (const groupName of new Set(draft.services.map(section))) { const value = el('option'); value.value = groupName; dataList.append(value); } parent.setAttribute('list', dataList.id);
    const update = () => {
     const done = ready(service); titleText.textContent = service.name || w('خدمة جديدة', 'New service'); titleText.title = titleText.textContent; badge.textContent = done ? w('جاهزة', 'Ready') : w('تحتاج إكمال', 'Needs details'); badge.dataset.ready = row.dataset.ready = String(done);
     customField.hidden = service.category !== 'Other'; parentField.hidden = service.category === 'Other'; row.dataset.mainService = section(service);
     if (!row.hidden) { groupTitle.textContent = section(service); groupTitle.title = section(service); }
     duration.setAttribute('aria-invalid', String(duration.value !== '' && !validDuration(service.durationMinutes))); price.setAttribute('aria-invalid', String(price.value !== '' && !validPrice(service.price))); refresh();
    };
    name.oninput = () => { service.name = name.value.trim() || null; service.nameLang = service.name ? /[\u0600-\u06ff]/.test(service.name) ? 'ar' : 'en' : null; update(); }; name.onchange = renderSelection;
    duration.oninput = () => { service.durationMinutes = validDuration(Number(duration.value)) && duration.value !== '' ? Number(duration.value) : null; update(); }; price.oninput = () => { service.price = validPrice(price.value) ? price.value : null; update(); };
    category.onchange = () => { categoryManual.add(service.key); const previous = service.category; service.category = (category.value || null) as ServiceDraft['category']; if (service.definition && LABELS[previous ?? 'Other'].includes(service.definition.section)) service.definition.section = categoryName(service.category) || GENERIC[ar ? 0 : 1]!; update(); };
    room.onchange = () => { service.requiresRoom = room.value === '' ? null : room.value === 'true'; update(); };
    custom.oninput = () => { if (service.category !== 'Other') return; customLabels.set(service.key, custom.value.trim()); definition(service).section = custom.value.trim() || GENERIC[ar ? 0 : 1]!; update(); };
    parent.oninput = () => { if (service.category === 'Other') return; definition(service).section = parent.value.trim() || categoryName(service.category) || GENERIC[ar ? 0 : 1]!; update(); };
    const identity = el('div', 'jc-service-batch-fields jc-service-identity'), details = el('div', 'jc-service-batch-fields'), extras = el('div', 'jc-service-batch-fields');
    const nameField = labeled(w('اسم الخدمة الفرعية', 'Service / subservice name'), name); nameField.classList.add('jc-service-name-field'); identity.append(nameField, labeled(w('المدة بالدقائق', 'Duration in minutes'), duration), labeled(w('السعر (د.أ)', 'Price (JOD)'), price));
    details.append(labeled(w('التصنيف', 'Category'), category), labeled(w('تحتاج غرفة؟', 'Needs a room?'), room), customField); extras.append(parentField, dataList);
    if (draft.branches.length > 1) {
     const scope = el('select'); scope.dataset.testid = `service-branch-${service.key}`; option(scope, '', w('اختر فروع الخدمة', 'Choose service scope')); option(scope, 'all', w('كل الفروع', 'All branches')); for (const branch of draft.branches) option(scope, branch.key, branch.name ?? w('الفرع', 'Branch')); scope.value = service.branchScope === 'branch' ? service.branchKey ?? '' : service.branchScope === 'all' ? 'all' : '';
     scope.onchange = () => { service.branchScope = scope.value === '' ? null : scope.value === 'all' ? 'all' : 'branch'; service.branchKey = scope.value && scope.value !== 'all' ? scope.value : null; update(); }; extras.append(labeled(w('الخدمة بأي فرع؟', 'Which branch offers this service?'), scope));
    }
    const followUp = el('label', 'jc-import-follow-up'), check = el('input'); check.type = 'checkbox'; check.checked = service.followUpEnabled ?? false; check.dataset.testid = `service-follow-up-${service.key}`; check.onchange = () => { service.followUpEnabled = check.checked; refresh(); }; followUp.append(check, document.createTextNode(w('رتوش / موعد متابعة — السعر الافتراضي صفر', 'Retouch / follow-up — default price zero')));
    const extraPage = el('div', 'jc-service-part'); extraPage.append(extras, followUp); const parts = compact ? [identity, details, extraPage] : [el('div', 'jc-service-part jc-service-batch-fields'), extraPage]; if (!compact) parts[0]!.append(...identity.children, ...details.children);
    row.append(...parts); const pager = setupPager(row, parts, language, `service-detail-pages-${service.key}`); if (pager) row.insertBefore(pager, parts[0]!); row.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: savedPages.get(row.dataset.testid) ?? 0 }));
    update(); cards.push(row); keys.push(service.key); group.append(row);
   }
   sections.push(group); rows.append(group);
  }
  if (!cards.length) rows.append(el('p', 'jc-room-empty', w('أضف خدمة واحدة على الأقل للمتابعة.', 'Add at least one service to continue.')));
  const updateGroups = (page: number) => { activeKey = keys[page]; sections.forEach(group => { const visible = Array.from(group.querySelectorAll<HTMLElement>('.jc-service-batch-row')).find(row => !row.hidden); group.hidden = !visible; if (visible) { const name = visible.dataset.mainService!; group.querySelector('h3')!.textContent = name; group.dataset.groupName = name; } }); };
  const pager = setupPager(root, cards, language, 'concierge-service-pages', updateGroups); if (pager) root.insertBefore(pager, rows); else updateGroups(0);
  root.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: Math.max(0, keys.indexOf(target ?? '')) })); refresh();
 };
 const addService = (parent?: ServiceDraft) => {
  if (total() >= 50) { setupNotice(language, w('وصلت للحد المتاح', 'Setup limit reached'), w('وصلت للحد الأقصى لبيانات الإعداد. تقدر تضيف خدمات أخرى بعد إكماله.', 'The setup data limit is reached. Add more services after completing setup.')); return; }
  const service = newService(parent); draft.services.push(service); if (service.category === 'Other' && parent) customLabels.set(service.key, section(parent)); renderSelection(); renderServices(service.key);
 };
 bulk.append(button(w('طبّق على الخدمات المحددة', 'Apply to selected services'), () => {
  if (!selected.size) { setupNotice(language, w('اختر الخدمات أولًا', 'Choose services first'), w('حدد الخدمات اللي إلها نفس التفاصيل.', 'Select the services that share these details.')); return; }
  if (bulkCategory.value === 'Other' && !bulkCustom.value.trim()) { setupNotice(language, w('كمّل اسم التصنيف', 'Enter the category name'), w('اكتب اسم التصنيف الآخر قبل تطبيقه.', 'Enter the other category name before applying it.')); return; }
  for (const service of draft.services) {
   if (!selected.has(service.key)) continue;
   if (service.durationMinutes === null && validDuration(Number(bulkDuration.value))) service.durationMinutes = Number(bulkDuration.value); if (service.price === null && validPrice(bulkPrice.value)) service.price = bulkPrice.value;
   if (!originalCategories.get(service.key) && !categoryManual.has(service.key) && bulkCategory.value) service.category = bulkCategory.value as ServiceDraft['category'];
   if (service.category === 'Other' && bulkCategory.value === 'Other') { customLabels.set(service.key, bulkCustom.value.trim()); definition(service).section = bulkCustom.value.trim(); }
   if (service.requiresRoom === null && bulkRoom.value) service.requiresRoom = bulkRoom.value === 'true';
  }
  bulk.open = false; renderServices();
 }, 'jc-button', 'concierge-service-bulk-apply'));
 const saveButton = button('', () => {
  const incomplete = draft.services.filter(service => !ready(service));
  for (const service of incomplete) {
   const fields = { name: !service.name?.trim(), duration: !validDuration(service.durationMinutes), price: !validPrice(service.price), category: !service.category, room: service.requiresRoom === null, 'custom-category': service.category === 'Other' && !customLabels.get(service.key)?.trim(), branch: !service.branchScope || service.branchScope === 'branch' && !service.branchKey };
   for (const [field, invalid] of Object.entries(fields)) if (invalid) root.querySelector(`[data-testid="service-${field}-${service.key}"]`)?.setAttribute('aria-invalid', 'true');
  }
  if (!draft.services.length || incomplete.length) setupNotice(language, w('كمّل باقي البيانات', 'Complete the remaining details'), !draft.services.length ? w('أضف خدمة واحدة على الأقل.', 'Add at least one service.') : incomplete.slice(0, 3).map(service => `${service.name || w('خدمة جديدة', 'New service')}: ${missing(service).join(ar ? '، ' : ', ')}`).join('\n'));
  // Saving this form explicitly reviews the service definitions entered by the clinic manager.
  for (const service of draft.services.filter(ready)) { const value = definition(service); value.section = section(service); if (value.medicalScope === 'needs_review') value.medicalScope = 'medical'; }
  void save(draft, draft.services.length > 0 && incomplete.length === 0);
 }, 'jc-button jc-primary', 'concierge-service-batch-save');
 toolbar.append(progress, button(w('+ إضافة خدمة', '+ Add service'), () => addService(), 'jc-button', 'concierge-service-add'));
 const actions = el('div', 'jc-service-batch-actions'); if (back) actions.append(button(w('رجوع', 'Back'), () => void back(draft), 'jc-button', 'concierge-service-batch-back')); actions.append(saveButton);
 root.append(toolbar, bulk, rows, actions); renderSelection(); renderServices(); return root;
}
