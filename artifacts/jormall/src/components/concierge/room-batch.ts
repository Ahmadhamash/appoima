import { type Draft, type Language, type RoomDraft } from './contract';
import { button, el } from './dom';
import { setupPager } from './paging';
import { setupNotice } from './setup-notice';

export function buildRoomBatch(source: Draft, language: Language, save: (draft: Draft, advance: boolean) => Promise<void>, back: (draft: Draft) => Promise<void>, changed: (draft: Draft) => void): HTMLElement {
 const draft = structuredClone(source), ar = language === 'ar', w = (arabic: string, english: string) => ar ? arabic : english;
 const root = el('section', 'jc-service-batch jc-room-batch'); root.dataset.testid = 'concierge-room-batch';
 const eligible = (room: RoomDraft) => draft.services.filter(service => service.branchScope === 'all' || service.branchKey === room.branchKey);
 for (const room of draft.rooms) {
  if (!room.branchKey && draft.branches.length === 1) room.branchKey = draft.branches[0]!.key;
  // A missing assignment is an unanswered choice, never permission to select every service.
  room.serviceKeys ??= [];
 }
 const ready = (room: RoomDraft) => !!room.name?.trim() && !!room.branchKey && draft.branches.some(branch => branch.key === room.branchKey) && room.capacity !== null && Number.isInteger(room.capacity) && room.capacity >= 1 && room.capacity <= 1000 && !!room.serviceKeys?.length && room.serviceKeys.every(key => eligible(room).some(service => service.key === key));
 const uncovered = () => draft.services.filter(service => service.requiresRoom && !draft.rooms.some(room => ready(room) && room.serviceKeys?.includes(service.key)));
 const progress = el('p', 'jc-service-batch-progress'); progress.setAttribute('role', 'status');
 const toolbar = el('div', 'jc-room-toolbar');
 const list = el('div', 'jc-room-list'); list.dataset.testid = 'concierge-room-list';
 const actions = el('div', 'jc-service-batch-actions');
 const saveButton = button('', () => {
  const incomplete = draft.rooms.some(room => !ready(room)), missing = uncovered();
  if (incomplete || missing.length) setupNotice(language, w('كمّل باقي البيانات', 'Complete the remaining details'), incomplete ? w('كمّل اسم كل غرفة، فرعها، سعتها والخدمات اللي بتنعمل فيها. بنحفظ تقدمك وبنضل بنفس الخطوة.', 'Complete each room name, branch, capacity and assigned services. Progress is saved without advancing.') : w(`اربط الخدمات اللي بتحتاج غرفة بغرفة مناسبة: ${missing.slice(0, 3).map(service => service.name).join('، ')}${missing.length > 3 ? '…' : ''}`, `Assign a suitable room to services that need one: ${missing.slice(0, 3).map(service => service.name).join(', ')}${missing.length > 3 ? '…' : ''}`));
  void save(draft, !incomplete && !missing.length);
 }, 'jc-button jc-primary', 'concierge-room-batch-save');
 const refresh = () => {
  progress.textContent = w(`اكتملت ${draft.rooms.filter(ready).length} من ${draft.rooms.length} غرفة`, `${draft.rooms.filter(ready).length} of ${draft.rooms.length} rooms ready`);
  saveButton.textContent = !draft.rooms.length ? w('ما عندي غرف، نكمل', 'No rooms, continue') : draft.rooms.every(ready) && !uncovered().length ? w('حفظ الغرف والمتابعة', 'Save rooms and continue') : w('حفظ التقدم', 'Save progress');
  changed(draft);
 };
 const renderRooms = (page = Number(list.dataset.setupPage) || 0) => {
  list.replaceChildren(); delete list.dataset.setupPage;
  if (!draft.rooms.length) list.append(el('p', 'jc-room-empty', w('أضف الغرف الموجودة بمركزك. إذا خدمة بتحتاج غرفة، لازم تربطها بغرفة قبل المتابعة.', 'Add the rooms in your clinic. Services requiring a room must have an assigned room before continuing.')));
  const cards = draft.rooms.map((room, index) => {
   const card = el('article', 'jc-service-batch-row'); card.dataset.testid = `concierge-room-${room.key}`;
   const title = el('div', 'jc-service-batch-title'), nameLabel = el('strong'), badge = el('span', 'jc-service-state');
   const update = () => { nameLabel.textContent = room.name?.trim() || w('غرفة جديدة', 'New room'); nameLabel.title = nameLabel.textContent; badge.textContent = ready(room) ? w('جاهزة', 'Ready') : w('تحتاج إكمال', 'Needs details'); badge.dataset.ready = card.dataset.ready = String(ready(room)); refresh(); };
   const remove = button(w('حذف', 'Remove'), () => { draft.rooms.splice(index, 1); renderRooms(Math.min(index, draft.rooms.length - 1)); }, 'jc-link', `room-remove-${room.key}`);
   title.append(el('span', 'jc-service-index', String(index + 1)), nameLabel, badge, remove); card.append(title);
   const fields = el('div', 'jc-service-batch-fields jc-room-fields'), name = el('input'), branch = el('select'), capacity = el('input');
   const labeled = (label: string, input: HTMLElement) => { const field = el('label', 'jc-service-field'); field.append(el('span', '', label), input); return field; };
   name.value = room.name ?? ''; name.maxLength = 120; name.dataset.testid = `room-name-${room.key}`;
   name.oninput = () => { room.name = name.value.trim() || null; room.nameLang = room.name ? /[\u0600-\u06ff]/.test(name.value) ? 'ar' : 'en' : null; update(); };
   const option = (value: string, label: string) => { const item = el('option', '', label); item.value = value; branch.append(item); };
   option('', w('اختر الفرع', 'Choose branch')); for (const item of draft.branches) option(item.key, item.name ?? w('فرع', 'Branch')); branch.value = room.branchKey ?? ''; branch.dataset.testid = `room-branch-${room.key}`;
   capacity.type = 'number'; capacity.min = '1'; capacity.max = '1000'; capacity.step = '1'; capacity.value = room.capacity === null ? '' : String(room.capacity); capacity.dataset.testid = `room-capacity-${room.key}`;
   capacity.oninput = () => { room.capacity = capacity.value === '' ? null : Number(capacity.value); capacity.setAttribute('aria-invalid', String(capacity.value !== '' && (!Number.isInteger(room.capacity) || room.capacity! < 1 || room.capacity! > 1000))); update(); };
   fields.append(labeled(w('اسم الغرفة', 'Room name'), name), labeled(w('الفرع', 'Branch'), branch), labeled(w('عدد الأشخاص بنفس الوقت', 'People at the same time'), capacity)); card.append(fields);
   const assignments = el('div', 'jc-room-services'); assignments.dataset.testid = `room-services-${room.key}`;
   const renderAssignments = () => {
    assignments.replaceChildren(el('strong', '', w('الخدمات في هاي الغرفة', 'Services in this room')));
    const services = eligible(room), pageSize = services.some(service => (service.name?.length ?? 0) > 45) ? 1 : 4;
    const choices = el('div', pageSize === 1 ? 'jc-room-choices jc-room-single-choice' : 'jc-room-choices'), parts: HTMLElement[] = [];
    for (let offset = 0; offset < services.length; offset += pageSize) {
     const part = el('div', 'jc-service-bulk-choices');
     for (const service of services.slice(offset, offset + pageSize)) {
      const label = el('label', 'jc-check'), check = el('input'); check.type = 'checkbox'; check.checked = !!room.serviceKeys?.includes(service.key); check.dataset.testid = `room-service-${room.key}-${service.key}`;
      check.onchange = () => { room.serviceKeys = check.checked ? [...new Set([...room.serviceKeys ?? [], service.key])] : (room.serviceKeys ?? []).filter(key => key !== service.key); update(); };
      const labelText = service.name ?? w('خدمة', 'Service'); label.title = labelText;
      label.append(check, el('span', '', labelText)); part.append(label);
     }
     parts.push(part); choices.append(part);
    }
    if (!services.length) choices.append(el('p', '', w('اختر فرع الغرفة حتى تظهر خدماته.', 'Choose a branch to see its services.')));
    const pager = setupPager(choices, parts, language, `room-service-pages-${room.key}`); if (pager) choices.prepend(pager); assignments.append(choices);
   };
   branch.onchange = () => { if (room.branchKey === (branch.value || null)) return; room.branchKey = branch.value || null; room.serviceKeys = (room.serviceKeys ?? []).filter(key => eligible(room).some(service => service.key === key)); renderAssignments(); update(); };
   renderAssignments(); card.append(assignments);
   const detailsPager = setupPager(card, [fields, assignments], language, `room-detail-pages-${room.key}`); if (detailsPager) card.insertBefore(detailsPager, fields);
   update(); return card;
  });
  list.append(...cards); const pager = setupPager(list, cards, language, 'concierge-room-pages'); if (pager) list.prepend(pager);
  list.dispatchEvent(new CustomEvent('jormall:setup-page', { detail: page })); refresh();
 };
 const add = button(w('+ أضف غرفة', '+ Add room'), () => {
  if (Object.values(draft).reduce((total, rows) => total + rows.length, 0) >= 50) { setupNotice(language, w('وصلت للحد المتاح', 'Setup limit reached'), w('وصلت للحد الأقصى لبيانات الإعداد. تقدر تضيف الغرف الإضافية من قسم الغرف بعد إكماله.', 'The setup data limit is reached. You can add further rooms from the rooms page after completing setup.')); return; }
  draft.rooms.push({ key: `room_${crypto.randomUUID().replaceAll('-', '')}`, name: null, nameLang: null, branchKey: draft.branches.length === 1 ? draft.branches[0]!.key : null, capacity: null, serviceKeys: [] }); renderRooms(draft.rooms.length - 1);
 }, 'jc-button', 'concierge-room-add');
 toolbar.append(progress, add); actions.append(button(w('رجوع', 'Back'), () => void back(draft), 'jc-button', 'concierge-room-batch-back'), saveButton);
 root.append(toolbar, list, actions); renderRooms(); return root;
}
