import { draftIssues, type Draft, type Language } from './concierge-core';

export const SETUP_STEPS=['branches','services','rooms','staff'] as const;
export type SetupStep=typeof SETUP_STEPS[number];
type State={serviceWizard?:boolean;draft:Draft;completedSteps?:SetupStep[];companyProfile?:unknown};
const labels={ar:{company:'معلومات المركز',branches:'الفروع ومواعيدها',services:'الخدمات المشتركة',rooms:'الغرف',staff:'الموظفين',review:'المراجعة'},en:{company:'Center identity',branches:'Branches and hours',services:'Shared services',rooms:'Rooms',staff:'Staff',review:'Review'}};
const fields:Record<string,[string,string]>={name:['الاسم','name'],timeZone:['المنطقة الزمنية','time zone'],openingHours:['أيام وساعات الدوام','opening days and hours'],durationMinutes:['مدة الخدمة بالدقائق','duration in minutes'],price:['السعر','price'],currency:['عملة السعر','currency'],category:['نوع الخدمة','service category'],requiresRoom:['هل الخدمة بدها غرفة؟','Does this service need a room?'],branchKey:['الفرع','branch'],capacity:['عدد الزبائن اللي بتستوعبهم الغرفة','room capacity'],serviceKeys:['الخدمات المرتبطة','assigned services'],email:['الإيميل','email'],role:['الدور الوظيفي','staff role'],workingHours:['أيام وساعات العمل','working hours'],breaks:['أوقات الاستراحة، أو تأكيد إنه ما في استراحة','break times, or confirmation of no breaks']};
export function setupWorkflow(state:State,language:Language){
 const ar=language==='ar',completed=state.completedSteps??[];
 if(state.serviceWizard){
  const issues=draftIssues(state.draft).filter(i=>state.draft.services.some(s=>s.key===i.key)&&i.code!=='invalid_reference');
  const active=state.draft.services.find(s=>issues.some(i=>i.key===s.key))??state.draft.services.at(-1);
  const issue=issues.find(i=>i.key===active?.key);
  const step='services' as const;
  const prompt=ar?'شو بدك تغيّر بنظامك؟':'What would you like to change in your system?';
  return {step,label:ar?'تعديل نظام العيادة':'Customize your clinic system',index:0,total:1,prompt,completed,focus:active?{resource:'services',key:active.key,field:issue?.field??'name'}:null};
 }
 // Only missing fields are checked here; reference validation needs authorized DB context.
 const required=draftIssues(state.draft).filter(i=>i.code==='required');
 const step:SetupStep|'company'|'review'=!state.companyProfile?'company':SETUP_STEPS.find(kind=>!completed.includes(kind)||required.some(i=>state.draft[kind].some(row=>row.key===i.key)))??'review';
 let prompt=ar?'شو اسم البيوتي سنتر وبأي مدينة؟':'What is the beauty center name and city?';
 if(step==='review')prompt=ar?'خلصنا التفاصيل، خلّينا نراجعها سوا قبل الحفظ.':'The details are ready. Let’s review them before saving.';
 else if(step!=='company'){
  const row=state.draft[step].find(row=>required.some(i=>i.key===row.key));
  const issue=row?required.find(i=>i.key===row.key):null;
  if(issue){const field=fields[issue.field]?.[ar?0:1]??issue.field;prompt=ar?`${row?.name??labels.ar[step]}: ${issue.field==='requiresRoom'?field:'شو '+field+'؟'}`:`For ${row?.name??labels.en[step]}: ${field}?`;}
  else if(!state.draft[step].length){prompt=({branches:ar?'كم فرع عندك وشو أساميهم؟ بنسجلهم كلهم، وبنكمّل بيانات أول فرع لحاله.':'How many branches do you have, and what are their names? We will list them all, then complete the first branch.',services:ar?'الخدمات والأسعار نفسها بكل الفروع؟ خلّينا نبلّش بأول خدمة.':'Are services and prices shared across branches? What is the first service?',rooms:ar?'شو الغرف الموجودة وبأي فرع؟ إذا ما في، احكي خلصنا القسم.':'What rooms do you have and at which branch? If none, say this section is complete.',staff:ar?'كم موظف عندك؟ خلّينا نبدأ باسم أول موظف.':'How many employees do you have? What is the first employee’s name?'})[step];}
  else prompt=ar?`في إشي ثاني بقسم ${labels.ar[step]}؟ إذا خلصنا احكي «خلصنا القسم» لنكمل.`:`Anything else in ${labels.en[step]}? Say “section complete” when finished.`;
 }
 if((step==='branches'||step==='services')&&!state.draft[step].length){
  const profile=state.companyProfile as {details?:{branches?:{name:string}[];services?:{name:string}[]}}|undefined;
  const found=profile?.details?.[step]?.slice(0,4).map(item=>item.name).join('، ');
  if(found)prompt=ar?(step==='branches'?`لقيت هالفروع بالمصادر: ${found}. هدول فروعك، وفي غيرهم؟`:`لقيت خدمات: ${found}. بتقدموها بكل الفروع؟`):(step==='branches'?`Public sources list ${found}. Are these your branches, and are any missing?`:`Public sources list ${found}. Are these services shared across branches?`);
 }
 const active=step==='company'||step==='review'?null:state.draft[step].find(row=>required.some(i=>i.key===row.key))??state.draft[step].at(-1);
 const focus=step==='company'||step==='review'?null:{resource:step==='staff'?'employees':step,key:active?.key??`pending_${step}`,field:required.find(i=>i.key===active?.key)?.field??'name'};
 return {step,label:labels[language][step],index:step==='company'?0:step==='review'?5:SETUP_STEPS.indexOf(step)+1,total:6,prompt,completed,focus};
}
export function canFinishStep(step:SetupStep,draft:Draft,existing:{branches:{key:string}[];services:{key:string;requiresRoom?:boolean}[];rooms:unknown[]}){
 const issues=draftIssues(draft,existing.branches.map(b=>b.key),existing.services.map(s=>s.key));
 if(issues.some(i=>draft[step].some(row=>row.key===i.key)))return false;
 if(step==='branches')return draft.branches.length+existing.branches.length>0;
 if(step==='services')return draft.services.length+existing.services.length>0;
 if(step==='rooms'&&draft.rooms.length+existing.rooms.length===0)return ![...draft.services,...existing.services].some(s=>s.requiresRoom);
 return true;
}
