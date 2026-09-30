/** Deterministic fallback. Not an AI model: only explicit names/fields and focused answers. */
import {createDefinition,normalizeServiceName,editWorkspaceDraft,type WorkspaceDraft,type WorkspaceField} from '@workspace/service-definition';
import {emptyDraft,parseDraft,nameLanguage,type Draft,type Language,type ServiceDraft} from './concierge-core';
import {setupWorkflow} from './concierge-workflow';
const digits=(s:string)=>s.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c>='۰'?1776:1632)));
const same=(a:string,b:string)=>normalizeServiceName(a)===normalizeServiceName(b);
export function localConciergeTurn(draft:Draft,text:string,language:Language,newKey:string,workspace?:WorkspaceDraft) {
 const next=structuredClone(draft),input=digits(text.trim()),ar=language==='ar';
 const identity:Record<string,WorkspaceField>={'clinic name':'nameEn','اسم العيادة':'nameAr','phone':'phone','هاتف العيادة':'phone','email':'email','بريد العيادة':'email','address':'address','عنوان العيادة':'address','website':'website','موقع العيادة':'website','primary color':'primaryColor','اللون الرئيسي':'primaryColor','accent color':'accentColor','اللون الثانوي':'accentColor','وصف العيادة':'subtitleAr','clinic subtitle':'subtitleEn'};
 const keyed=/^([^:\n]{1,40})\s*:\s*(.+)$/u.exec(input);
 const key=keyed?.[1]?.trim().toLowerCase(),value=keyed?.[2]?.trim();
 if(key&&identity[key]&&workspace){const updated=editWorkspaceDraft(workspace,{...workspace.profile,[identity[key]!]:value});return {draft:next,workspace:updated,handled:true,reply:ar?'حفظت المعلومة في إعداد عيادتك.':'Added that fact to your clinic setup.'};}
 const explicit=/^(?:خدمة|اضف خدمة|أضف خدمة|service|add service)\s*:\s*(.+)$/iu.exec(input)?.[1]?.trim();
 const narrow=/^(?:عندي|عنا|لدينا)\s+(.{2,115})$/u.exec(input)?.[1]?.trim();
 const name=explicit??(next.services.length===0?narrow:undefined);
 if(name){
  if(next.services.some(s=>same(s.name??'',name)))return {draft:next,workspace,handled:true,reply:ar?'الخدمة موجودة بالمسودة؛ عدّل بطاقتها بدل تكرارها.':'This service is already in the draft; edit its card instead.'};
  const laser=/ليزر|\blaser\b/i.test(name),definition=createDefinition(laser?'laser':'custom',language);
  if(/للرجال|رجال|\bmen\b/i.test(name))definition.audience='men';
  if(/للنساء|نساء|\bwomen\b/i.test(name))definition.audience='women';
  if(/لح[يى][ةه]|لحيه|beard/i.test(name))definition.bodyArea=ar?'اللحية':'Beard';
  const service:ServiceDraft={key:newKey,name,nameLang:nameLanguage(name),branchKey:null,branchScope:null,durationMinutes:null,price:null,currency:'JOD',category:laser?'Laser':'Other',requiresRoom:null,employeeIds:[],roomIds:[],definition};
  next.services.push(service);return {draft:parseDraft(next),workspace,handled:true,reply:setupWorkflow({serviceWizard:true,draft:next},language).prompt};
 }
 const active=setupWorkflow({serviceWizard:true,draft:next},language).focus;
 const service=next.services.find(s=>s.key===active?.key);
 const aliases:Record<string,string>={'duration':'durationMinutes','المدة':'durationMinutes','مدة':'durationMinutes','price':'price','السعر':'price','سعر':'price','room':'requiresRoom','غرفة':'requiresRoom','scope':'branchScope','النطاق':'branchScope','name':'name','الاسم':'name'};
 const field=key?aliases[key]:active?.field,answer=value??input;
 let handled=false;
 if(service&&field){
  if(field==='durationMinutes'&&/^\d{1,4}(?:\s*(?:دقيقة|دقيقه|دقائق|minutes?|mins?))?$/.test(answer)){service.durationMinutes=Number(answer.match(/^\d+/)![0]);handled=true;}
  else if(field==='price'&&/^\d{1,9}(?:\.\d{1,3})?$/.test(answer)){service.price=answer;handled=true;}
  else if(field==='requiresRoom'&&/^(?:نعم|اه|آه|لا|yes|no)$/i.test(answer)){service.requiresRoom=!/^(لا|no)$/i.test(answer);handled=true;}
  else if(field==='branchScope'&&/^(?:كل الفروع|جميع الفروع|all branches|all)$/i.test(answer)){service.branchScope='all';service.branchKey=null;handled=true;}
  else if(field==='name'&&(key==='name'||key==='الاسم'||!service.name)&&answer.length<=120){service.name=answer;service.nameLang=nameLanguage(answer);handled=true;}
 }
 const validated=parseDraft(next);
 return {draft:validated,workspace,handled,reply:handled?setupWorkflow({serviceWizard:true,draft:validated},language).prompt:ar?'المساعد المحلي يفهم الحقول الواضحة فقط. اكتب «خدمة: اسم الخدمة»، أو أجب على السؤال الحالي، أو أكمل البطاقة يدويًا.':'Local mode accepts explicit fields only. Type “service: service name”, answer the current question, or use the manual editor.'};
}
