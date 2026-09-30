import { parseDraft, nameLanguage, type Draft } from './concierge-core';
type Details={branches:{name:string}[];services:{name:string}[]};
/** Imports names only after identity confirmation. Missing operational facts remain null. */
export function importPublicDetails(current:Draft,details:Details,existing:{branches:{name:string}[];services:{name:string}[]}){
 const draft=parseDraft(current),normalize=(s:string)=>s.trim().toLocaleLowerCase().replace(/\s+/g,' '),keys=new Set(Object.values(draft).flat().map(row=>row.key));
 const key=(kind:string)=>{let i=1;while(keys.has(`web_${kind}_${i}`))i++;const value=`web_${kind}_${i}`;keys.add(value);return value;};
 for(const row of details.branches){const name=row.name.trim().slice(0,120);if(!name||draft.branches.length>=50||[...existing.branches,...draft.branches].some(b=>normalize(b.name??'')===normalize(name)))continue;draft.branches.push({key:key('branch'),existingId:null,name,nameLang:nameLanguage(name),timeZone:null,openingHours:null});}
 for(const row of details.services){const name=row.name.trim().slice(0,120);if(!name||draft.services.length>=50||[...existing.services,...draft.services].some(s=>normalize(s.name??'')===normalize(name)))continue;draft.services.push({key:key('service'),name,nameLang:nameLanguage(name),branchScope:null,branchKey:null,durationMinutes:null,price:null,currency:'JOD',category:null,requiresRoom:null});}
 return parseDraft(draft);
}
