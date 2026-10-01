import { el, button } from './concierge/dom';
import { DAYS, type Week, type Language } from './concierge/contract';
import { branchHoursFromSchedule, scheduleFromBranchHours, scheduleDayValid, type WeeklySchedule } from './weekly-schedule-rules';

type Day = typeof DAYS[number];
type Options = {
  id: string; language: Language; label?: string; hint?: string;
  hoursKey?: 'workingHours' | 'openingHours'; manualBranch?: boolean; branch?: boolean;
};

export function createWeeklySchedule(initial: WeeklySchedule, options: Options, onChange: (value: WeeklySchedule) => void) {
  let value = structuredClone(initial);
  const { id, language, manualBranch = false, branch = false, hoursKey = 'workingHours' } = options;
  const ar = language === 'ar', w = (a: string, e: string) => ar ? a : e;
  const names = ar ? ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const root = el('fieldset', 'weekly-schedule'); root.dataset.testid = id;
  if (options.label) root.append(el('legend', '', options.label));
  root.append(el('p', 'weekly-schedule-hint', options.hint ?? w(
    'حدّد أيام الدوام، ثم انسخ الوقت والبريكات من يوم واحد إلى كل الأيام المحددة في هذا الفرع.',
    'Select working days, then copy one day’s hours and breaks to all selected days at this branch.')));

  const toolbar = el('div', 'weekly-schedule-toolbar'), sourceLabel = el('label'), source = el('select');
  source.dataset.testid = `${id}-copy-day`;
  sourceLabel.append(el('span', '', w('انسخ من', 'Copy from')), source);
  const status = el('p', 'weekly-schedule-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const days = el('div', 'weekly-schedule-days');
  const emit = () => { status.textContent = ''; refresh(); onChange(structuredClone(value)); };
  const validDay = (day: Day) => scheduleDayValid(value.workingHours[day], value.breaks[day]) &&
    (!branch || branchHoursFromSchedule(value)[day].every(range => !!range.open && !!range.close));
  const apply = button(w('تطبيق على الكل', 'Apply to all'), () => {
    const day = source.value as Day;
    if (!DAYS.includes(day) || !value.workingHours[day].length || !validDay(day)) return;
    const selected = DAYS.filter(d => value.workingHours[d].length);
    for (const target of selected) {
      value.workingHours[target] = structuredClone(value.workingHours[day]);
      value.breaks[target] = structuredClone(value.breaks[day]);
    }
    render(); onChange(structuredClone(value));
    status.textContent = w(`تم تطبيق الوقت والبريكات على ${selected.length} أيام دوام.`, `Hours and breaks applied to ${selected.length} working days.`);
  }, 'weekly-schedule-apply', `${id}-apply-all`);
  toolbar.append(sourceLabel, apply); root.append(toolbar, status, days);
  source.onchange = () => refresh();

  const checkId = (day: Day) => manualBranch ? `${id}-${day}-open` : `${id}-${hoursKey}-${day}`;
  const inputId = (key: 'workingHours' | 'breaks', day: Day, index: number, part: 'open' | 'close') =>
    manualBranch && key === 'workingHours' ? `${id}-${day}-${index}-${part === 'open' ? 'from' : 'to'}` :
      `${id}-${key === 'workingHours' ? hoursKey : key}-${day}-${index}-${part}`;

  function refresh() {
    const chosen = source.value;
    source.replaceChildren();
    for (const [index, day] of DAYS.entries()) if (value.workingHours[day].length) {
      const option = el('option', '', names[index]); option.value = day; source.append(option);
    }
    if (DAYS.includes(chosen as Day) && value.workingHours[chosen as Day].length) source.value = chosen;
    source.disabled = !source.options.length;
    const day = source.value as Day;
    apply.disabled = !day || !validDay(day) || DAYS.filter(d => value.workingHours[d].length).length < 2;
    for (const day of DAYS) {
      const valid = validDay(day), card = days.querySelector<HTMLElement>(`[data-day="${day}"]`);
      const message = valid ? '' : w('راجع الأوقات: النهاية بعد البداية، والبريكات ضمن الدوام وبدون تداخل (حتى 8 فترات).', 'Check times: the end must follow the start; breaks must fit within work hours without overlap (up to 8 intervals).');
      for (const input of card?.querySelectorAll<HTMLInputElement>('input[type=time]') ?? []) {
        input.setCustomValidity(message); input.setAttribute('aria-invalid', String(!valid));
      }
      const error = card?.querySelector<HTMLElement>('.weekly-schedule-error');
      if (error) { error.textContent = message; error.hidden = valid; }
    }
  }

  const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  function addBreak(day: Day) {
    const range = value.workingHours[day][0];
    const start = range ? minutes(range.open) : 540, end = range ? minutes(range.close) : 1020;
    const previous = value.breaks[day].at(-1);
    const from = previous ? minutes(previous.close) : Math.floor((start + end) / 2);
    value.breaks[day].push({ open: time(from), close: time(Math.min(from + 30, end)) });
    render(); emit();
  }

  function render() {
    days.replaceChildren();
    for (const [index, day] of DAYS.entries()) {
      const card = el('section', 'weekly-schedule-day'); card.dataset.day = day;
      const header = el('div', 'weekly-schedule-day-header'), label = el('label'), check = el('input');
      check.type = 'checkbox'; check.checked = value.workingHours[day].length > 0; check.dataset.testid = checkId(day);
      label.append(check, document.createTextNode(names[index]!)); header.append(label);
      if (!check.checked) header.append(el('span', 'weekly-schedule-closed', w('إجازة', 'Closed')));
      card.append(header);
      check.onchange = () => {
        value.workingHours[day] = check.checked ? [{ open: '09:00', close: '17:00' }] : [];
        if (!check.checked) value.breaks[day] = [];
        render(); emit();
      };
      if (check.checked) {
        const ranges = (key: 'workingHours' | 'breaks', host: HTMLElement) => {
          value[key][day].forEach((range, rangeIndex) => {
            const row = el('div', 'weekly-schedule-range');
            for (const part of ['open', 'close'] as const) {
              const label = el('label'), input = el('input'); input.type = 'time'; input.required = true; input.value = range[part]; input.dir = 'ltr';
              input.dataset.testid = inputId(key, day, rangeIndex, part);
              input.setAttribute('aria-label', `${names[index]} ${key === 'breaks' ? w('بريك', 'break') : w('دوام', 'work')} ${part === 'open' ? w('من', 'from') : w('إلى', 'to')}`);
              input.oninput = () => { range[part] = input.value; emit(); };
              label.append(el('span', '', part === 'open' ? w('من', 'From') : w('إلى', 'To')), input); row.append(label);
            }
            if (key === 'breaks' || value[key][day].length > 1) {
              const remove = button('×', () => { value[key][day].splice(rangeIndex, 1); render(); emit(); }, 'weekly-schedule-remove', `${id}-${key}-${day}-${rangeIndex}-remove`);
              remove.setAttribute('aria-label', w(key === 'breaks' ? 'حذف البريك' : 'حذف فترة الدوام', key === 'breaks' ? 'Remove break' : 'Remove work interval')); row.append(remove);
            }
            host.append(row);
          });
        };
        const hours = el('div', 'weekly-schedule-hours'); ranges('workingHours', hours); card.append(hours);
        if (value.workingHours[day].length < 8) card.append(button(w('فترة دوام إضافية', 'Add work interval'), () => {
          const close = value.workingHours[day].at(-1)!.close;
          const start = minutes(close);
          value.workingHours[day].push({ open: close, close: time(Math.min(start + 60, 1439)) }); render(); emit();
        }, 'weekly-schedule-add-interval', `${id}-${hoursKey}-${day}-add`));
        const breaks = el('div', 'weekly-schedule-breaks'), breakHeader = el('div', 'weekly-schedule-break-header');
        breakHeader.append(el('span', '', w('البريكات (اختياري)', 'Breaks (optional)')));
        if (value.breaks[day].length < 8) breakHeader.append(button(w('+ إضافة بريك', '+ Add break'), () => addBreak(day), 'weekly-schedule-add-break', `${id}-breaks-${day}-add`));
        breaks.append(breakHeader); ranges('breaks', breaks); card.append(breaks);
      }
      const error = el('p', 'weekly-schedule-error'); error.setAttribute('role', 'alert'); error.hidden = true; card.append(error); days.append(card);
    }
    refresh();
  }
  render();
  root.addEventListener('jormall:schedule-refresh', refresh);
  return { node: root, setValue(next: WeeklySchedule) { if (JSON.stringify(next) === JSON.stringify(value)) return; value = structuredClone(next); render(); } };
}

export function createBranchHoursEditor(initial: Week, options: Options, onChange: (value: Week) => void) {
  let external = JSON.stringify(initial);
  const editor = createWeeklySchedule(scheduleFromBranchHours(initial), { ...options, hoursKey: 'openingHours', branch: true }, next => {
    const encoded = branchHoursFromSchedule(next); external = JSON.stringify(encoded); onChange(encoded);
  });
  return { node: editor.node, setValue(next: Week) { const signature = JSON.stringify(next); if (signature === external) return; external = signature; editor.setValue(scheduleFromBranchHours(next)); } };
}
