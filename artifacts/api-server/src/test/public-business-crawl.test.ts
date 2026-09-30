import { afterEach, describe, expect, it, vi } from 'vitest';
import { crawlPublicBusiness, extractPublicPosts, canonicalPublicUrl, publicLinks, publicProfileText, publicProfileUrl, socialKind } from '../concierge/public-business-crawl';
import { lookupLinkedClinic } from '../concierge/linked-clinic';
import { enrichCompany, verifiedPublicDetails } from '../concierge/company-details';
const site='https://clinic.example/',profile='https://www.instagram.com/clinic_example/',post='https://www.instagram.com/p/facial1/';
const business=(name='Clinic Example')=>`<script type="application/ld+json">${JSON.stringify({'@type':'MedicalClinic',name,telephone:'+962790000001'})}</script>`;
const instagram=(nodes:unknown[])=>`<meta property="og:title" content="Clinic Example (@clinic_example) • Instagram photos and videos"><script type="application/json">${JSON.stringify({data:{user:{edge_owner_to_timeline_media:{edges:nodes.map(node=>({node}))}}}})}</script>`;
const node=(shortcode:string,text:string,username='clinic_example')=>({shortcode,owner:{username},edge_media_to_caption:{edges:[{node:{text}}]}});
const readerFor=(pages:Record<string,string>)=>vi.fn(async(url:string)=>{if(!pages[url])throw new Error('unavailable');return {url,bytes:Buffer.from(pages[url]),mime:'text/html'};});
afterEach(()=>vi.unstubAllEnvs());
describe('public clinic sites, social profiles and posts',()=>{
 it('finds escaped site-builder social links and unwraps published social bio redirects',()=>{
  const facebook='https://www.facebook.com/clinic/';
  const html=`<script>window.settings={social:"https:\\/\\/instagram.com\\/clinic_example\\/"}</script><script type="application/json">${JSON.stringify({socialLinks:[facebook]})}</script>`;
  expect(publicLinks(html,site)).toEqual(expect.arrayContaining([profile,facebook]));
  expect(canonicalPublicUrl('https://l.instagram.com/?u='+encodeURIComponent(site+'services?utm_source=ig'))).toBe(site+'services');
  expect(canonicalPublicUrl('https://l.facebook.com/l.php?u='+encodeURIComponent('javascript:alert(1)'))).toBeNull();
  expect(publicProfileUrl(facebook+'services/')).toBe(facebook);expect(socialKind(facebook+'services/')).toBe('profile');
  expect(publicProfileUrl('https://www.facebook.com/profile.php?id=123&sk=about')).toBe('https://www.facebook.com/profile.php?id=123');
 });
 it('prioritizes discovered accounts over a long website menu within a small page budget',async()=>{
  const reader=readerFor({[site]:business()+Array.from({length:30},(_,i)=>`<a href="/services/${i}">Services</a>`).join('')+`<a href="${profile}">Instagram</a>`,[profile]:instagram([node('facial1','Deep facial cleansing at Clinic Example')])});
  const result=await crawlPublicBusiness([site],reader,{pages:4});expect(reader.mock.calls.map(([url])=>url)).toContain(profile);expect(result.scan.profilesDiscovered).toBe(1);expect(result.pages.some(page=>page.url===post)).toBe(true);
 });
 it('reads a Facebook service section and follows exact-account bio links across platforms',async()=>{
  const facebook='https://www.facebook.com/clinic/',facebookServices=facebook+'services/';
  const html=instagram([])+`<script type="application/json">${JSON.stringify({user:{username:'clinic_example',bio_links:[{url:facebook}]},suggested:{username:'unrelated',bio_links:[{url:'https://www.tiktok.com/@foreign/'}]}})}</script>`;
  const reader=readerFor({[site]:business()+`<a href="${profile}">Instagram</a>`,[profile]:html,[facebook]:'<meta property="og:title" content="Clinic Example">',[facebookServices]:'<meta property="og:title" content="Clinic Example"><script type="application/ld+json">'+JSON.stringify({'@type':'Service',name:'Skin consultation'})+'</script>'});
  const result=await lookupLinkedClinic([site],reader);expect(result.socialProfiles).toEqual([profile,facebook]);expect(result.publicScan?.profilesRead).toBe(2);expect(result.details?.services.some(s=>s.name==='Skin consultation')).toBe(true);expect(reader.mock.calls.some(([url])=>url.includes('foreign'))).toBe(false);
 });
 it('follows treatment pages with names outside services and improves a truncated post with its full caption',async()=>{
  const short='Skin consultation at Clinic Example',full=short+' costs 25 JOD; appointment duration is 30 minutes.';
  const reader=readerFor({[site]:business()+`<a href="${profile}">Instagram</a><a href="/fillers-botox/">Fillers</a><a href="/femme/">Femme</a>`,[site+'fillers-botox/']:business()+`<a href="/cryolipo/">Cryolipo</a><a href="/product/gloves/">Shop</a>`,[site+'femme/']:business(),[site+'cryolipo/']:business(),[profile]:instagram([node('facial1',short)]),[post]:'<meta property="og:description" content="'+full+'">'});
  const result=await crawlPublicBusiness([site],reader);expect(result.pages.find(p=>p.url===post)?.text).toBe(full);expect(result.pages.some(p=>p.url===site+'cryolipo/')).toBe(true);expect(reader.mock.calls.some(([url])=>url.includes('/product/'))).toBe(false);
 });
 it('retains blocked official account URLs and excludes rejected clinic accounts from supplemental search',async()=>{
  const other='https://other.example/',foreign='https://www.instagram.com/foreign/';
  const result=await lookupLinkedClinic([site,other],readerFor({[site]:business()+`<a href="${profile}">Instagram</a>`,[other]:business('Other Clinic')+`<a href="${foreign}">Instagram</a>`}));
  expect(result.socialProfiles).toEqual([profile]);expect(result.publicScan?.profilesDiscovered).toBe(1);
 });
 it('deduplicates slash variants and does not promote personal doctor or demo treatment-page numbers to clinic contacts',async()=>{
  const doctor=site+'team/doctor/',treatment=site+'femme/';
  const reader=readerFor({[site]:business()+`<a href="${profile}">Instagram</a><a href="${profile.replace(/\/$/,'')}">Instagram</a><a href="${doctor}">Doctor</a><a href="${treatment}">Treatment</a>`,[profile]:instagram([]),[doctor]:business()+`<a href="tel:+962790000009">Doctor</a>`,[treatment]:business()+`<a href="tel:18408412569">Demo</a>`});
  const result=await lookupLinkedClinic([site],reader);expect(reader.mock.calls.filter(([url])=>url===profile)).toHaveLength(1);expect(result.workspaceFacts.filter(f=>f.field==='phone').map(f=>f.value)).toEqual(['+962790000001']);expect(result.workspaceFacts.filter(f=>f.field==='website').map(f=>f.value)).toEqual([site]);
 });
 it('keeps linked provider profile names and other practice websites separate from the clinic identity',async()=>{
  const doctor='https://www.instagram.com/dr_doctor/',other='https://another-practice.example/';
  const html='<meta property="og:title" content="Doctor Name (@dr_doctor)"><script type="application/json">'+JSON.stringify({user:{username:'dr_doctor',biography:'Appointments +962790000009',external_url:other}})+'</script>';
  const reader=readerFor({[site]:business()+`<a href="${doctor}">Our doctor</a>`,[doctor]:html,[other]:business('Another Practice')});
  const result=await lookupLinkedClinic([site],reader);expect(result.socialProfiles).toContain(doctor);expect(result.workspaceFacts.filter(f=>f.field==='nameEn').map(f=>f.value)).toEqual(['Clinic Example']);expect(result.workspaceFacts.filter(f=>f.field==='phone').map(f=>f.value)).toEqual(['+962790000001']);expect(reader.mock.calls.some(([url])=>url===other)).toBe(false);
 });
 it('excludes another Facebook account from a clinic feed and keeps the longest duplicate caption',()=>{
  const facebook='https://www.facebook.com/clinic/',caption='Clinic Example offers a published laser service with appointment details.';
  const html=`<script type="application/json">${JSON.stringify({posts:[{permalink_url:facebook+'posts/123/',message:caption},{permalink_url:'https://www.facebook.com/foreign/posts/123/',message:'Foreign clinic surgery'}]})}</script>`;
  expect(extractPublicPosts(html,facebook)).toHaveLength(1);expect(extractPublicPosts(instagram([node('facial1',caption),node('facial1','Clinic Example offers laser')]),profile)[0]?.text).toBe(caption);
 });
 it('follows the official social account from a supplied website and keeps full captions with their post URLs',async()=>{
  const reader=readerFor({[site]:business()+`<a href="${profile}?igsh=tracking">Instagram</a><a href="/services">Services</a><a href="https://unrelated.example/">Unrelated</a>`,[site+'services']:business()+`<a href="${profile}">Instagram</a>`,[profile]:instagram([node('facial1','Deep facial cleansing at Clinic Example costs 30 JOD.'),node('facial1','Deep facial cleansing at Clinic Example costs 30 JOD.'),node('foreign','Another clinic offers surgery.','another_clinic')]),[post]:'<meta property="og:description" content="Deep facial cleansing at Clinic Example costs 30 JOD.">'});
  const result=await crawlPublicBusiness([site],reader);
  expect(result.pages.find(p=>p.url===post)?.text).toBe('Deep facial cleansing at Clinic Example costs 30 JOD.');
  expect(result.scan).toMatchObject({profilesRead:1,postsRead:1,pagesRead:4});
  expect(reader.mock.calls.some(([url])=>url.includes('unrelated')||url.includes('foreign'))).toBe(false);
 });
 it('parses Facebook story captions, TikTok videos and JSON-LD posts without evaluating scripts',()=>{
  const facebook='https://www.facebook.com/clinic/posts/123/';
  expect(extractPublicPosts(`<script type="application/json">${JSON.stringify({story:{permalink_url:facebook,message:{text:'Laser hair removal at our clinic'}}})}</script>`,'https://www.facebook.com/clinic/')[0]).toMatchObject({url:facebook,text:'Laser hair removal at our clinic'});
  expect(extractPublicPosts(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({itemList:[{id:'123',desc:'New facial service',author:{uniqueId:'clinic'}}]})}</script>`,'https://www.tiktok.com/@clinic')[0]?.url).toBe('https://www.tiktok.com/@clinic/video/123');
  expect(extractPublicPosts(`<script type="application/ld+json">${JSON.stringify({'@type':'SocialMediaPosting',url:post,articleBody:'Published facial description'})}</script>`,profile)[0]?.text).toBe('Published facial description');
  expect(extractPublicPosts('<script type="application/json">not JSON; process.exit()</script>',profile)).toEqual([]);
 });
 it('deduplicates tracking URLs and follows sameAs links, excluding executable links',()=>{
  expect(canonicalPublicUrl('https://instagram.com/clinic_example/?igsh=abc#top')).toBe(profile);
  expect(publicLinks(`<a href="javascript:alert(1)">bad</a><script type="application/ld+json">${JSON.stringify({sameAs:[profile]})}</script>`,site)).toEqual([profile]);
 });
 it('reads the selected account bio and excludes suggested accounts from profile information',()=>{
  const html=`<script type="application/json">${JSON.stringify({users:[{username:'clinic_example',full_name:'Clinic Example',biography:'Facials and laser appointments',external_url:site},{username:'another_clinic',biography:'Other clinic treatments'}]})}</script>`;
  const text=publicProfileText(html,profile);expect(text).toContain('Facials and laser appointments');expect(text).toContain(site);expect(text).not.toContain('Other clinic treatments');
 });
 it('follows the clinic website declared in the supplied social profile bio',async()=>{
  const html=instagram([])+`<script type="application/json">${JSON.stringify({user:{username:'clinic_example',external_url:site}})}</script>`,reader=readerFor({[profile]:html,[site]:business()+`<a href="/services">Services</a>`,[site+'services']:business()});
  const result=await crawlPublicBusiness([profile],reader);expect(result.pages.some(p=>p.url===site)).toBe(true);expect(result.pages.some(p=>p.url===site+'services')).toBe(true);
 });
 it('preserves website information when a social page blocks anonymous reading',async()=>{
  const reader=readerFor({[site]:business()+`<a href="${profile}">Instagram</a>`,[profile]:'<meta property="og:title" content="Instagram">'});
  const result=await lookupLinkedClinic([site],reader);
  expect(result.found).toBe(true);expect(result.workspaceFacts.find(f=>f.field==='phone')?.value).toBe('+962790000001');
  expect(result.linkWarnings).toContainEqual({url:profile,code:'social_content_unavailable'});expect(result.publicScan?.postsRead).toBe(0);
 });
 it('rejects cross-host redirects and does not merge an unrelated supplied clinic',async()=>{
  const reader=readerFor({[site]:business(),['https://other.example/']:business('Other Clinic')});
  const result=await lookupLinkedClinic([site,'https://other.example/'],reader);expect(result.name).toBe('Clinic Example');expect(result.collectedPages?.some(p=>p.url.includes('other.example'))).toBe(false);
  const redirected=await crawlPublicBusiness([site],async()=>({url:'https://other.example/',bytes:Buffer.from(business()),mime:'text/html'}));expect(redirected.pages).toEqual([]);expect(redirected.warnings[0]?.code).toBe('redirect_identity_changed');
 });
 it('stops at the page budget and retains collected results at the deadline',async()=>{
  const html=business()+Array.from({length:100},(_,i)=>`<a href="/services/${i}">Service</a>`).join(''),reader=readerFor({[site]:html});
  const result=await crawlPublicBusiness([site],reader,{pages:4});expect(reader).toHaveBeenCalledTimes(4);expect(result.scan.limited).toBe(true);
  const delayed=await crawlPublicBusiness([site],()=>new Promise(()=>{}),{milliseconds:10});expect(delayed.scan.limited).toBe(true);expect(delayed.pages).toEqual([]);
 });
 it('accepts only evidence from a collected page/post and merges repeated services',()=>{
  const pages=[{url:post,text:'Deep facial cleansing   costs 30 JOD.',kind:'post' as const}],valid={name:'Deep facial cleansing',detail:'30 JOD',sourceUrl:post,evidence:'Deep facial cleansing costs 30 JOD.'};
  const result=verifiedPublicDetails({services:[valid,valid,{...valid,name:'Fabricated',evidence:'Nonexistent quote'},{...valid,name:'Wrong source',sourceUrl:'https://foreign.example'}],branches:[]},pages);expect(result.services).toHaveLength(1);expect(result.services[0]?.sourceUrl).toBe(post);expect(result.services[0]?.evidence).toBe(valid.evidence);
 });
 it('verifies HTML entity equivalents while still requiring the published quote and exact source',()=>{
  const pages=[{url:site,text:'Botox &amp; fillers &#8211; published appointments.',kind:'website' as const}],item={name:'Botox',detail:'Published treatment',sourceUrl:site,evidence:'Botox & fillers – published appointments.'};
  expect(verifiedPublicDetails({services:[item],branches:[]},pages).services).toHaveLength(1);
  expect(verifiedPublicDetails({services:[{...item,evidence:'Botox costs 100 JOD.'}],branches:[]},pages).services).toHaveLength(0);
 });
 it('enriches more than fifteen services directly from collected posts without another crawl',async()=>{
  vi.stubEnv('OPENAI_API_KEY','synthetic-key');vi.stubEnv('JORMALL_OPENAI_API_KEY','');
  const pages=Array.from({length:22},(_,i)=>({url:`https://www.instagram.com/p/service${i}/`,text:`Service ${i} offered at Clinic Example for 30 JOD.`,kind:'post' as const}));
  const reader=vi.fn(async()=>{throw new Error('Unexpected second crawl');}),transport=vi.fn(async(_url:string,init?:RequestInit)=>{const input=JSON.parse(String(init?.body)),sources=JSON.parse(input.input);return new Response(JSON.stringify({status:'completed',output:[{content:[{text:JSON.stringify({branches:[],services:sources.map((p:any)=>({name:p.text.split(' offered')[0],detail:'30 JOD',sourceUrl:p.url,evidence:p.text}))})}]}]}));});
  const candidate={name:'Clinic Example',summary:'',industry:null,location:null,website:site,sources:[],found:true};
  const result=await enrichCompany(candidate,'en',[],pages,{reader,transport:transport as typeof fetch});expect(result.services).toHaveLength(22);expect(transport).toHaveBeenCalledTimes(2);expect(reader).not.toHaveBeenCalled();
 });
});
