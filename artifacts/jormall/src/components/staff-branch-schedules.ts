import { el, button } from './concierge/dom';
import { DAYS, type Week, type Language } from './concierge/contract';
import { createWeeklySchedule } from './weekly-schedule';

export type BranchShift = { branchKey:string;workingHours:Week;breaks:Week };
export type ShiftBranch = { key:string;name:string;timeZone?:string;openingHours?:Week|null };
const empty=()=>Object.fromEntries(DAYS.map(day=>[day,[]])) as unknown as Week;
export function createStaffBranchSchedules(branches:ShiftBranch[],initial:BranchShift[],language:Language,id:string,onChange:(value:BranchShift[])=>void){
 let value=structuredClone(initial);const root=el('fieldset','staff-branch-schedules space-y-3');root.dataset.testid=id;
 const ar=language==='ar',w=(a:string,e:string)=>ar?a:e;
 const choices=el('div','staff-branch-choices'),cards=el('div','staff-branch-cards');
 root.append(el('legend','px-1 font-semibold',w('الفروع وأيام وساعات العمل لكل فرع','Branches and working days/hours per branch')),el('p','text-xs text-muted-foreground',w('اختر الفروع وحدد دوامًا مستقلًا لكل فرع. لا يجوز أن تتداخل أوقات العمل بين الفروع.','Choose branches and set a separate schedule for each. Working times across branches must not overlap.')),choices,cards);
 const emit=()=>onChange(structuredClone(value));
 const render=()=>{
  choices.replaceChildren();cards.replaceChildren();
  for(const branch of branches){const label=el('label','staff-branch-choice'),check=el('input');check.type='checkbox';check.checked=value.some(s=>s.branchKey===branch.key);check.dataset.testid=`${id}-choose-${branch.key}`;check.onchange=()=>{value=check.checked?[...value,{branchKey:branch.key,workingHours:empty(),breaks:empty()}]:value.filter(s=>s.branchKey!==branch.key);render();emit();};label.append(check,document.createTextNode(branch.name));choices.append(label);}
  for(const shift of value){const branch=branches.find(b=>b.key===shift.branchKey);if(!branch)continue;
   const card=el('section','staff-branch-shift');card.dataset.testid=`${id}-card-${shift.branchKey}`;card.append(el('h3','font-semibold',branch.name),el('p','text-xs text-muted-foreground',branch.timeZone??'Asia/Amman'));
   if(branch.openingHours)card.append(button(w('استخدام ساعات عمل هذا الفرع','Use this branch’s opening hours'),()=>{shift.workingHours=structuredClone(branch.openingHours!);render();emit();},'staff-use-branch-hours',`${id}-use-hours-${shift.branchKey}`));
   card.append(createWeeklySchedule(shift,{id:`${id}-${shift.branchKey}`,language},next=>{shift.workingHours=next.workingHours;shift.breaks=next.breaks;emit();}).node);cards.append(card);
  }
 };
 render();return {node:root,setValue(next:BranchShift[]){if(JSON.stringify(next)===JSON.stringify(value))return;value=structuredClone(next);render();}};
}
