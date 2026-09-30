import { draftIssues, type Draft, type Language } from './concierge-core';

export const SETUP_STEPS=['branches','services','rooms','staff'] as const;
export type SetupStep=typeof SETUP_STEPS[number];
export function previousSetupStep(step:SetupStep|'company'|'review',completed:SetupStep[]):{previous:SetupStep|'company';completed:SetupStep[]}{
 const previous=step==='review'?'staff':SETUP_STEPS[Math.max(0,SETUP_STEPS.indexOf(step as SetupStep))-1]??'company';
 const index=SETUP_STEPS.indexOf(previous as SetupStep);
 return {previous,completed:index<0?[]:completed.filter(item=>SETUP_STEPS.indexOf(item)<index)};
}
type State={serviceWizard?:boolean;draft:Draft;completedSteps?:SetupStep[];companyProfile?:unknown};
const labels={ar:{company:'معلومات المركز',branches:'الفروع ومواعيدها',services:'الخدمات',rooms:'الغرف',staff:'الموظفين',review:'المراجعة'},en:{company:'Center identity',branches:'Branches and hours',services:'Services',rooms:'Rooms',staff:'Staff',review:'Review'}};
const fields:Record<string,[string,string]>={name:['الاسم','name'],timeZone:['المنطقة الزمنية','time zone'],openingHours:['أيام وساعات الدوام','opening days and hours'],durationMinutes:['مدة الخدمة بالدقائق','duration in minutes'],price:['السعر بالدينار الأردني','price in Jordanian dinars'],category:['نوع الخدمة','service category'],customCategory:['اسم التصنيف الآخر','other category name'],requiresRoom:['هل الخدمة بدها غرفة؟','Does this service need a room?'],branchScope:['الفروع اللي بتقدم الخدمة','branches offering this service'],branchKey:['الفرع','branch'],capacity:['عدد الزبائن اللي بتستوعبهم الغرفة','room capacity'],serviceKeys:['الخدمات المرتبطة','assigned services'],email:['الإيميل','email'],role:['الدور الوظيفي','staff role'],workingHours:['أيام وساعات العمل','working hours'],breaks:['أوقات الاستراحة، أو تأكيد إنه ما في استراحة','break times, or confirmation of no breaks']};
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
 const required=draftIssues(state.draft).filter(i=>i.code==='required'&&i.field!=='currency');
 const step:SetupStep|'company'|'review'=!state.companyProfile?'company':SETUP_STEPS.find(kind=>!completed.includes(kind)||required.some(i=>state.draft[kind].some(row=>row.key===i.key)))??'review';
 let prompt=ar?'شو اسم البيوتي سنتر وبأي مدينة؟':'What is the beauty center name and city?';
 if(step==='review')prompt=ar?'خلصنا التفاصيل، خلّينا نراجعها سوا قبل الحفظ.':'The details are ready. Let’s review them before saving.';
 else if(step!=='company'){
  const row=state.draft[step].find(row=>required.some(i=>i.key===row.key));
  const issue=row?required.find(i=>i.key===row.key):null;
  if(step==='rooms'&&issue?.field==='name'&&state.draft.rooms.length>1){const named=state.draft.rooms.filter(room=>room.name?.trim()).length,unnamed=state.draft.rooms.length-named;prompt=ar?`لقيت ${named} غرف بأسمائها و${unnamed} بدون اسم. احكيلي أسماء الغرف الباقية مع بعض، أو اضغط «اعتماد الغرف المسماة» إذا هاي كل الغرف.`:`I found ${named} named rooms and ${unnamed} without names. Tell me the remaining names together, or choose “Keep named rooms” if that is all.`;}
  else if(step==='services'&&state.draft.services.length>1&&issue){prompt=ar?`عندك ${state.draft.services.length} خدمة. كمّل تفاصيل كل خدمة: المدة والسعر بالدينار والتصنيف واحتياج الغرفة والفرع. ممكن تختار خدمات محددة إذا فعلًا إلها نفس التفاصيل.`:`You have ${state.draft.services.length} services. Complete each service’s duration, JOD price, category, room choice and branch. Select shared details only for services that actually match.`;}
  else if(issue){const field=fields[issue.field]?.[ar?0:1]??issue.field;prompt=ar?`${row?.name??labels.ar[step]}: ${issue.field==='requiresRoom'?field:'شو '+field+'؟'}`:`For ${row?.name??labels.en[step]}: ${field}?`;}
  else if(!state.draft[step].length){prompt=({branches:ar?'كم فرع عندك وشو أساميهم؟ بنسجلهم كلهم، وبنكمّل بيانات أول فرع لحاله.':'How many branches do you have, and what are their names? We will list them all, then complete the first branch.',services:ar?'احكيلي أسماء الخدمات اللي بتقدموها، وبنراجع تفاصيلها مع بعض.':'Tell me the services you offer, and we will review their details together.',rooms:state.draft.branches.length===1?(ar?'شو الغرف الموجودة بمركزك، وكم شخص بتستوعب كل غرفة وأي خدمات فيها؟ وإذا ما عندك غرف احكيلي.':'Which treatment rooms do you have, how many clients fit in each, and which services use them? Or tell me if there are none.'):ar?'شو الغرف الموجودة وبأي فرع؟ احكي السعة والخدمات لكل غرفة، وإذا ما في غرف احكيلي.':'Which rooms do you have and at which branch? Include capacity and services, or tell me if there are none.',staff:ar?'مين الموظفين اللي بدك تضيفهم؟ احكي أسماءهم وأدوارهم والخدمات اللي بقدموها، وإذا رح تضيفهم لاحقًا احكيلي.':'Which staff members would you like to add? Tell me their names, roles and services, or say you will add them later.'})[step];}
  else prompt=ar?`في تفاصيل ثانية عن ${labels.ar[step]}؟ إذا هاي كل المعلومات احكيلي.`:`Anything else about ${labels.en[step]}? Tell me when that is everything.`;
 }
 if((step==='branches'||step==='services')&&!state.draft[step].length){
  const profile=state.companyProfile as {details?:{branches?:{name:string}[];services?:{name:string}[]}}|undefined;
  const found=profile?.details?.[step]?.slice(0,4).map(item=>item.name).join('، ');
  if(found)prompt=ar?(step==='branches'?`لقيت هالفروع بالمصادر: ${found}. هدول فروعك، وفي غيرهم؟`:`لقيت خدمات: ${found}. بتقدموها بكل الفروع؟`):(step==='branches'?`Public sources list ${found}. Are these your branches, and are any missing?`:`Public sources list ${found}. Are these services shared across branches?`);
 }
 const active=step==='company'||step==='review'?null:state.draft[step].find(row=>required.some(i=>i.key===row.key))??state.draft[step].at(-1);
 const focus=step==='company'||step==='review'?null:{resource:step==='staff'?'employees':step,key:active?.key??`pending_${step}`,field:required.find(i=>i.key===active?.key)?.field??(step==='branches'?'openingHours':'name')};
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

/** Confirm only rooms the manager actually named; incomplete import placeholders are not rooms. */
export function roomsForConfirmation(draft:Draft,existingServices:{key:string;branchId:number|null;requiresRoom:boolean|null}[]=[]):Draft{
 const branchKey=(id:number|null)=>id===null?null:draft.branches.find(branch=>branch.existingId===id)?.key??`branch_${id}`;
 const services=[...draft.services.map(service=>({key:service.key,branchKey:service.branchKey,requiresRoom:service.requiresRoom})),...existingServices.map(service=>({key:service.key,branchKey:branchKey(service.branchId),requiresRoom:service.requiresRoom}))];
 const soleBranch=draft.branches.length===1?draft.branches[0]!.key:null;
 return {...draft,rooms:draft.rooms.filter(room=>!!room.name?.trim()).map(room=>{
  const roomBranch=room.branchKey??soleBranch;
  return {...room,branchKey:roomBranch,serviceKeys:room.serviceKeys??services.filter(service=>service.requiresRoom&&(service.branchKey===null||service.branchKey===roomBranch)).map(service=>service.key)};
 })};
}
