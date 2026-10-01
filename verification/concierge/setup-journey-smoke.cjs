// Real application UI with isolated API fixtures, including against deployed static assets.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
const user = {id:104,clinicId:10,branchId:null,name:'Manager',nameLang:'en',email:'setup@example.test',role:'manager',permissions:['settings','services','rooms','employees','appointments','customers'].flatMap(area=>[area+'.read',area+'.manage']),mustChangePassword:false,nav:['home','business','people','appointments'],home:'manager'};
const profile = {version:1,nameAr:'مركز الاختبار',nameEn:'Example Clinic',subtitleAr:null,subtitleEn:null,phone:null,email:null,address:null,website:null,logoDataUrl:null,primaryColor:'#806835',accentColor:'#D94B3D'};
const week={mon:[{open:'09:00',close:'17:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]},closed={...week,mon:[]};
const branch={id:1,key:'branch_1',existingId:1,name:'Example branch',nameLang:'en',timeZone:'Asia/Amman',openingHours:week};
const candidate={name:'Karmalite',summary:'Public result',industry:null,location:null,website:null,found:true,sources:[],socialProfiles:Array.from({length:8},(_,i)=>`https://www.instagram.com/profile${i}/`),publicScan:{profilesDiscovered:8,pagesRead:20,profilesRead:0,postsRead:0,indexedSources:1,limited:true}};
const caps={enabled:true,llm:true,tts:false,stt:false,voice:false,publicLinks:true,configuredOnly:true,missing:[],formats:[],uploadMaxBytes:1000000,voiceSeconds:60};
const order=['company','branches','services','rooms','staff','review'];

async function mount(browser,width,language,search=false){
 const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 let session={revision:1,stage:'conversation',language,preferredName:'Manager',consented:true,serviceWizard:false,entryMode:'text',sourceImport:true,importReviewPending:false,importApproved:false,workspace:{profile,sources:{},baseRevision:1,dirty:false,proposals:[]},draft:{branches:[branch],services:[{key:'service_1',name:'Facial',nameLang:'en',branchKey:'branch_1',branchScope:'branch',durationMinutes:30,price:'20',currency:'JOD',category:'Skin',requiresRoom:false}],rooms:[],staff:[{key:'staff_1',name:'Member',nameLang:'en',email:'member@example.test',phone:null,jobTitle:null,role:'secretary',branchKey:'branch_1',serviceKeys:[],workingHours:week,breaks:closed}]},uploads:[],companyChecked:!search,companyCandidate:search?candidate:null,companyCandidates:[],companyProfile:search?null:candidate,workflow:{step:search?'company':'staff',label:'Staff',index:search?0:4,total:6,completed:search?[]:['branches','services','rooms'],prompt:'Add staff',focus:null},message:{id:'m1',role:'assistant',text:'Add staff'},ui:'none',busy:false,applied:null};
 await context.addInitScript(language=>{localStorage.setItem('jormall.lang',language);sessionStorage.setItem('jormall:working-branch:104','1');},language);
 await page.route('**/api/**',async route=>{
  const req=route.request(),endpoint=new URL(req.url()).pathname,data=req.method()==='GET'?null:req.postDataJSON();
  if(data)writes.push({endpoint,data});let body={};
  if(endpoint==='/api/auth/me')body={user};
  else if(endpoint==='/api/me/workspace')body={revision:1,profile,sources:{},sections:[],pendingServices:[],truncated:false};
  else if(endpoint==='/api/me/clinic')body={clinic:{id:10,name:'Example Clinic',nameLang:'en',progress:{hasBranchHours:true,hasCatalog:true,hasStaff:false,hasFirstAppointment:false,branchCount:1,staffCount:0}}};
  else if(endpoint==='/api/concierge/bootstrap'||endpoint==='/api/concierge/start'){if(data)session={...session,language:data.language,revision:session.revision+1};body={session,capabilities:caps,consentVersion:'1'};}
  else if(endpoint==='/api/clinic/options')body={branches:[branch],services:[],rooms:[],employees:[],timeZones:['Asia/Amman'],currencies:['JOD'],grantablePermissions:user.permissions,rolePresets:{secretary:[]}};
  else if(endpoint==='/api/concierge/draft'){session={...session,draft:data.draft,revision:session.revision+1};body=session;}
  else if(endpoint==='/api/concierge/step-select'||endpoint==='/api/concierge/step-back'){
   const step=data.step||order[order.indexOf(session.workflow.step)-1];
   const availableSteps=[...new Set([...(session.workflow.availableSteps||[]),...session.workflow.completed,session.workflow.step,step,'company'])];
   session={...session,revision:session.revision+1,workflow:{...session.workflow,step,index:order.indexOf(step),availableSteps}};body=session;
  }else if(endpoint==='/api/concierge/company-confirm'){
   assert.equal(data.answer,'retry');session={...session,revision:session.revision+1,companyCandidate:null,companyCandidates:[],companyProfile:null,companyChecked:false,importReviewPending:false,importApproved:false,branding:null};body=session;
  }else if(endpoint==='/api/concierge/mode'){session={...session,revision:session.revision+1};body=session;}
  else if(endpoint==='/api/concierge/company-lookup'){session={...session,revision:session.revision+1,companyCandidate:{...candidate,name:data.query},workflow:{...session.workflow,step:'company'}};body=session;}
  else if(endpoint==='/api/clinic/scheduling/home')body={items:[],total:0,next:null,ownOnly:false};
  else if(/^\/api\/clinic\/(branches|services|rooms|employees|customers|appointments|waiting-list)$/.test(endpoint))body={items:[],total:0,page:1,pageSize:20};
  await route.fulfill({status:200,json:body});
 });
 return {context,page,errors,writes,current:()=>session};
}
async function screenshot(page,name){if(!process.env.SETUP_SCREEN_DIR)return;require('node:fs').mkdirSync(process.env.SETUP_SCREEN_DIR,{recursive:true});await page.screenshot({path:require('node:path').join(process.env.SETUP_SCREEN_DIR,name+'.png')});}
async function layout(page){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const id of ['concierge-setup-journey','concierge-step-back']){
  const bounds=await page.getByTestId(id).boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=await page.evaluate(()=>innerWidth)+1);
 }
 assert.equal(await page.getByTestId('concierge-step-back').evaluate(node=>!!node.closest('details')),false);
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const [width,language] of [[1440,'en'],[390,'ar']]){
  const state=await mount(browser,width,language),{page}=state;
  try{
   await page.goto(base+'/clinic-setup');await page.getByTestId('setup-staff_1-name').waitFor();
   assert.equal(await page.getByTestId('concierge-journey-staff').getAttribute('aria-current'),'step');assert.equal(await page.getByTestId('concierge-journey-review').isDisabled(),true);
   await page.getByTestId('setup-staff_1-name').fill('Edited member');await page.getByTestId('concierge-journey-branches').click();
   await page.getByTestId('setup-branch_1-name').waitFor();assert.equal(state.current().draft.staff[0].name,'Edited member');
   const savedIndex=state.writes.findIndex(w=>w.endpoint==='/api/concierge/draft'),navIndex=state.writes.findIndex(w=>w.endpoint==='/api/concierge/step-select');assert(savedIndex>=0&&navIndex>savedIndex);
   await page.getByTestId('concierge-journey-staff').click();await page.getByTestId('setup-staff_1-name').waitFor();assert.equal(await page.getByTestId('setup-staff_1-name').inputValue(),'Edited member');
   await page.getByTestId('concierge-journey-branches').click();await page.getByTestId('setup-branch_1-name').waitFor();
   await page.getByTestId('setup-branch_1-name').fill('Edited branch');await page.getByTestId('concierge-journey-rooms').click();
   await page.getByTestId('concierge-journey-rooms').waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid=concierge-journey-rooms]')?.getAttribute('aria-current')==='step');
   assert.equal(state.current().draft.branches[0].name,'Edited branch');assert.deepEqual(state.current().workflow.completed,['branches','services','rooms']);
   await page.getByTestId('concierge-journey-branches').click();await page.getByTestId('setup-branch_1-name').waitFor();assert.equal(await page.getByTestId('setup-branch_1-name').inputValue(),'Edited branch');
   await page.reload();await page.getByTestId('setup-branch_1-name').waitFor();assert.equal(await page.getByTestId('setup-branch_1-name').inputValue(),'Edited branch');
   await layout(page);await screenshot(page,`journey-${width}`);
   await page.getByTestId('concierge-step-back').click();await page.waitForFunction(()=>document.querySelector('[data-testid=concierge-journey-company]')?.getAttribute('aria-current')==='step');
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await page.getByText('وقفنا الميكروفون لما غبت عن الصفحة. شغّله لما ترجع.').count(),0);
   assert.deepEqual(state.errors,[]);console.log(`PASS: journey saves edits, revisits sections, resumes and exposes Back (${width}px, ${language})`);
  }catch(e){console.error(state.errors,await page.locator('body').innerText());throw e;}finally{await state.context.close();}
  const search=await mount(browser,width,language,true);
  try{
   const {page}=search;await page.goto(base+'/clinic-setup');const summary=page.getByTestId('concierge-public-search-summary');await summary.waitFor();
   assert.match(await summary.innerText(),language==='ar'?/وجدنا 8 حسابات سوشال/:/Found 8 linked social/);
   await page.getByTestId('concierge-social-accounts').locator('summary').click();assert.equal(await page.getByTestId('concierge-social-accounts').locator('a').count(),8);
   await page.getByTestId('concierge-company-retry').click();const input=page.getByTestId('concierge-links-input');await input.waitFor();assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(node=>node===document.activeElement),true);
   assert.equal(await page.getByTestId('concierge-company-name').count(),0);assert.equal(await page.getByTestId('concierge-company-card').count(),0);
   await input.fill('Another clinic Amman');await page.getByTestId('concierge-links-submit').click();await page.getByTestId('concierge-company-card').waitFor();
   assert.equal(search.writes.find(w=>w.endpoint==='/api/concierge/company-lookup').data.query,'Another clinic Amman');
   await layout(page);await screenshot(page,`search-retry-${width}`);assert.deepEqual(search.errors,[]);
   console.log(`PASS: accurate account counts, full retry form and new search (${width}px, ${language})`);
  }finally{await search.context.close();}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
