import { createDefinition, normalizeServiceName } from '@workspace/service-definition';
import { parseDraft, nameLanguage, type Draft, type ServiceDraft, type Language, ConciergeInputError } from './concierge-core';
export type ServiceSource={kind:'manual'|'conversation'|'public';label:string;url:string|null};
export type ServiceSuggestion={key:string;name:string;detail:string;sourceUrl:string;followUpEnabled?:boolean};
/** Enforces the service-only boundary independently of model instructions. */
export function assertServiceOnly(current:Draft,next:Draft) {
  for(const kind of ['branches','rooms','staff'] as const)if(JSON.stringify(current[kind])!==JSON.stringify(next[kind]))throw new ConciergeInputError('concierge_services_only');
}
/** Public sources NEVER overwrite a manager's draft, and do not become live services. */
export function publicServiceSuggestions(details:{services:{name:string;detail:string;sourceUrl:string}[]},draft:Draft,existing:{name:string}[]):ServiceSuggestion[]{
  const seen=new Set([...draft.services,...existing].map(s=>normalizeServiceName(s.name??'')));
  return details.services.flatMap((s,index)=>{
    const name=s.name.trim().slice(0,120),normalized=normalizeServiceName(name);if(!name||seen.has(normalized))return [];seen.add(normalized);
    let sourceUrl='';try{const url=new URL(s.sourceUrl);if(url.protocol==='https:'&&!url.username&&!url.password)sourceUrl=url.href;}catch{/* No executable URLs. */}
    return [{key:`public_service_${index+1}`,name,detail:s.detail.slice(0,1500),sourceUrl}];
  }).slice(0,50);
}
export function draftFromSuggestion(suggestion:ServiceSuggestion,key:string,language:Language):ServiceDraft {
  return {key,followUpEnabled:suggestion.followUpEnabled??false,name:suggestion.name,nameLang:nameLanguage(suggestion.name),branchKey:null,branchScope:null,durationMinutes:null,price:null,currency:'JOD',category:'Other',requiresRoom:null,employeeIds:null,roomIds:null,definition:createDefinition('custom',language)};
}
export function changedServiceSources(before:Draft,after:Draft,sources:Record<string,ServiceSource>,source:ServiceSource) {
  const next:Record<string,ServiceSource>={};for(const row of after.services){
    const old=before.services.find(s=>s.key===row.key);
    next[row.key]=old&&JSON.stringify(old)===JSON.stringify(row)&&sources[row.key]?sources[row.key]!:source;
  }return next;
}
/** Keep only unique exact services. Semantic scope is also explicitly reviewed by the manager. */
export function ensureWizardDefinitions(draft:Draft) {
  for(const service of draft.services)if(!service.definition)throw new ConciergeInputError('concierge_definition_required');
  return parseDraft(draft);
}

/** Removed services are tombstoned for this setup session, so old conversation context
 * cannot recreate them. Only an explicit manual/source selection clears a tombstone. */
export function serviceExclusions(before:Draft,after:Draft,previous:string[]=[]):string[]{
 const excluded=new Set(previous);
 for(const service of before.services){if(!after.services.some(s=>s.key===service.key)&&service.name)excluded.add(normalizeServiceName(service.name));}
 for(const service of after.services){if(!before.services.some(s=>s.key===service.key)&&service.name)excluded.delete(normalizeServiceName(service.name));}
 return [...excluded].slice(-200);
}
export function filterRemovedServices(patch:Draft,current:Draft,excluded:string[]=[]):Draft {
 const blocked=new Set(excluded);
 return {...patch,services:patch.services.filter(s=>current.services.some(v=>v.key===s.key)||!blocked.has(normalizeServiceName(s.name??'')))};
}
