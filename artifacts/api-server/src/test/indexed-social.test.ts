import {afterEach,describe,expect,it,vi} from 'vitest';
import {indexedSocialDetails,enrichBlockedSocial,indexedProfilesFor} from '../concierge/indexed-social';
const profile='https://www.instagram.com/clinic_example/',post='https://www.instagram.com/p/facial1/';
const response=(text:string,sources:{url:string;title:string}[])=>new Response(JSON.stringify({status:'completed',output:[{type:'web_search_call',action:{sources}},{type:'message',content:[{type:'output_text',text}]}]}));
const configure=()=>{vi.stubEnv('OPENAI_API_KEY','synthetic-key');vi.stubEnv('JORMALL_OPENAI_API_KEY','');};
afterEach(()=>vi.unstubAllEnvs());
describe('public indexed social fallback',()=>{
 it('supplements every discovered account even when another account already yielded readable posts',async()=>{
  configure();const facebook='https://www.facebook.com/clinic/';
  const candidate={name:'Clinic Example',summary:'',industry:null,location:null,website:'https://clinic.example/',sources:[],found:true,socialProfiles:[profile,facebook],publicScan:{pagesRead:3,profilesRead:1,postsRead:1,limited:false}};
  expect(indexedProfilesFor(candidate,[])).toEqual([profile,facebook]);
  const transport=vi.fn(async(_url:string,init?:RequestInit)=>{const payload=JSON.parse(String(init?.body)),fb=payload.input.includes('facebook.com'),url=fb?facebook+'posts/2/':post;return response(`SERVICE|${fb?'Lip filler':'Facial'}|${url}|Clinic Example offers ${fb?'lip filler':'facial'} appointments`,[{url,title:'Clinic Example public post'}]);});
  await enrichBlockedSocial(candidate,[profile,profile+'reels/',facebook,facebook+'services/'],'en',transport as typeof fetch);
  expect(transport).toHaveBeenCalledTimes(2);expect((candidate as any).details.services).toHaveLength(2);
  expect(indexedProfilesFor({...candidate,socialProfiles:[]},[profile])).toEqual([]);
 });
 it('establishes the exact blocked profile and labels services from cited, attributed post results',async()=>{
  configure();const transport=vi.fn(async()=>response(`PROFILE|Clinic Example|${profile}\nSERVICE|Deep facial cleansing|${post}|Clinic Example offers deep facial cleansing for 30 JOD`,[{url:profile,title:'Clinic Example (@clinic_example)'},{url:post,title:'Clinic Example on Instagram: facial cleansing'}]));
  const result=await indexedSocialDetails(profile,'','en',transport as typeof fetch);expect(result?.name).toBe('Clinic Example');expect(result?.details.services[0]).toMatchObject({sourceUrl:post,sourceKind:'indexed'});
 });
 it('rejects fabricated URLs, other accounts and unsupported account identity',async()=>{
  configure();const text=`PROFILE|Clinic Example|${profile}\nSERVICE|Fabricated|https://www.instagram.com/p/madeup/|Clinic Example offers a treatment\nSERVICE|Other clinic|https://www.instagram.com/p/foreign/|Another clinic offers surgery`;
  const result=await indexedSocialDetails(profile,'','en',async()=>response(text,[{url:profile,title:'Clinic Example'},{url:'https://www.instagram.com/p/foreign/',title:'Different clinic'}]));expect(result?.details.services).toEqual([]);
  expect(await indexedSocialDetails(profile,'','en',async()=>response(text,[{url:post,title:'Clinic Example'}]))).toBe(null);
 });
 it('preserves directly read clinic details when an indexed provider request fails',async()=>{
  configure();const candidate={name:'Clinic Example',summary:'',industry:null,location:null,website:'https://clinic.example/',sources:[],found:true,details:{logoDataUrl:null,colors:[],website:null,branches:[],services:[{name:'Existing facial',detail:'Direct page',sourceUrl:'https://clinic.example/'}],status:'partial' as const}};
  await enrichBlockedSocial(candidate,[profile],'en',async()=>new Response('',{status:503}));expect(candidate.details.services).toHaveLength(1);expect(candidate.name).toBe('Clinic Example');
 });
 it('filters search to the social platform and does not call a provider without a configured key',async()=>{
  configure();let request:any;const transport=async(_url:string,init?:RequestInit)=>{request=JSON.parse(String(init?.body));return response('NO_MATCH',[]);};
  await indexedSocialDetails(profile,'','en',transport as typeof fetch);expect(request.tools[0].filters.allowed_domains).toEqual(['instagram.com']);expect(request.include).toContain('web_search_call.action.sources');
  vi.stubEnv('OPENAI_API_KEY','');const unused=vi.fn();expect(await indexedSocialDetails(profile,'','en',unused)).toBe(null);expect(unused).not.toHaveBeenCalled();
 });
});
