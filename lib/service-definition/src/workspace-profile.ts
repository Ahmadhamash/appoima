/** Tenant workspace identity, not a public website or an executable theme. */
export const WORKSPACE_FIELDS = ['nameAr','nameEn','subtitleAr','subtitleEn','phone','email','address','website','logoDataUrl','primaryColor','accentColor'] as const;
export const JORMALL_PRIMARY = '#087CB8';
export const JORMALL_ACCENT = '#D94B3D';
export type WorkspaceField = typeof WORKSPACE_FIELDS[number];
export type WorkspaceProfile = {version:1} & Record<WorkspaceField,string|null>;
export type FactSource = {kind:'clinic'|'owner'|'public'|'suggestion';url:string|null;confidence:'confirmed'|'extracted'|'suggested';evidence:string|null};
export type WorkspaceSources = Partial<Record<WorkspaceField,FactSource>>;
export type WorkspaceFact = {id:string;field:WorkspaceField;value:string;sourceUrl:string;evidence:string;confidence:'extracted'};
export type WorkspaceDraft = {profile:WorkspaceProfile;sources:WorkspaceSources;baseRevision:number;dirty:boolean;proposals:WorkspaceFact[]};
export type WorkspaceRecord = {revision:number;profile:WorkspaceProfile;sources:WorkspaceSources};
export class WorkspaceValidationError extends Error {
 constructor(public readonly fields:string[]) {super('workspace_invalid');}
}
export const validHex=(v:unknown):v is string=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
export const validWorkspaceLogo=(v:unknown):v is string=>typeof v==='string'&&v.length<=125000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v);
export function publicHttpsUrl(value:unknown):value is string {
 if(typeof value!=='string'||value.length>500)return false;
 try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.hostname.includes('.')&&!/^(localhost|.*\.localhost|.*\.local)$/i.test(u.hostname);}catch{return false;}
}
export function parseWorkspaceProfile(value:unknown):WorkspaceProfile {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new WorkspaceValidationError(['profile']);
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==WORKSPACE_FIELDS.length+1||v.version!==1||WORKSPACE_FIELDS.some(f=>!Object.hasOwn(v,f)))throw new WorkspaceValidationError(['profile']);
 const errors:string[]=[];
 const out={version:1} as WorkspaceProfile;
 for(const f of WORKSPACE_FIELDS){
  const max=f==='logoDataUrl'?125000:f==='website'?500:f==='address'?400:f.startsWith('subtitle')?240:120;
  const raw=v[f];if(raw!==null&&(typeof raw!=='string'||raw.length>max||/[\u0000-\u001f\u007f]/u.test(raw))){errors.push(f);continue;}
  out[f]=typeof raw==='string'?raw.trim()||null:null;
 }
 if(!out.nameAr&&!out.nameEn)errors.push('name');
 if(out.phone&&!/^[+\d][\d ()-]{4,29}$/.test(out.phone))errors.push('phone');
 if(out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))errors.push('email');
 if(out.website&&!publicHttpsUrl(out.website))errors.push('website');
 if(out.logoDataUrl&&!validWorkspaceLogo(out.logoDataUrl))errors.push('logoDataUrl');
 for(const f of ['primaryColor','accentColor'] as const)if(!validHex(out[f]))errors.push(f);
 if(errors.length)throw new WorkspaceValidationError([...new Set(errors)]);
 return out;
}
export function defaultWorkspace(name:string,language:'ar'|'en'):WorkspaceRecord {
 const profile=parseWorkspaceProfile({version:1,nameAr:language==='ar'?name:null,nameEn:language==='en'?name:null,subtitleAr:null,subtitleEn:null,phone:null,email:null,address:null,website:null,logoDataUrl:null,primaryColor:JORMALL_PRIMARY,accentColor:JORMALL_ACCENT});
 return {revision:0,profile,sources:{[language==='ar'?'nameAr':'nameEn']:{kind:'clinic',url:null,confidence:'confirmed',evidence:null},primaryColor:{kind:'suggestion',url:null,confidence:'suggested',evidence:null},accentColor:{kind:'suggestion',url:null,confidence:'suggested',evidence:null}}};
}
export const beginWorkspaceDraft=(record:WorkspaceRecord):WorkspaceDraft=>({profile:structuredClone(record.profile),sources:structuredClone(record.sources),baseRevision:record.revision,dirty:false,proposals:[]});
export function editWorkspaceDraft(draft:WorkspaceDraft,raw:unknown):WorkspaceDraft {
 const profile=parseWorkspaceProfile(raw),sources={...draft.sources};
 let changed=false;
 for(const field of WORKSPACE_FIELDS)if(profile[field]!==draft.profile[field]){changed=true;sources[field]={kind:'owner',url:null,confidence:'confirmed',evidence:null};}
 return {...draft,profile,sources,dirty:draft.dirty||changed};
}
/** A source is never permitted to replace an owner edit implicitly. Selection is explicit. */
export function acceptWorkspaceFact(draft:WorkspaceDraft,id:string):WorkspaceDraft {
 const fact=draft.proposals.find(f=>f.id===id);
 if(!fact)throw new WorkspaceValidationError(['proposal']);
 const profile=parseWorkspaceProfile({...draft.profile,[fact.field]:fact.value});
 return {...draft,profile,dirty:true,sources:{...draft.sources,[fact.field]:{kind:'public',url:fact.sourceUrl,confidence:'confirmed',evidence:fact.evidence}},proposals:draft.proposals.filter(f=>f.id!==id)};
}
export function workspaceName(profile:WorkspaceProfile,language:'ar'|'en') {
 return (language==='ar'?profile.nameAr??profile.nameEn:profile.nameEn??profile.nameAr)??'';
}
export function workspaceSubtitle(profile:WorkspaceProfile,language:'ar'|'en') {
 return (language==='ar'?profile.subtitleAr??profile.subtitleEn:profile.subtitleEn??profile.subtitleAr)??'';
}
/** WCAG luminance-based black/white foreground; never accepts arbitrary CSS. */
export function colorForeground(color:string):'#000000'|'#FFFFFF' {
 if(!validHex(color))return '#FFFFFF';
 const rgb=[1,3,5].map(i=>{const n=parseInt(color.slice(i,i+2),16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
 return .2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!>.179?'#000000':'#FFFFFF';
}
export function colorHsl(color:string):string {
 if(!validHex(color))color='#176B64';
 const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255) as [number,number,number];
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
 let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;}
 return `${h.toFixed(1)} ${(s*100).toFixed(1)}% ${(l*100).toFixed(1)}%`;
}
