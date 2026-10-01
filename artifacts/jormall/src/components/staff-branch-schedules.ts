import { el, button } from './concierge/dom';
import { DAYS, type Week, type Language } from './concierge/contract';

export type BranchShift = { branchKey:string;workingHours:Week;breaks:Week };
export type ShiftBranch = { key:string;name:string;timeZone?:string;openingHours?:Week|null };
const empty=()=>Object.fromEntries(DAYS.map(day=>[day,[]])) as unknown as Week;
export function createStaffBranchSchedules(branches:ShiftBranch[],initial:BranchShift[],language:Language,id:string,onChange:(value:BranchShift[])=>void){
 let value=structuredClone(initial);const root=el('fieldset','staff-branch-schedules space-y-3');root.dataset.testid=id;
 const ar=language==='ar',w=(a:string,e:string)=>ar?a:e;
 const choices=el('div','staff-branch-choices'),cards=el('div','staff-branch-cards');
 root.append(el('legend','px-1 font-semibold',w('الفروع وأيام وساعات العمل لكل فرع','Branches and working days/hours per branch')),el('p','text-xs text-muted-foreground',w('اختر الفروع وحدد دوامًا مستقلًا لكل فرع. لا يجوز أن تتداخل أوقات العمل بين الفروع.','Choose branches and set a separate schedule for each. Working times across branches must not overlap.')),choices,cards);
 const emit=()=>onChange(structuredClone(value));
 const scheduleEditor=(shift:BranchShift,key:'workingHours'|'breaks',host:HTMLElement)=>{
  const labels=ar?['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد']:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  DAYS.forEach((day,index)=>{
   const row=el('div','staff-shift-day'),label=el('label','staff-shift-day-label'),check=el('input');check.type='checkbox';check.checked=shift[key][day].length>0;check.dataset.testid=`${id}-${shift.branchKey}-${key}-${day}`;label.append(check,document.createTextNode(labels[index]!));row.append(label);
   const ranges=el('div','staff-shift-ranges');row.append(ranges);
   const draw=()=>{ranges.replaceChildren();shift[key][day].forEach((range,i)=>{
    const group=el('div','staff-shift-range');
    for(const part of ['open','close'] as const){const input=el('input');input.type='time';input.required=true;input.value=range[part];input.dataset.testid=`${id}-${shift.branchKey}-${key}-${day}-${i}-${part}`;input.setAttribute('aria-label',`${labels[index]} ${part==='open'?w('من','from'):w('إلى','to')}`);input.oninput=()=>{range[part]=input.value;emit();};group.append(input);}
    if(shift[key][day].length>1)group.append(button('×',()=>{shift[key][day].splice(i,1);draw();emit();},'staff-shift-remove'));
    ranges.append(group);
   });if(shift[key][day].length&&shift[key][day].length<8)ranges.append(button(w('فترة إضافية','Add shift'),()=>{shift[key][day].push({open:'17:00',close:'18:00'});draw();emit();},'staff-shift-add'));};
   check.onchange=()=>{shift[key][day]=check.checked?[{open:'09:00',close:'17:00'}]:[];draw();emit();};draw();host.append(row);
  });
 };
 const render=()=>{
  choices.replaceChildren();cards.replaceChildren();
  for(const branch of branches){const label=el('label','staff-branch-choice'),check=el('input');check.type='checkbox';check.checked=value.some(s=>s.branchKey===branch.key);check.dataset.testid=`${id}-choose-${branch.key}`;check.onchange=()=>{value=check.checked?[...value,{branchKey:branch.key,workingHours:empty(),breaks:empty()}]:value.filter(s=>s.branchKey!==branch.key);render();emit();};label.append(check,document.createTextNode(branch.name));choices.append(label);}
  for(const shift of value){const branch=branches.find(b=>b.key===shift.branchKey);if(!branch)continue;
   const card=el('section','staff-branch-shift');card.dataset.testid=`${id}-card-${shift.branchKey}`;card.append(el('h3','font-semibold',branch.name),el('p','text-xs text-muted-foreground',branch.timeZone??'Asia/Amman'));
   if(branch.openingHours)card.append(button(w('استخدام ساعات عمل هذا الفرع','Use this branch’s opening hours'),()=>{shift.workingHours=structuredClone(branch.openingHours!);render();emit();},'staff-use-branch-hours',`${id}-use-hours-${shift.branchKey}`));
   scheduleEditor(shift,'workingHours',card);
   const breaks=el('details','staff-branch-breaks');breaks.append(el('summary','',w('الاستراحات في هذا الفرع (اختياري)','Breaks at this branch (optional)')));scheduleEditor(shift,'breaks',breaks);card.append(breaks);cards.append(card);
  }
 };
 render();return {node:root,setValue(next:BranchShift[]){if(JSON.stringify(next)===JSON.stringify(value))return;value=structuredClone(next);render();}};
}
