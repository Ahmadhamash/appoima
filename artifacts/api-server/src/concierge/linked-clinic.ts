/** Collect supplied clinic sites, their linked public profiles, and available public posts. */
import {createHash} from 'node:crypto';
import {readPublicSite,siteIdentity,rasterDataUrl} from './public-business-site';
import {publicHttpsUrl,validHex,type WorkspaceFact,type WorkspaceField} from '@workspace/service-definition';
import type {CompanyCandidate} from './providers';
import type {BusinessDetails} from './company-details';
import {crawlPublicBusiness,canonicalPublicUrl,socialPlatform,pageMeta,publicLinks,publicProfileText,decodePublicText,type PublicPage} from './public-business-crawl';
export type LinkedClinic=CompanyCandidate & {workspaceFacts:WorkspaceFact[];linkWarnings:{url:string;code:string}[];collectedPages?:PublicPage[]};
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
export function extractLinkedFacts(html:string,url:string,allowPageTitle=true):{name:string;facts:WorkspaceFact[];services:BusinessDetails['services'];ambiguous:boolean} {
 const rows=businessRows(html),names=[...new Set(rows.map(r=>bounded(r.name)).filter(Boolean))];
 // Multiple businesses on a directory page must not be silently merged.
 if(names.length>1)return {name:'',facts:[],services:[],ambiguous:true};
 const row=rows.find(r=>bounded(r.name))??{},social=!!socialPlatform(url);
 const title=bounded(metadata(html,'og:title'));
 const profileName=title.split(/\s+(?:\(@|[|•·])/u)[0]?.trim()??'';
 const generic=/^(instagram|facebook|tiktok|youtube|login|log in|sign up|photos and videos)$/i;
 const name=social?([names[0],profileName].find(value=>value&&!generic.test(value))??''):((names[0]??bounded(metadata(html,'og:site_name')))||(allowPageTitle?profileName:''));
 const facts:WorkspaceFact[]=[];
 const add=(field:WorkspaceField,value:string,evidence:string)=>{if(!value)return;facts.push({id:createHash('sha256').update(url+'|'+field+'|'+value).digest('hex').slice(0,24),field,value,sourceUrl:url,evidence:bounded(evidence,240),confidence:'extracted'});};
 if(name)add(/[\u0600-\u06ff]/u.test(name)?'nameAr':'nameEn',name,`name: ${name}`);
 const phone=bounded(row.telephone,30),email=bounded(row.email,120).replace(/^mailto:/i,'');
 if(phone&&/^[+\d][\d ()-]{4,29}$/.test(phone))add('phone',phone,`telephone: ${phone}`);
 if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))add('email',email,`email: ${email}`);
 // Contact links are explicit published evidence; social bios are limited to the selected account.
 const contacts=social?publicProfileText(html,url):[...html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m=>{const value=decodePublicText(m[1]!);try{return /^(?:tel|mailto):/i.test(value)?decodeURIComponent(value):value;}catch{return value;}}).join('\n');
 for(const match of contacts.matchAll(/mailto:([^?\s<>"']+)|\b([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi)){const value=bounded(match[1]??match[2],120);if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&!facts.some(f=>f.field==='email'&&f.value===value))add('email',value,`Published contact: ${value}`);}
 for(const match of contacts.matchAll(/tel:\s*([+\d][\d ()-]{4,29})|https:\/\/wa\.me\/(\d{5,20})|[?&]phone=(\d{5,20})|(\+\d[\d ()-]{6,28}\d)/g)){const value=bounded(match[1]??match[4]??'+'+(match[2]??match[3]),30);if(/^[+\d][\d ()-]{4,29}$/.test(value)&&!facts.some(f=>f.field==='phone'&&f.value===value))add('phone',value,`Published contact: ${value}`);}
 const address=typeof row.address==='string'?bounded(row.address,400):row.address&&typeof row.address==='object'?['streetAddress','addressLocality','addressRegion','postalCode','addressCountry'].map(k=>bounded((row.address as Record<string,unknown>)[k])).filter(Boolean).join(', '):'';
 if(address)add('address',address,`address: ${address}`);
 if(name)add('website',url,'Owner-supplied page URL; verify this is the clinic’s page.');
 const color=metadata(html,'theme-color');if(name&&validHex(color))add('primaryColor',color,`meta theme-color: ${color}`);
 const services:BusinessDetails['services']=[];
 const offerings=row.hasOfferCatalog as Record<string,unknown>|undefined;
 const visitOffers=(value:unknown,depth=0)=>{if(!value||typeof value!=='object'||depth>4||services.length>=50)return;if(Array.isArray(value)){value.slice(0,70).forEach(v=>visitOffers(v,depth+1));return;}const item=value as Record<string,unknown>;
  if((item['@type']==='Service'||Array.isArray(item['@type'])&&item['@type'].includes('Service'))&&bounded(item.name)){const n=bounded(item.name);if(!services.some(s=>s.name===n))services.push({name:n,detail:bounded(item.description,1500),sourceUrl:url});}
  for(const key of ['@graph','itemListElement','itemOffered','hasOfferCatalog','mainEntity'])if(item[key])visitOffers(item[key],depth+1);
 };visitOffers(offerings);
 for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){if(script[1]!.length>120000)continue;try{visitOffers(JSON.parse(script[1]!));}catch{/* Invalid structured services stay unknown. */}}
 return {name,facts,services,ambiguous:false};
}
export async function lookupLinkedClinic(urls:string[],reader:Reader=readPublicSite,onPage?:(progress:{url:string;completed:number;total:number})=>void):Promise<LinkedClinic> {
 if(!urls.length||urls.length>5||urls.some(u=>!publicHttpsUrl(u)))throw new Error('public_https_required');
 const details:BusinessDetails={logoDataUrl:null,colors:[],website:null,branches:[],services:[],status:'unavailable'};
 const candidate:LinkedClinic={name:'',summary:'',industry:null,location:null,website:null,sources:[],found:false,details,workspaceFacts:[],linkWarnings:[]};
 const crawl=await crawlPublicBusiness(urls,reader,{onPage});candidate.publicScan=crawl.scan;candidate.linkWarnings.push(...crawl.warnings);
 const roots=new Set(urls.map(url=>canonicalPublicUrl(url))),rejectedRoots=new Set<string>(),logoAttempts=new Set<string>();
 const normalized=(value:string)=>value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 // Exact supplied identities stay authoritative; discovered official links may use another language/name.
 for(const page of crawl.pages.filter(page=>page.html&&page.kind!=='post')){
  try{
   const html=page.html!,extracted=extractLinkedFacts(html,page.url,roots.has(page.url)||!!socialPlatform(page.url)),root=canonicalPublicUrl(page.root??page.url)!;
   if(rejectedRoots.has(root))continue;
   if(extracted.ambiguous||!extracted.name&&roots.has(page.url)){if(roots.has(page.url)){candidate.linkWarnings.push({url:page.url,code:extracted.ambiguous?'ambiguous_identity':'no_structured_identity'});rejectedRoots.add(root);}continue;}
   if(!extracted.name&&!candidate.found)continue;
   const officiallyLinked=candidate.sources.some(source=>{const previous=crawl.pages.find(p=>p.url===source.url);return !!previous?.html&&publicLinks(previous.html,previous.url).includes(page.url)||publicLinks(html,page.url).includes(source.url);});
   if(candidate.name&&normalized(candidate.name)!==normalized(extracted.name)&&roots.has(page.url)&&!officiallyLinked){candidate.linkWarnings.push({url:page.url,code:'conflicting_identity'});rejectedRoots.add(root);continue;}
   if(!candidate.name)candidate.name=extracted.name;candidate.found=true;candidate.sources.push({title:extracted.name||candidate.name,url:page.url});
   // Provider pages can contain personal numbers or theme demo contacts. Propose clinic contacts from its own identity/contact pages.
   const clinicContactPage=!socialPlatform(page.url)&&(roots.has(page.url)||/contact|about|اتصل|تواصل|عنا/i.test(decodeURIComponent(new URL(page.url).pathname)));
   const clinicIdentityPage=roots.has(page.url)||!socialPlatform(page.url)||!!candidate.website&&!socialPlatform(candidate.website)&&new URL(page.url).pathname.toLowerCase().includes(new URL(candidate.website).hostname.replace(/^www\./,'').split('.')[0]!.toLowerCase());
   candidate.workspaceFacts.push(...extracted.facts.filter(f=>
    (f.field!=='website'||roots.has(page.url))&&(!['nameEn','nameAr'].includes(f.field)||clinicIdentityPage)&&(!['phone','email','address'].includes(f.field)||clinicContactPage||page.kind==='profile'&&clinicIdentityPage)&&
    !candidate.workspaceFacts.some(other=>other.field===f.field&&other.value===f.value)));
   details.services.push(...extracted.services.filter(s=>!details.services.some(v=>normalized(v.name)===normalized(s.name))).slice(0,50-details.services.length));
   candidate.website??=page.url;details.website??=page.url;
   const social=!!socialPlatform(page.url);
   const color=!social?extracted.facts.find(f=>f.field==='primaryColor')?.value:null;if(color&&!details.colors.includes(color))details.colors.push(color);
   const identity=siteIdentity(html,page.url);
   // A profile image can be proposed as a logo, but platform theme colors cannot.
   if(social)candidate.workspaceFacts=candidate.workspaceFacts.filter(f=>f.sourceUrl!==page.url||f.field!=='primaryColor');
   const imageUrl=social?pageMeta(html,'og:image'):identity.logo;
   if(imageUrl&&!details.logoDataUrl&&logoAttempts.size<3&&!logoAttempts.has(imageUrl)){
    logoAttempts.add(imageUrl);
    try{const image=await reader(new URL(imageUrl,page.url).href,180000),data=rasterDataUrl(image.bytes);if(data&&/^data:image\/(png|jpeg|webp);/.test(data)&&data.length<=125000){details.logoDataUrl=data;candidate.workspaceFacts.push({id:createHash('sha256').update(page.url+'|logo').digest('hex').slice(0,24),field:'logoDataUrl',value:data,sourceUrl:page.url,evidence:social?'Profile image from the supplied social page; owner must confirm it is the clinic logo.':'Logo declared on the supplied page; owner confirmation required.',confidence:'extracted'});}}catch{/* Optional logo stays unknown. */}
   }
  }catch{candidate.linkWarnings.push({url:page.url,code:'page_unavailable'});}
 }
 candidate.socialProfiles=crawl.profiles.filter(profile=>!rejectedRoots.has(canonicalPublicUrl(profile.root)!)||candidate.linkWarnings.some(w=>canonicalPublicUrl(w.url)===canonicalPublicUrl(profile.root)&&w.code==='no_structured_identity')).map(profile=>profile.url);
 if(candidate.publicScan)candidate.publicScan.profilesDiscovered=candidate.socialProfiles.length;
 candidate.collectedPages=candidate.found?crawl.pages.filter(page=>!rejectedRoots.has(canonicalPublicUrl(page.root??page.url)!)).map(({html,...page})=>page.kind==='website'?{...page,html}:page):[];
 for(const page of candidate.collectedPages)if(page.kind==='post'&&!candidate.sources.some(s=>s.url===page.url))candidate.sources.push({title:candidate.name+' — public post',url:page.url});
 candidate.workspaceFacts=candidate.workspaceFacts.filter((f,i,all)=>all.findIndex(other=>other.id===f.id)===i);
 details.status=candidate.found?'partial':'unavailable';
 candidate.summary=candidate.found?'Public clinic pages, linked social profiles and accessible posts. Confirm identity and review each extracted fact; missing details remain unknown.':'';
 return candidate;
}
