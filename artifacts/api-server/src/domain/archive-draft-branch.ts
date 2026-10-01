import type { Draft } from './concierge-core';
export function archiveDraftBranch(source:Draft,key:string,archivedAt=new Date().toISOString()){
 const draft=structuredClone(source),branch=draft.branches.find(b=>b.key===key);
 if(!branch)return null;
 const services=draft.services.filter(s=>s.branchKey===key),rooms=draft.rooms.filter(r=>r.branchKey===key),removedServices=new Set(services.map(s=>s.key));
 const belongs=(p:Draft['staff'][number])=>p.branchSchedules?.length?p.branchSchedules.some(s=>s.branchKey===key):p.branchKey===key;
 const staff=structuredClone(draft.staff.filter(belongs));
 draft.branches=draft.branches.filter(b=>b.key!==key);draft.services=draft.services.filter(s=>s.branchKey!==key);draft.rooms=draft.rooms.filter(r=>r.branchKey!==key);
 draft.staff=draft.staff.filter(p=>!belongs(p)||p.branchSchedules?.some(s=>s.branchKey!==key));
 for(const p of draft.staff){p.serviceKeys=p.serviceKeys?.filter(k=>!removedServices.has(k))??null;if(p.branchSchedules?.length){p.branchSchedules=p.branchSchedules.filter(s=>s.branchKey!==key);p.branchKey=p.branchSchedules.length===1?p.branchSchedules[0]!.branchKey:null;p.workingHours=p.branchSchedules[0]!.workingHours;p.breaks=p.branchSchedules[0]!.breaks;}}
 for(const r of draft.rooms)r.serviceKeys=r.serviceKeys?.filter(k=>!removedServices.has(k))??null;
 return {draft,snapshot:{archivedAt,branch:structuredClone(branch),services:structuredClone(services),rooms:structuredClone(rooms),staff:structuredClone(staff)}};
}
