import { el, button } from './concierge/dom';
import { DAYS, type Week, type Language } from './concierge/contract';
import { branchHoursFromSchedule, scheduleFromBranchHours, scheduleDayValid, type WeeklySchedule } from './weekly-schedule-rules';
import { setupPager } from './concierge/paging';
import { createTimeInput } from './time-input';

type Day = typeof DAYS[number];
type Options = {
  id: string; language: Language; label?: string; hint?: string;
  hoursKey?: 'workingHours' | 'openingHours'; manualBranch?: boolean; branch?: boolean;
  pagedDays?: boolean;
  sharedHours?: boolean;
};

export function createWeeklySchedule(initial: WeeklySchedule, options: Options, onChange: (value: WeeklySchedule) => void) {
  let value = structuredClone(initial);
  const { id, language, manualBranch = false, branch = false, hoursKey = 'workingHours', pagedDays = false } = options;
  const openingDays = () => DAYS.filter(day => value.workingHours[day].length);
  let commonDay: Day = openingDays()[0] ?? 'mon';
  let sameHours = !!options.sharedHours && openingDays().every(day => JSON.stringify([value.workingHours[day],value.breaks[day]]) === JSON.stringify([value.workingHours[commonDay],value.breaks[commonDay]]));
  const ar = language === 'ar', w = (a: string, e: string) => ar ? a : e;
  const names = ar ? ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const root = el('fieldset', 'weekly-schedule'); root.dataset.testid = id;
  root.classList.toggle('weekly-schedule-paged',pagedDays);
  let activeDay:Day=DAYS.find(day=>value.workingHours[day].length)??'mon';
  const detailPages=new Map<Day,number>();
  const intervalPages=new Map<string,number>();
  const dayChoices=el('div','weekly-schedule-day-choices');
  const sameLabel=el('label','weekly-schedule-shared jc-check'),sameCheck=el('input');
  sameCheck.type='checkbox';sameCheck.dataset.testid=`${id}-same-hours`;sameCheck.checked=sameHours;
  sameLabel.append(sameCheck,document.createTextNode(w('كل أيام الدوام لها نفس ساعات الفتح والاستراحة.','All opening days have the same opening and break hours.')));
  if (options.label) root.append(el('legend', '', options.label));
  root.append(el('p', 'weekly-schedule-hint', options.hint ?? w(
    'حدّد أيام الدوام، ثم انسخ الوقت والبريكات من يوم واحد إلى كل الأيام المحددة في هذا الفرع.',
    'Select working days, then copy one day’s hours and breaks to all selected days at this branch.')));

  const toolbar = el('div', 'weekly-schedule-toolbar'), sourceLabel = el('label'), source = el('select');
  source.dataset.testid = `${id}-copy-day`;
  sourceLabel.append(el('span', '', w('انسخ من', 'Copy from')), source);
  const status = el('p', 'weekly-schedule-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const days = el('div', 'weekly-schedule-days');
  const syncCommon = () => {
    if(!sameHours)return;
    for(const day of openingDays())if(day!==commonDay){value.workingHours[day]=structuredClone(value.workingHours[commonDay]);value.breaks[day]=structuredClone(value.breaks[commonDay]);}
  };
  const emit = () => { syncCommon();status.textContent = ''; refresh(); onChange(structuredClone(value)); };
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
  toolbar.append(sourceLabel, apply);if(options.sharedHours)root.append(sameLabel);if(pagedDays||options.sharedHours)root.append(dayChoices);root.append(toolbar, status, days);
  source.onchange = () => refresh();
  sameCheck.onchange=()=>{sameHours=sameCheck.checked;commonDay=openingDays().includes(source.value as Day)?source.value as Day:openingDays()[0]??'mon';syncCommon();render();emit();};

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
      for (const input of card?.querySelectorAll<HTMLInputElement>('.time-input input') ?? []) {
        const invalid=input.dataset.testid?.includes('-breaks-')?!valid:!scheduleDayValid(value.workingHours[day],[]);
        input.setCustomValidity(invalid?message:''); input.setAttribute('aria-invalid', String(invalid));
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
    root.dataset.sharedHours=String(sameHours);toolbar.hidden=sameHours;
    if(!value.workingHours[commonDay].length)commonDay=openingDays()[0]??'mon';
    for(const day of DAYS){const card=days.querySelector<HTMLElement>(`[data-day="${day}"]`);if(card){detailPages.set(day,Number(card.dataset.setupPage)||0);for(const key of ['hours','breaks'])intervalPages.set(`${day}-${key}`,Number(card.querySelector<HTMLElement>(`.weekly-schedule-${key}`)?.dataset.setupPage)||0);}}
    days.replaceChildren();dayChoices.replaceChildren();
    const showDay=(day:Day)=>{activeDay=day;for(const card of days.children)(card as HTMLElement).hidden=(card as HTMLElement).dataset.day!==day;for(const control of dayChoices.querySelectorAll<HTMLButtonElement>('button'))control.setAttribute('aria-pressed',String(control.dataset.day===day));};
    for (const [index, day] of DAYS.entries()) {
      const card = el('section', 'weekly-schedule-day'); card.dataset.day = day;
      const header = el('div', 'weekly-schedule-day-header'), label = el('label'), check = el('input');
      check.type = 'checkbox'; check.checked = value.workingHours[day].length > 0; check.dataset.testid = checkId(day);
      label.append(check, document.createTextNode(names[index]!)); header.append(label);
      if(pagedDays){
        check.setAttribute('aria-label',names[index]!);label.replaceChildren(check);
        const dayName=innerWidth<=640?(ar?['اثن','ثلا','أرب','خمي','جمع','سبت','أحد'][index]!:names[index]!.slice(0,3)):names[index]!;
        const edit=button(dayName,()=>showDay(day),'weekly-schedule-day-select',`${id}-day-${day}`);edit.title=names[index]!;edit.setAttribute('aria-label',names[index]!);edit.dataset.day=day;edit.setAttribute('aria-pressed',String(activeDay===day));header.append(edit);dayChoices.append(header);card.hidden=activeDay!==day;
        card.append(el('h4','weekly-schedule-active-day',names[index]!));
      }
      if (!check.checked) header.append(el('span', 'weekly-schedule-closed', w('إجازة', 'Closed')));
      if(options.sharedHours){dayChoices.append(header);card.append(el('h4','weekly-schedule-active-day',sameHours?w('ساعات كل أيام الدوام المحددة','Hours for all selected opening days'):names[index]!));card.hidden=!check.checked||sameHours&&day!==commonDay;}
      else if(!pagedDays)card.append(header);
      check.onchange = () => {
        if(check.checked===!!value.workingHours[day].length)return;
        value.workingHours[day] = check.checked ? sameHours&&value.workingHours[commonDay].length?structuredClone(value.workingHours[commonDay]):[{ open: '09:00', close: '17:00' }] : [];
        if(check.checked&&sameHours)value.breaks[day]=structuredClone(value.breaks[commonDay]);
        if (!check.checked) value.breaks[day] = [];
        render(); emit();
      };
      if (check.checked) {
        const workPart=el('div','weekly-schedule-work-part');
        const ranges = (key: 'workingHours' | 'breaks', host: HTMLElement) => {
          value[key][day].forEach((range, rangeIndex) => {
            const row = el('div', 'weekly-schedule-range');
            for (const part of ['open', 'close'] as const) {
              const label = el('div');
              const clock = createTimeInput({ value: range[part], required: true, language,
                testId: inputId(key, day, rangeIndex, part),
                label: `${names[index]} ${key === 'breaks' ? w('بريك', 'break') : w('دوام', 'work')} ${part === 'open' ? w('من', 'from') : w('إلى', 'to')}`,
                onChange: next => { range[part] = next; emit(); } });
              const caption = el('label', '', key==='breaks'?(part==='open'?w('الاستراحة من','Break From'):w('الاستراحة إلى','Break To')):branch?(part==='open'?w('الفتح من','Opening From'):w('الفتح إلى','Opening To')):part === 'open' ? w('من', 'From') : w('إلى', 'To')); caption.htmlFor = clock.input.id;
              label.className = 'weekly-schedule-clock'; label.append(caption, clock.node); row.append(label);
            }
            if (key === 'breaks' || value[key][day].length > 1) {
              const remove = button('×', () => { value[key][day].splice(rangeIndex, 1); render(); emit(); }, 'weekly-schedule-remove', `${id}-${key}-${day}-${rangeIndex}-remove`);
              remove.setAttribute('aria-label', w(key === 'breaks' ? 'حذف البريك' : 'حذف فترة الدوام', key === 'breaks' ? 'Remove break' : 'Remove work interval')); row.append(remove);
            }
            host.append(row);
          });
        };
        const hours = el('div', 'weekly-schedule-hours'); ranges('workingHours', hours); workPart.append(hours);
        if (value.workingHours[day].length < 8) workPart.append(button(w('فترة دوام إضافية', 'Add work interval'), () => {
          const close = value.workingHours[day].at(-1)!.close;
          const start = minutes(close);
          value.workingHours[day].push({ open: close, close: time(Math.min(start + 60, 1439)) }); render(); emit();
        }, 'weekly-schedule-add-interval', `${id}-${hoursKey}-${day}-add`));
        const breaks = el('div', 'weekly-schedule-breaks'), breakHeader = el('div', 'weekly-schedule-break-header');
        breakHeader.append(el('span', '', w('البريكات (اختياري)', 'Breaks (optional)')));
        if (value.breaks[day].length < 8) breakHeader.append(button(w('+ إضافة بريك', '+ Add break'), () => addBreak(day), 'weekly-schedule-add-break', `${id}-breaks-${day}-add`));
        breaks.append(breakHeader); ranges('breaks', breaks);
        card.append(workPart,breaks);
        if(pagedDays){
          const pager=setupPager(card,[workPart,breaks],language,`${id}-${day}-detail-pages`);
          if(pager){const caption=pager.querySelector('span')!;const label=()=>{caption.textContent=Number(card.dataset.setupPage)?w('البريكات','Breaks'):w('ساعات الدوام','Working hours');};pager.addEventListener('click',label);card.insertBefore(pager,workPart);card.dispatchEvent(new CustomEvent('jormall:setup-page',{detail:detailPages.get(day)??0}));label();}
          for(const [host,key]of [[hours,'hours'],[breaks,'breaks']]as const){const rows=Array.from(host.querySelectorAll<HTMLElement>(':scope > .weekly-schedule-range'));const nav=setupPager(host,rows,language,`${id}-${day}-${key}-pages`);if(nav)host.append(nav);host.dispatchEvent(new CustomEvent('jormall:setup-page',{detail:intervalPages.get(`${day}-${key}`)??0}));}
        }
      }else if(pagedDays){card.append(el('p','weekly-schedule-hint',w('يوم إجازة. حدّد هذا اليوم من الأعلى لإضافة الدوام.','Closed. Select this day above to add working hours.')));
      }
      const error = el('p', 'weekly-schedule-error'); error.setAttribute('role', 'alert'); error.hidden = true; card.append(error); days.append(card);
    }
    refresh();
  }
  render();
  root.addEventListener('jormall:schedule-refresh', refresh);
  root.addEventListener('jormall:schedule-reveal',event=>{
    if(!pagedDays)return;const testId=String((event as CustomEvent).detail),input=Array.from(days.querySelectorAll<HTMLInputElement>('input')).find(node=>node.dataset.testid===testId);if(!input)return;
    const card=input.closest<HTMLElement>('.weekly-schedule-day')!;activeDay=card.dataset.day as Day;for(const node of days.children)(node as HTMLElement).hidden=node!==card;
    for(const button of dayChoices.querySelectorAll('button'))button.setAttribute('aria-pressed',String((button as HTMLElement).dataset.day===activeDay));
    const breaks=!!input.closest('.weekly-schedule-breaks');card.dispatchEvent(new CustomEvent('jormall:setup-page',{detail:breaks?1:0}));const host=input.closest<HTMLElement>('.weekly-schedule-hours,.weekly-schedule-breaks');const rows=Array.from(host?.querySelectorAll(':scope > .weekly-schedule-range')??[]);host?.dispatchEvent(new CustomEvent('jormall:setup-page',{detail:rows.indexOf(input.closest('.weekly-schedule-range')!)}));
  });
  return { node: root, setValue(next: WeeklySchedule) { if (JSON.stringify(next) === JSON.stringify(value)) return; value = structuredClone(next); render(); } };
}

export function createBranchHoursEditor(initial: Week, options: Options, onChange: (value: Week) => void) {
  let external = JSON.stringify(initial);
  const editor = createWeeklySchedule(scheduleFromBranchHours(initial), { ...options, hoursKey: 'openingHours', branch: true }, next => {
    const encoded = branchHoursFromSchedule(next); external = JSON.stringify(encoded); onChange(encoded);
  });
  return { node: editor.node, setValue(next: Week) { const signature = JSON.stringify(next); if (signature === external) return; external = signature; editor.setValue(scheduleFromBranchHours(next)); } };
}
