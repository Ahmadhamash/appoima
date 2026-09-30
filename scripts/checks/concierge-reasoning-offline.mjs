/** Exercise the actual outbound request paths without a database or paid API calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),cache=new Map();
function load(relative){
 const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('module','exports','require',source)(module,module.exports,name=>name==='@workspace/service-definition'?load('lib/service-definition/src/index.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name));
 return module.exports;
}
process.env.OPENAI_API_KEY='synthetic-reasoning-contract-key';
process.env.JORMALL_OPENAI_API_KEY='';
process.env.CONCIERGE_LLM_MODEL='gpt-6-luna';
process.env.CONCIERGE_REASONING_EFFORT='xhigh';
const config=load('artifacts/api-server/src/concierge/config.ts');
const provider=load('artifacts/api-server/src/concierge/providers.ts');
const {enrichCompany}=load('artifacts/api-server/src/concierge/company-details.ts');
const {indexedSocialDetails}=load('artifacts/api-server/src/concierge/indexed-social.ts');
const core=load('artifacts/api-server/src/domain/concierge-core.ts');
const calls=[];
const response=(text,sources=[])=>new Response(JSON.stringify({status:'completed',output:[...(sources.length?[{type:'web_search_call',action:{sources}}]:[]),{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}));
const transport=(name,text,sources=[])=>async(url,init)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');
 const body=JSON.parse(init.body);assert.equal(body.model,'gpt-6-luna');assert.deepEqual(body.reasoning,{effort:process.env.CONCIERGE_REASONING_EFFORT});assert.equal(body.store,false);
 calls.push(name);return response(text,sources);
};
const empty=core.emptyDraft();
await provider.callDirector({language:'en',preferredName:null,context:{},draft:empty,messages:[],text:'Clinic setup'},undefined,transport('setup-director',JSON.stringify({reply:'Review clinic details.',ui:'none',navigation:'none',patch:empty,fileRead:null,fileSummary:null})));
const classified=await provider.classifyCompanyVoiceUtterance('Clinic Example in Amman',transport('voice-classification',JSON.stringify({intent:'company_identity',query:'Clinic Example in Amman'})));
assert.equal(classified.intent,'company_identity');
const site='https://clinic.example/',profile='https://www.instagram.com/clinic_example/';
const candidates=await provider.lookupCompany('Clinic Example in Amman','en',transport('clinic-search',`CANDIDATE|Clinic Example|Amman clinic|${site}`,[{url:site,title:'Clinic Example'}]));
assert(candidates.some(candidate=>candidate.found&&candidate.sources[0].url===site));
const social=await indexedSocialDetails(profile,'Clinic Example','en',transport('indexed-social',`PROFILE|Clinic Example|${profile}`,[{url:profile,title:'Clinic Example (@clinic_example)'}]));
assert(social);
const page={url:site,text:'Laser hair removal costs 35 JOD.',kind:'website'};
const details=await enrichCompany({name:'Clinic Example',summary:'',industry:null,location:null,website:site,sources:[],found:true},'en',[],[page],{transport:transport('service-extraction',JSON.stringify({branches:[],services:[{name:'Laser hair removal',detail:'35 JOD',sourceUrl:site,evidence:page.text}]}))});
assert.equal(details.services.length,1);
process.env.CONCIERGE_REASONING_EFFORT='high';
await provider.classifyCompanyVoiceUtterance('Hello',transport('configured-effort-override',JSON.stringify({intent:'conversation',query:null})));
assert.equal(config.conciergeConfig({}).reasoningEffort,'xhigh');
assert.equal(calls.length,6);
console.log('PASS: xhigh reaches all five concierge Responses paths; source checks and structured output remain valid; configured effort overrides reach the provider.');
