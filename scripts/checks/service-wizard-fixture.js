window.fixture={calls:[],failStream:false,previewSeen:false,applied:0};
const empty={branches:[],services:[],rooms:[],staff:[]};
const def={version:1,template:'laser',section:'الليزر',description:'خدمة الليزر للمنطقة التي تحددها العيادة.',audience:'men',bodyArea:'اللحية',medicalScope:'medical',unsupportedCapabilities:[],intakeFields:[]};
const candidate={name:'عيادة الاختبار',summary:'معلومات عامة تجريبية',industry:'عيادة',location:'عمان',website:'https://clinic.example',sources:[{title:'الموقع',url:'https://clinic.example'}],found:true,details:{logoDataUrl:null,colors:[],website:'https://clinic.example',branches:[],services:[{name:'التقييم الأولي',detail:'خدمة مذكورة في الموقع',sourceUrl:'https://clinic.example/services'}],status:'partial'}};
fixture.session={serviceWizard:true,entryMode:'manual',serviceSources:{},serviceSuggestions:[],revision:1,stage:'choice',preferredName:'أحمد',language:'ar',consented:false,draft:structuredClone(empty),uploads:[],ui:'none',navigation:null,companyCandidate:null,companyProfile:candidate,companyChecked:true,message:{id:'m1',role:'assistant',text:'شو الخدمات الطبية اللي بتقدّمها عيادتك؟'},busy:false,applied:null,workflow:{step:'services',label:'الخدمات الطبية',index:0,total:2,prompt:'شو الخدمات الطبية اللي بتقدّمها عيادتك؟',completed:[],focus:null}};
fixture.caps={enabled:true,llm:true,tts:false,stt:false,voice:false,configuredOnly:true,missing:[],formats:['txt'],uploadMaxBytes:8388608,voiceSeconds:3300};
function output(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
function revision(){fixture.session.revision++;fixture.session.message.id='m'+fixture.session.revision;return fixture.session;}
window.fetch=async(url,init={})=>{
 const path=String(url).replace('/api/concierge',''),body=init.body?JSON.parse(init.body):null;fixture.calls.push({path,body,method:init.method||'GET',headers:init.headers});
 const session=fixture.session;
 if(path==='/bootstrap')return output({session,capabilities:fixture.caps});
 if(path==='/start')return output({session:revision(),capabilities:fixture.caps});
 if(path==='/service-options')return output({branches:[{id:1,key:'branch_1',name:'فرع عمان'}],employees:[{id:2,name:'د. ليلى',branchId:1}],rooms:[{id:3,name:'غرفة الليزر',branchId:1,status:'available'}]});
 if(body&&body.revision!==undefined&&body.revision!==session.revision)return output({error:'concierge_stale'},409);
 if(path==='/mode'){session.stage='conversation';session.entryMode=body.mode;session.consented=session.consented||body.consent;return output(revision());}
 if(path==='/draft'){session.draft=structuredClone(body.draft);for(const s of session.draft.services)session.serviceSources[s.key]={kind:'manual',label:'manager',url:null};return output(revision());}
 if(path==='/review'){const issues=[];for(const s of session.draft.services){for(const f of ['name','price','durationMinutes','currency','requiresRoom','branchScope'])if(s[f]===null)issues.push({key:s.key,field:f,code:'required'});if(s.definition.medicalScope!=='medical')issues.push({key:s.key,field:'definition.medicalScope',code:'medical_review_required'});}return output({revision:session.revision,draft:session.draft,issues,staffAccess:[],grantablePermissions:[],options:{branches:[],services:[]}});}
 if(path==='/apply'){if(!body.confirmed)return output({error:'confirmation_required'},400);fixture.applied++;session.stage='complete';return output(revision());}
 if(path==='/import-links'){session.companyCandidate=structuredClone(candidate);return output(revision());}
 if(path==='/company-confirm'){if(body.choice==='yes'||body.answer==='yes'||body.decision==='yes'){session.companyCandidate=null;session.serviceSuggestions=[{key:'public_service_1',name:'التقييم الأولي',detail:'خدمة مذكورة في الموقع',sourceUrl:'https://clinic.example/services'}];}else session.companyCandidate=null;return output(revision());}
 if(path==='/service-suggestion'){session.draft.services.push({key:'selected_public',name:'التقييم الأولي',nameLang:'ar',branchKey:null,branchScope:null,durationMinutes:null,price:null,currency:null,category:'Other',requiresRoom:null,employeeIds:null,roomIds:null,definition:{...def,template:'consultation',section:'الاستشارات',bodyArea:null,audience:'unspecified',medicalScope:'needs_review'}});session.serviceSuggestions=[];return output(revision());}
 if(path==='/turn-stream'){
  const prior=structuredClone(session.draft),service={key:'beard_laser',name:'ليزر اللحية للرجال',nameLang:'ar',branchKey:null,branchScope:null,durationMinutes:null,price:null,currency:null,category:'Laser',requiresRoom:null,employeeIds:null,roomIds:null,definition:structuredClone(def)};
  const encode=new TextEncoder();const event=(e,v)=>encode.encode('event: '+e+'\ndata: '+JSON.stringify(v)+'\n\n');
  return new Response(new ReadableStream({start(controller){controller.enqueue(event('service.preview',{revision:session.revision,service}));fixture.previewSeen=true;setTimeout(()=>{if(fixture.failStream){controller.close();return;}session.draft={...prior,services:[service]};session.serviceSources[service.key]={kind:'conversation',label:'AI',url:null};session.message.text='كم مدة الموعد عندكم؟';controller.enqueue(event('session.committed',revision()));controller.close();},700);}}),{headers:{'Content-Type':'text/event-stream'}});
 }
 console.error('UNHANDLED FIXTURE',path,body);return output({error:'fixture_unhandled_'+path},404);
};
window.testNav=[];window.testApplied=0;window.testView=new ConciergeView({onNavigate:p=>testNav.push(p),onApplied:()=>testApplied++,onStaffHelp:()=>{}});
