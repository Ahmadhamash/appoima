import { parseDraft, nameLanguage, type Draft } from './concierge-core';
import { createDefinition, mainServiceName, normalizeServiceName } from '@workspace/service-definition';
type Details={branches:{name:string}[];services:{name:string;detail?:string;isSubservice?:boolean;mainServiceName?:string|null}[]};
/** Import confirmed names and evidenced hierarchy; never invent operational facts or parents. */
export function importPublicDetails(current:Draft,details:Details,existing:{branches:{name:string}[];services:{name:string}[]}){
 const draft=parseDraft(current),normalize=(s:string)=>s.trim().toLocaleLowerCase().replace(/\s+/g,' '),keys=new Set(Object.values(draft).flat().map(row=>row.key));
 const key=(kind:string)=>{let i=1;while(keys.has(`web_${kind}_${i}`))i++;const value=`web_${kind}_${i}`;keys.add(value);return value;};
 for(const row of details.branches){const name=row.name.trim().slice(0,120);if(!name||draft.branches.length>=50||[...existing.branches,...draft.branches].some(b=>normalize(b.name??'')===normalize(name)))continue;draft.branches.push({key:key('branch'),existingId:null,name,nameLang:nameLanguage(name),timeZone:null,openingHours:null});}
 const parents=new Set(details.services.filter(row=>row.isSubservice).map(row=>mainServiceName(row.mainServiceName)).filter((name):name is string=>!!name).map(normalizeServiceName));
 for(const row of details.services){
  const name=row.name.trim().slice(0,120);
  if(!name||row.isSubservice===false&&parents.has(normalizeServiceName(name))||draft.services.length>=50||[...existing.services,...draft.services].some(s=>normalize(s.name??'')===normalize(name)))continue;
  const parent=mainServiceName(row.mainServiceName)??(row.isSubservice===false?mainServiceName(name):null);
  const definition=parent||row.detail?createDefinition('custom',nameLanguage(name)):null;if(definition){if(parent)definition.section=parent;definition.description=row.detail?.trim().slice(0,500)||null;}
  draft.services.push({key:key('service'),name,nameLang:nameLanguage(name),branchScope:null,branchKey:null,durationMinutes:null,price:null,currency:'JOD',category:parent,definition,requiresRoom:null});
 }
 return parseDraft(draft);
}
