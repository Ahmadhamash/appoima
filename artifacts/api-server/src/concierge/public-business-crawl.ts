import { publicHttpsUrl } from '@workspace/service-definition';
import { readPublicSite, siteIdentity } from './public-business-site';

export type PublicPage = { url: string; text: string; kind: 'website'|'profile'|'post'; html?: string; root?: string };
export type PublicScan = { pagesRead: number; profilesRead: number; postsRead: number; limited: boolean; profilesDiscovered?: number; indexedSources?: number };
export type PublicCrawl = { pages: PublicPage[]; warnings: {url:string;code:string}[]; scan: PublicScan; profiles: {url:string;root:string}[] };
export type PublicReader = (url:string,maxBytes?:number)=>Promise<{url:string;bytes:Buffer;mime:string}>;
export const CRAWL_LIMITS = { pages: 60, posts: 120, profiles: 8, depth: 4, milliseconds: 45000, pageBytes: 2500000, totalBytes: 30000000, textChars: 360000, concurrency: 3 } as const;
const clip=(value:unknown,max=15000)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').trim().slice(0,max):'';
export function decodePublicText(value:string):string {
 return value.replace(/&(?:amp|quot|apos|nbsp|lt|gt);|&#(?:x[\da-f]+|\d+);/gi,entity=>{
  const names:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&nbsp;':' ','&lt;':'<','&gt;':'>'};
  if(names[entity.toLowerCase()])return names[entity.toLowerCase()]!;
  const n=parseInt(entity.slice(entity[2]?.toLowerCase()==='x'?3:2,-1),entity[2]?.toLowerCase()==='x'?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';
 });
}
const attr=(tag:string,key:string)=>decodePublicText(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`,'i').exec(tag)?.[1]??'');
export function pageMeta(html:string,name:string):string {
 for(const tag of html.match(/<meta\b[^>]*>/gi)??[])if((attr(tag,'property')||attr(tag,'name')).toLowerCase()===name.toLowerCase())return attr(tag,'content');
 return '';
}
export function socialPlatform(raw:string):'instagram'|'facebook'|'tiktok'|'youtube'|'linkedin'|null {
 const host=new URL(raw).hostname.toLowerCase();
 for(const platform of ['instagram','facebook','tiktok','youtube','linkedin'] as const)if(host===`${platform}.com`||host.endsWith(`.${platform}.com`))return platform;
 return host==='youtu.be'?'youtube':null;
}
export function canonicalPublicUrl(raw:string,base?:string):string|null {
 try{let u=new URL(decodePublicText(raw),base);for(let i=0;i<3;i++){
   if(!['l.instagram.com','l.facebook.com','lm.facebook.com'].includes(u.hostname.toLowerCase()))break;
   const target=u.searchParams.get('u');if(!target)return null;u=new URL(target);
  }
  if(!publicHttpsUrl(u.href))return null;u.hash='';
  const platform=socialPlatform(u.href);for(const key of [...u.searchParams.keys()])if(/^(utm_|fbclid|igsh|ref|share|si)/i.test(key)||platform&&!['id','v','story_fbid','fbid','sk'].includes(key))u.searchParams.delete(key);
  if(platform&&u.hostname!=='youtu.be')u.hostname='www.'+platform+'.com';
  if(platform&&socialKind(u.href)==='profile'&&!u.pathname.endsWith('/')&&!u.pathname.endsWith('.php'))u.pathname+='/';return u.href;
 }catch{return null;}
}
export function socialKind(raw:string):'profile'|'post'|null {
 const u=new URL(raw),platform=socialPlatform(raw),parts=u.pathname.split('/').filter(Boolean);if(!platform)return null;
 if(platform==='instagram')return ['p','reel','reels','tv'].includes(parts[0]??'')&&parts[1]?'post':(parts.length===1||parts.length===2&&parts[1]==='reels')&&!['accounts','explore','direct','stories','about','developer','legal','privacy'].includes(parts[0]??'')?'profile':null;
 if(platform==='facebook')return /\/(?:posts|videos|reel|photos)\/[^/]+/.test(u.pathname)||['permalink.php','story.php','photo.php'].includes(parts[0]??'')?'post':((parts.length===1||parts.length===2&&['about','services','posts','photos','videos','reels'].includes(parts[1]!))&&!['login','sharer','sharer.php','share','dialog','watch','groups','help','policies','privacy','marketplace','gaming'].includes(parts[0]??'')||parts[0]==='pages'&&parts.length>=3||parts[0]==='profile.php'&&u.searchParams.has('id'))?'profile':null;
 if(platform==='tiktok')return parts[0]?.startsWith('@')?(parts[1]==='video'&&parts[2]?'post':parts.length===1?'profile':null):null;
 if(platform==='youtube')return parts[0]==='watch'&&u.searchParams.has('v')||parts[0]==='shorts'&&parts[1]||u.hostname==='youtu.be'&&parts[0]?'post':parts[0]?.startsWith('@')||['channel','c','user'].includes(parts[0]??'')?'profile':null;
 return /^\/(?:posts|feed\/update)\//.test(u.pathname)?'post':parts[0]==='company'&&parts[1]?'profile':null;
}
/** Account identity is shared by its public profile, services, about and feed sections. */
export function publicProfileUrl(raw:string):string|null {
 const url=canonicalPublicUrl(raw);if(!url||socialKind(url)!=='profile')return null;
 const u=new URL(url),platform=socialPlatform(url),parts=u.pathname.split('/').filter(Boolean);
 if(platform==='facebook'&&parts[0]==='profile.php'){u.searchParams.delete('sk');return u.href;}
 const count=platform==='linkedin'||platform==='youtube'&&['channel','c','user'].includes(parts[0]??'')?2:platform==='facebook'&&parts[0]==='pages'?3:1;
 u.pathname='/'+parts.slice(0,count).join('/')+'/';u.search='';return u.href;
}
function jsonDocuments(html:string):unknown[] {
 const result:unknown[]=[];
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  const attrs=match[1]!,body=match[2]!.trim();if(body.length>CRAWL_LIMITS.pageBytes)continue;
  if(/application\/(?:ld\+)?json|__NEXT_DATA__|__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE/i.test(attrs)){
   try{result.push(JSON.parse(body));}catch{try{result.push(JSON.parse(decodePublicText(body)));}catch{/* Not JSON. */}}
  }else if(/^(?:window\.)?(?:_sharedData|ytInitialData)\s*=/.test(body)){
   const json=body.slice(body.indexOf('=')+1).trim().replace(/;\s*$/,'');try{result.push(JSON.parse(json));}catch{/* Never execute scripts. */}
  }
  if(result.length>=80)break;
 }
 return result;
}
export function publicLinks(html:string,base:string):string[] {
 const result=new Set<string>();
 const add=(raw:unknown)=>{if(typeof raw!=='string')return;const url=canonicalPublicUrl(raw,base);if(url)result.add(url);};
 for(const tag of html.match(/<a\b[^>]*>/gi)??[])add(attr(tag,'href'));
 let visited=0;
 const walk=(value:unknown,depth=0)=>{if(!value||depth>12||++visited>10000)return;if(Array.isArray(value)){for(const item of value.slice(0,200))walk(item,depth+1);return;}if(typeof value!=='object')return;
  for(const [key,item] of Object.entries(value))if(['sameAs','url','permalink_url','profile_url','canonical_url','external_url','bio_links'].includes(key)){if(Array.isArray(item))for(const v of item)typeof v==='string'?add(v):walk(v,depth+1);else if(typeof item==='string')add(item);else walk(item,depth+1);}else if(item&&typeof item==='object')walk(item,depth+1);
 };for(const document of jsonDocuments(html))walk(document);
 // Site builders often publish social links only inside escaped configuration JSON.
 if(!socialPlatform(base)){
  const decoded=decodePublicText(html).replace(/\\u002f/gi,'/').replace(/\\u003a/gi,':').replace(/\\u0026/gi,'&').replace(/\\\//g,'/');
  for(const match of decoded.matchAll(/https:\/\/(?:[\w-]+\.)*(?:instagram|facebook|tiktok|youtube|linkedin)\.com\/[^\s<>"'\\]+/gi))add(match[0]);
 }
 return [...result].slice(0,600);
}
function ownProfileRows(html:string,base:string):Record<string,unknown>[] {
 const profile=publicProfileUrl(base),platform=socialPlatform(base),username=new URL(profile??base).pathname.split('/').filter(Boolean)[0]?.replace(/^@/,'').toLowerCase(),rows:Record<string,unknown>[]=[];let visited=0;
 const walk=(value:unknown,depth=0)=>{if(!value||typeof value!=='object'||depth>14||++visited>15000)return;if(Array.isArray(value)){for(const item of value.slice(0,150))walk(item,depth+1);return;}const row=value as Record<string,unknown>,owner=clip(row.username??row.uniqueId,120).replace(/^@/,'').toLowerCase();
  if((platform==='instagram'||platform==='tiktok')&&owner&&owner===username)rows.push(row);
  const types=Array.isArray(row['@type'])?row['@type']:[row['@type']],urls=[row.url,...(Array.isArray(row.sameAs)?row.sameAs:[])];
  if(types.some(t=>['MedicalClinic','MedicalBusiness','LocalBusiness','Organization'].includes(String(t)))&&urls.some(u=>typeof u==='string'&&publicProfileUrl(u)===profile))rows.push(row);
  for(const item of Object.values(row))if(item&&typeof item==='object')walk(item,depth+1);
 };for(const document of jsonDocuments(html))walk(document);return rows;
}
export function publicProfileLinks(html:string,base:string):string[] {
 const links=new Set<string>();const add=(value:unknown,depth=0)=>{if(depth>5)return;if(typeof value==='string'){const url=canonicalPublicUrl(value);if(url)links.add(url);for(const m of value.matchAll(/https:\/\/[^\s<>"']+/g)){const u=canonicalPublicUrl(m[0]);if(u)links.add(u);}}else if(Array.isArray(value))value.slice(0,50).forEach(v=>add(v,depth+1));else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value))if(['url','link','href'].includes(key))add(v,depth+1);};
 for(const row of ownProfileRows(html,base))for(const key of ['external_url','bio_links','bioLinks','website','biography','signature','sameAs'])add(row[key]);
 for(const tag of html.match(/<a\b[^>]*>/gi)??[])if(/\bme\b/.test(attr(tag,'rel')))add(attr(tag,'href'));
 return [...links];
}
export function publicProfileText(html:string,base:string):string {
 const texts=new Set<string>();for(const row of ownProfileRows(html,base))for(const key of ['full_name','nickname','biography','signature','external_url','description','telephone','email']){const value=clip(row[key],8000);if(value)texts.add(value);}return [...texts].join('\n').slice(0,18000);
}
export function extractPublicPosts(html:string,base:string):PublicPage[] {
 const posts=new Map<string,PublicPage>(),platform=socialPlatform(base),profilePath=new URL(base).pathname.split('/').filter(Boolean)[0]?.replace(/^@/,'').toLowerCase();let visited=0;
 const add=(raw:unknown,text:unknown)=>{const url=typeof raw==='string'?canonicalPublicUrl(raw,base):null,value=clip(text,15000);if(!url||value.length<5||socialPlatform(url)!==platform||socialKind(url)!=='post'||posts.size>=CRAWL_LIMITS.posts)return;const old=posts.get(url);if(!old||value.length>old.text.length)posts.set(url,{url,text:value,kind:'post'});};
 const walk=(value:unknown,depth=0)=>{if(!value||typeof value!=='object'||depth>16||++visited>20000)return;if(Array.isArray(value)){for(const v of value.slice(0,150))walk(v,depth+1);return;}
  const row=value as Record<string,any>;
  if(platform==='instagram'&&(row.shortcode||row.code)){
   const owner=clip(row.owner?.username??row.user?.username,120).toLowerCase();
   if(!owner||socialKind(base)==='post'||owner===profilePath){const captions=row.edge_media_to_caption?.edges?.map((e:any)=>clip(e.node?.text,8000)).filter(Boolean).join('\n')||row.caption?.text||row.caption;add(`https://www.instagram.com/p/${row.shortcode??row.code}/`,captions);}
  }
  if(platform==='tiktok'&&row.id&&row.desc){const author=clip(row.author?.uniqueId??row.author?.unique_id??row.author,120);if(author&&(socialKind(base)==='post'||author.replace(/^@/,'').toLowerCase()===profilePath))add(`https://www.tiktok.com/@${author}/video/${row.id}`,row.desc);}
  if(platform==='facebook'&&row.permalink_url){const postUrl=canonicalPublicUrl(row.permalink_url),account=publicProfileUrl(base);if(socialKind(base)==='post'||postUrl&&account&&(new URL(postUrl).pathname.startsWith(new URL(account).pathname.replace(/\/$/,'')+'/')||new URL(account).searchParams.get('id')&&new URL(postUrl).searchParams.get('id')===new URL(account).searchParams.get('id')))add(row.permalink_url,row.message?.text??row.message??row.story?.message?.text??row.description?.text);}
  const types=Array.isArray(row['@type'])?row['@type']:[row['@type']];if(types.some((t:unknown)=>['SocialMediaPosting','BlogPosting','VideoObject'].includes(String(t))))add(row.url??row.mainEntityOfPage?.['@id']??base,row.articleBody??row.description??row.text);
  if(platform==='youtube'&&row.videoId&&row.title)add(`https://www.youtube.com/watch?v=${row.videoId}`,row.title?.runs?.map((r:any)=>r.text).join('')??row.title?.simpleText);
  for(const item of Object.values(row))if(item&&typeof item==='object')walk(item,depth+1);
 };for(const document of jsonDocuments(html))walk(document);
 if(socialKind(base)==='post'){const description=pageMeta(html,'og:description')||pageMeta(html,'description'),text=description||siteIdentity(html,base).text;if(text)add(base,text);}
 return [...posts.values()];
}
function sameWebsite(a:string,b:string){return new URL(a).hostname.toLowerCase().replace(/^www\./,'')===new URL(b).hostname.toLowerCase().replace(/^www\./,'');}
const websitePage=(url:string)=>/service|treatment|branch|contact|about|team|price|offer|blog|news|filler|botox|face|body|laser|hair|skin|tanning|femme|procedur|faq|aesthetic|derma|inject|^\/ar\/?$|خدم|فروع|اتصل|عنا|%d8/i.test(new URL(url).pathname)&&!excludedWebsitePage(url);
function excludedWebsitePage(url:string){const u=new URL(url);return /\.(?:pdf|jpe?g|png|webp|mp4|zip|css|js)$/i.test(u.pathname)||/\/(?:wp-content|wp-includes|wp-json|shop|product|product-category|cart|checkout|my-account|feed|privacy|terms)(?:\/|$)/i.test(u.pathname)||u.searchParams.has('add-to-cart');}
/** Follow supplied sites and their own published profiles/posts, within one finite collection budget. */
export async function crawlPublicBusiness(urls:string[],reader:PublicReader=readPublicSite,options:{milliseconds?:number;pages?:number;onPage?:(progress:{url:string;completed:number;total:number})=>void}={}):Promise<PublicCrawl> {
 const pages:PublicPage[]=[],warnings:PublicCrawl['warnings']=[],scan:PublicScan={pagesRead:0,profilesRead:0,postsRead:0,limited:false};
 const deadline=Date.now()+(options.milliseconds??CRAWL_LIMITS.milliseconds),maxPages=Math.min(options.pages??CRAWL_LIMITS.pages,CRAWL_LIMITS.pages),queue:{url:string;depth:number;root:string;kind:PublicPage['kind']}[]=[],seen=new Set<string>(),postUrls=new Set<string>(),profiles=new Map<string,string>(),readProfiles=new Set<string>();let chars=0,bytes=0,attempts=0,preferPost=false;
 const enqueue=(raw:string,depth:number,root:string)=>{const url=canonicalPublicUrl(raw);if(!url||seen.has(url)||depth>CRAWL_LIMITS.depth)return;const kind=socialPlatform(url)?socialKind(url):'website';if(!kind)return;const profile=kind==='profile'?publicProfileUrl(url):null;
  if(profile&&!profiles.has(profile)){if(profiles.size>=CRAWL_LIMITS.profiles){scan.limited=true;return;}profiles.set(profile,root);}
  if(kind==='post'&&queue.filter(job=>job.kind==='post').length>=CRAWL_LIMITS.posts){scan.limited=true;return;}seen.add(url);queue.push({url,depth,root,kind});};
 for(const raw of urls)enqueue(raw,0,raw);
 const store=(page:PublicPage)=>{const existing=pages.find(p=>p.url===page.url);if(existing){if(page.html){existing.html=page.html;existing.root=page.root;}if(page.text&&!existing.text.includes(page.text)){
   const merged=page.text.includes(existing.text)?page.text:existing.text+'\n'+page.text,available=Math.max(0,CRAWL_LIMITS.textChars-chars)+existing.text.length,next=merged.slice(0,Math.min(24000,available));chars+=next.length-existing.text.length;existing.text=next;
  }return;}if(chars>=CRAWL_LIMITS.textChars){scan.limited=true;return;}page.text=page.text.slice(0,Math.min(24000,CRAWL_LIMITS.textChars-chars));chars+=page.text.length;pages.push(page);if(page.kind==='post'&&!postUrls.has(page.url)){postUrls.add(page.url);scan.postsRead++;}};
 // Discover account pages early; alternate website pages and posts so neither exhausts the budget.
 const take=()=>{let index=queue.findIndex(job=>job.depth===0);if(index<0)index=queue.findIndex(job=>job.kind==='profile');if(index<0){index=queue.findIndex(job=>job.kind===(preferPost?'post':'website'));preferPost=!preferPost;}return queue.splice(index<0?0:index,1)[0]!;};
 while(queue.length&&attempts<maxPages&&Date.now()<deadline&&bytes<CRAWL_LIMITS.totalBytes){
  const batch=Array.from({length:Math.min(CRAWL_LIMITS.concurrency,maxPages-attempts,queue.length)},take);attempts+=batch.length;
  const results=await Promise.allSettled(batch.map(async job=>{
   options.onPage?.({url:job.url,completed:attempts-batch.length,total:Math.min(maxPages,attempts+queue.length)});
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{const page=await Promise.race([reader(job.url,CRAWL_LIMITS.pageBytes),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('crawl_timeout')),Math.max(1,deadline-Date.now()));timer.unref?.();})]);
    bytes+=page.bytes.length;if(!/text\/html|application\/xhtml\+xml/i.test(page.mime))throw new Error('unsupported_content');const url=canonicalPublicUrl(page.url);if(!url||!sameWebsite(url,job.url))throw new Error('redirect_identity_changed');
    if(job.kind==='profile'&&publicProfileUrl(url)!==publicProfileUrl(job.url))throw new Error('redirect_identity_changed');
    const html=page.bytes.toString('utf8'),platform=socialPlatform(url),description=pageMeta(html,'og:description')||pageMeta(html,'description'),title=pageMeta(html,'og:title');
    if(platform&&!title&&!description&&!publicProfileText(html,url)&&!extractPublicPosts(html,url).length)throw new Error('social_content_unavailable');
    if(platform&&/^(?:Instagram|Facebook|TikTok|YouTube|LinkedIn|Log [Ii]n|Sign [Ii]n|Login)(?:\s*[|–-].*)?$/.test(title)&&!extractPublicPosts(html,url).length)throw new Error('social_content_unavailable');
    return {job,url,html,text:[...new Set([title,description,platform?publicProfileText(html,url):decodePublicText(siteIdentity(html,url).text),...(platform&&job.kind==='post'?extractPublicPosts(html,url).filter(p=>p.url===url).map(p=>p.text):[])].filter(Boolean))].join('\n')};
   }finally{if(timer)clearTimeout(timer);}
  }));
  for(const [index,result] of results.entries()){
   const job=batch[index]!;if(result.status==='rejected'){const code=result.reason instanceof Error?result.reason.message:'page_unavailable';warnings.push({url:job.url,code});if(code==='crawl_timeout'||code==='too_large')scan.limited=true;continue;}
   const {url,html,text}=result.value;store({url,text,kind:job.kind,html,root:job.root});if(job.kind==='profile')readProfiles.add(publicProfileUrl(url)!);
   const posts=extractPublicPosts(html,url);for(const post of posts){if(postUrls.size>=CRAWL_LIMITS.posts){scan.limited=true;break;}store({...post,root:job.root});enqueue(post.url,job.depth+1,job.root);}
   if(job.depth>=CRAWL_LIMITS.depth)continue;
   if(job.kind==='profile'){
    const account=publicProfileUrl(url)!;
    // Feed and service sections can contain posts absent from the main profile HTML.
    if(url.replace(/\/$/,'')===account.replace(/\/$/,'')){const platform=socialPlatform(url),sections=platform==='facebook'?['posts','services','about']:platform==='instagram'?['reels']:platform==='youtube'?['videos','shorts']:[];
     for(const section of sections){const sectionUrl=new URL(account);if(sectionUrl.pathname==='/profile.php')sectionUrl.searchParams.set('sk',section==='posts'?'posts':section);else sectionUrl.pathname+=section+'/';enqueue(sectionUrl.href,job.depth+1,job.root);}
    }
    for(const declared of publicProfileLinks(html,url)){if(socialKind(declared)==='profile')enqueue(declared,job.depth+1,job.root);else if(!socialPlatform(declared)&&(socialPlatform(job.root)||sameWebsite(declared,job.root)))enqueue(declared,job.depth+1,socialPlatform(job.root)?declared:job.root);}
   }
   for(const link of publicLinks(html,url)){
    if(!socialPlatform(url)){
     if(!socialPlatform(link)&&sameWebsite(link,job.root)&&(websitePage(link)||websitePage(url)&&!excludedWebsitePage(link))||socialPlatform(link)&&socialKind(link)==='profile')enqueue(link,job.depth+1,job.root);
    }else if(socialPlatform(link)===socialPlatform(url)&&socialKind(link)==='post'&&job.kind==='profile'){
     if(socialPlatform(link)!=='facebook'||new URL(link).pathname.startsWith(new URL(url).pathname.replace(/\/$/,'')+'/'))enqueue(link,job.depth+1,job.root);
    }
    // Public social profiles may link back to their own clinic website. Posts never expand the account boundary.
    else if(job.kind==='profile'&&!socialPlatform(link)&&sameWebsite(link,job.root))enqueue(link,job.depth+1,job.root);
   }
  }
 }
 if(queue.length||Date.now()>=deadline)scan.limited=true;
 // pagesRead counts successful public documents, not failed attempts.
 scan.pagesRead=pages.filter(p=>p.html!==undefined).length;scan.profilesRead=readProfiles.size;scan.profilesDiscovered=profiles.size;return {pages,warnings,scan,profiles:[...profiles].map(([url,root])=>({url,root}))};
}
