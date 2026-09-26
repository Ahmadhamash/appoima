/** Provider-free extraction from the exact supplied URLs. No search or identity substitution. */
import {createHash} from 'node:crypto';
import {readPublicSite,siteIdentity,rasterDataUrl} from './public-business-site';
import {publicHttpsUrl,validHex,type WorkspaceFact,type WorkspaceField} from '@workspace/service-definition';
import type {CompanyCandidate} from './providers';
import type {BusinessDetails} from './company-details';
export type LinkedClinic=CompanyCandidate & {workspaceFacts:WorkspaceFact[];linkWarnings:{url:string;code:string}[]};
type Page={url:string;bytes:Buffer;mime:string};
type Reader=(url:string,maxBytes?:number)=>Promise<Page>;
const bounded=(value:unknown,max=120)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const decode=(v:string)=>v.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&nbsp;/gi,' ');
function metadata(html:string,name:string){for(const tag of html.match(/<meta\b[^>]*>/gi)??[]){const key=/\b(?:property|name)\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];if(key?.toLowerCase()===name)return decode(/\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]??'');}return '';}
function businessRows(html:string):Record<string,unknown>[] {
 const rows:Record<string,unknown>[]=[];
 const visit=(value:unknown,depth=0)=>{
  if(depth>6||rows.length>=20||!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.slice(0,30).forEach(v=>visit(v,depth+1));return;}
  const row=value as Record<string,unknown>,types=Array.isArray(row['@type'])?row['@type']:[row['@type']];
  if(types.some(t=>['MedicalClinic','MedicalBusiness','Dentist','Physician','Hospital','LocalBusiness','Organization'].includes(String(t))))rows.push(row);
  if(row['@graph'])visit(row['@graph'],depth+1);
 };
 for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  if(script[1]!.length>120000)continue;try{visit(JSON.parse(script[1]!));}catch{/* Malformed metadata is not evidence. */}
 }
 return rows;
}
/** Only structural metadata is parsed; arbitrary prose/medical claims are not promoted to facts. */
export function extractLinkedFacts(html:string,url:string):{name:string;facts:WorkspaceFact[];services:BusinessDetails['services'];ambiguous:boolean} {
 const rows=businessRows(html),names=[...new Set(rows.map(r=>bounded(r.name)).filter(Boolean))];
 // Multiple businesses on a directory page must not be silently merged.
 if(names.length>1)return {name:'',facts:[],services:[],ambiguous:true};
 const row=rows.find(r=>bounded(r.name))??{},name=names[0]??bounded(metadata(html,'og:site_name'));
 const facts:WorkspaceFact[]=[];
 const add=(field:WorkspaceField,value:string,evidence:string)=>{if(!value)return;facts.push({id:createHash('sha256').update(url+'|'+field+'|'+value).digest('hex').slice(0,24),field,value,sourceUrl:url,evidence:bounded(evidence,240),confidence:'extracted'});};
 if(name)add(/[\u0600-\u06ff]/u.test(name)?'nameAr':'nameEn',name,`name: ${name}`);
 const phone=bounded(row.telephone,30),email=bounded(row.email,120).replace(/^mailto:/i,'');
 if(phone&&/^[+\d][\d ()-]{4,29}$/.test(phone))add('phone',phone,`telephone: ${phone}`);
 if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))add('email',email,`email: ${email}`);
 const address=typeof row.address==='string'?bounded(row.address,400):row.address&&typeof row.address==='object'?['streetAddress','addressLocality','addressRegion','postalCode','addressCountry'].map(k=>bounded((row.address as Record<string,unknown>)[k])).filter(Boolean).join(', '):'';
 if(address)add('address',address,`address: ${address}`);
 if(name)add('website',url,'Owner-supplied page URL; verify this is the clinic’s page.');
 const color=metadata(html,'theme-color');if(name&&validHex(color))add('primaryColor',color,`meta theme-color: ${color}`);
 const services:BusinessDetails['services']=[];
 const offerings=row.hasOfferCatalog as Record<string,unknown>|undefined;
 const visitOffers=(value:unknown,depth=0)=>{if(!value||typeof value!=='object'||depth>4||services.length>=15)return;if(Array.isArray(value)){value.slice(0,20).forEach(v=>visitOffers(v,depth+1));return;}const item=value as Record<string,unknown>;
  if(item['@type']==='Service'&&bounded(item.name)){const n=bounded(item.name);if(!services.some(s=>s.name===n))services.push({name:n,detail:'',sourceUrl:url});}
  for(const key of ['itemListElement','itemOffered','hasOfferCatalog'])if(item[key])visitOffers(item[key],depth+1);
 };if(name)visitOffers(offerings);
 return {name,facts,services,ambiguous:false};
}
export async function lookupLinkedClinic(urls:string[],reader:Reader=readPublicSite):Promise<LinkedClinic> {
 if(!urls.length||urls.length>5||urls.some(u=>!publicHttpsUrl(u)))throw new Error('public_https_required');
 const details:BusinessDetails={logoDataUrl:null,colors:[],website:null,branches:[],services:[],status:'unavailable'};
 const candidate:LinkedClinic={name:'',summary:'',industry:null,location:null,website:null,sources:[],found:false,details,workspaceFacts:[],linkWarnings:[]};
 // Sequential bounded fetches; no crawler, no cookies, no model request.
 for(const supplied of [...new Set(urls)]){
  try{
   const page=await reader(supplied);if(!/text\/html|application\/xhtml\+xml/i.test(page.mime))throw new Error('unsupported_content');
   // A redirect to another host cannot establish the identity of the supplied clinic.
   const host=(u:string)=>new URL(u).hostname.toLowerCase().replace(/^www\./,'');
   if(host(page.url)!==host(supplied)){candidate.linkWarnings.push({url:supplied,code:'redirect_identity_changed'});continue;}
   const html=page.bytes.toString('utf8'),extracted=extractLinkedFacts(html,page.url);
   if(extracted.ambiguous||!extracted.name){candidate.linkWarnings.push({url:supplied,code:extracted.ambiguous?'ambiguous_identity':'no_structured_identity'});continue;}
   if(candidate.name&&candidate.name!==extracted.name){candidate.linkWarnings.push({url:supplied,code:'conflicting_identity'});continue;}
   candidate.name=extracted.name;candidate.found=true;candidate.sources.push({title:extracted.name,url:page.url});candidate.workspaceFacts.push(...extracted.facts);
   details.services.push(...extracted.services.filter(s=>!details.services.some(v=>v.name===s.name)));
   candidate.website??=page.url;details.website??=page.url;
   const color=extracted.facts.find(f=>f.field==='primaryColor')?.value;if(color&&!details.colors.includes(color))details.colors.push(color);
   const identity=siteIdentity(html,page.url);
   // Social platform logos/colors are not the clinic's brand.
   const social=/(^|\.)(instagram|facebook|tiktok|youtube)\.com$/i.test(new URL(page.url).hostname);
   if(social){details.colors=[];candidate.workspaceFacts=candidate.workspaceFacts.filter(f=>f.field!=='primaryColor');}
   if(!social&&identity.logo&&!details.logoDataUrl){
    try{const image=await reader(identity.logo,90000),data=rasterDataUrl(image.bytes);if(data&&/^data:image\/(png|jpeg|webp);/.test(data)&&data.length<=125000){details.logoDataUrl=data;candidate.workspaceFacts.push({id:createHash('sha256').update(page.url+'|logo').digest('hex').slice(0,24),field:'logoDataUrl',value:data,sourceUrl:page.url,evidence:'Logo declared on the supplied page; owner confirmation required.',confidence:'extracted'});}}catch{/* Optional logo stays unknown. */}
   }
  }catch{candidate.linkWarnings.push({url:supplied,code:'page_unavailable'});}
 }
 candidate.workspaceFacts=candidate.workspaceFacts.filter((f,i,all)=>all.findIndex(other=>other.id===f.id)===i);
 details.status=candidate.found?'partial':'unavailable';
 candidate.summary=candidate.found?'Public metadata only. Confirm identity and select each fact; missing details remain unknown.':'';
 return candidate;
}
