// Actual application UI with synthetic API fixtures; never writes live clinic data.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
const user = {id:104,clinicId:10,branchId:null,name:'Manager',nameLang:'en',email:'manager@example.test',role:'manager',permissions:['settings','services','rooms','employees','appointments','customers'].flatMap(area=>[area+'.read',area+'.manage']),mustChangePassword:false,nav:['home','business','people','appointments'],home:'manager'};
const profile = {version:1,nameAr:null,nameEn:'Example Clinic',subtitleAr:null,subtitleEn:null,phone:null,email:null,address:null,website:null,logoDataUrl:null,primaryColor:'#806835',accentColor:'#D94B3D'};
const week={mon:[{open:'09:00',close:'17:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]},closed={...week,mon:[]};
const branches=Array.from({length:27},(_,i)=>({id:i+1,name:`Branch ${String(i).padStart(2,'0')}`,nameLang:'en',timeZone:i<21?'Asia/Amman':'UTC',openingHours:i%2?closed:week}));
const options={branches,services:[],rooms:[],employees:[],timeZones:['Asia/Amman','UTC'],currencies:['JOD'],grantablePermissions:user.permissions,rolePresets:{secretary:[]}};
const caps={enabled:true,llm:true,tts:false,stt:false,voice:false,configuredOnly:true,missing:[],formats:[],uploadMaxBytes:1000000,voiceSeconds:60};

async function mount(browser,width,guided=false){
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[],branchQueries=[];
  page.on('pageerror',error=>errors.push(error.message));
  const staff={key:'staff_1',name:'Test member',nameLang:'en',email:'member@example.test',phone:null,jobTitle:null,role:'secretary',branchKey:'branch_1',serviceKeys:[],workingHours:week,breaks:closed};
  let session={revision:1,stage:guided?'conversation':'complete',language:'en',preferredName:'Manager',consented:true,serviceWizard:false,entryMode:'text',sourceImport:true,importReviewPending:false,importApproved:true,workspace:{profile,sources:{},baseRevision:1,dirty:false,proposals:[]},draft:{branches:[{...branches[0],key:'branch_1',existingId:1,address:'Amman',mapUrl:null}],services:[],rooms:[],staff:guided?[staff]:[]},uploads:[],companyChecked:true,companyCandidate:null,companyProfile:{name:'Example Clinic',summary:'',sources:[],found:true},workflow:{step:guided?'staff':'review',label:'Staff',index:5,total:6,completed:[],prompt:'Add your staff',focus:null},message:{id:'m1',role:'assistant',text:'Add your staff'},ui:'none',busy:false,applied:guided?null:{branches:[1],services:[],rooms:[],staff:[]}};
  await context.addInitScript(guided=>{localStorage.setItem('jormall.lang','en');sessionStorage.setItem('jormall:working-branch:104','1');if(!guided)localStorage.setItem('jormall:concierge-later:104','1');},guided);
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),endpoint=url.pathname;
    if(request.method()!=='GET')writes.push({endpoint,body:request.postDataJSON()});
    let body={};
    if(endpoint==='/api/auth/me')body={user};
    else if(endpoint==='/api/me/workspace')body={revision:1,profile,sources:{},sections:[],pendingServices:[],truncated:false};
    else if(endpoint==='/api/me/clinic')body={clinic:{id:10,name:'Example Clinic',nameLang:'en',progress:{hasBranchHours:true,hasCatalog:true,hasStaff:true,hasFirstAppointment:true,branchCount:27,staffCount:1}}};
    else if(endpoint==='/api/concierge/bootstrap')body={session,capabilities:caps,consentVersion:'1'};
    else if(endpoint==='/api/concierge/review')body={revision:session.revision,draft:session.draft,issues:[],staffAccess:[{key:'staff_1',permissions:[]}],grantablePermissions:[],options:{branches:[],services:[]}};
    else if(endpoint==='/api/concierge/draft'){session={...session,revision:session.revision+1,draft:request.postDataJSON().draft};body=session;}
    else if(endpoint==='/api/concierge/step-confirm'){session={...session,revision:session.revision+1,workflow:{...session.workflow,step:'review'}};body=session;}
    else if(endpoint==='/api/clinic/options')body=options;
    else if(endpoint==='/api/clinic/branches'){
      branchQueries.push(url.searchParams.toString());const search=url.searchParams.get('search')||'',zone=url.searchParams.get('timeZone'),hours=url.searchParams.get('openingHours'),pageNumber=Number(url.searchParams.get('page')||1);
      const rows=branches.filter(row=>(!search||row.name.toLowerCase().includes(search.toLowerCase()))&&(!zone||row.timeZone===zone)&&(!hours||row.openingHours.mon.length));
      body={items:rows.slice((pageNumber-1)*20,pageNumber*20),total:rows.length,page:pageNumber,pageSize:20,branchSummary:{total:27,withOpeningHours:14,timeZones:[{timeZone:'Asia/Amman',count:21},{timeZone:'UTC',count:6}]}};
    }else if(endpoint==='/api/clinic/customers'&&request.method()==='POST')body={id:99};
    else if(/^\/api\/clinic\/(customers|employees|services|appointments|waiting-list)$/.test(endpoint))body={items:[],total:0,page:1,pageSize:20};
    else if(endpoint==='/api/clinic/scheduling/home')body={items:[],total:0,next:null,ownOnly:false};
    await route.fulfill({status:200,json:body});
  });
  return {context,page,errors,writes,branchQueries,current:()=>session};
}
async function paste(input,value){await input.evaluate((node,text)=>{const transfer=new DataTransfer();transfer.setData('text',text);node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},value);}
async function screenshot(page,name){if(!process.env.SETUP_SCREEN_DIR)return;require('node:fs').mkdirSync(process.env.SETUP_SCREEN_DIR,{recursive:true});await page.screenshot({path:require('node:path').join(process.env.SETUP_SCREEN_DIR,name+'.png')});}
async function exercisePhone(page,id){
  const input=page.getByTestId(id),country=page.getByTestId(id+'-country');
  await country.selectOption('JO');assert.equal(await input.getAttribute('maxlength'),'9');
  await input.fill('');await input.pressSequentially('abc');assert.equal(await input.inputValue(),'');
  await paste(input,'0791234567');assert.equal(await input.inputValue(),'791234567');
  assert.equal(await input.evaluate(node=>node.validity.valid),true);
  await input.fill('');await paste(input,'٧٩١٢٣٤٥٦٧٨٩');assert.equal(await input.inputValue(),'791234567');
  await country.selectOption('US');assert.equal(await input.getAttribute('maxlength'),'10');
  await input.fill('123');await input.blur();assert.equal(await input.getAttribute('aria-invalid'),'true');
  assert.equal(await input.evaluate(node=>node.validity.valid),false);
  await input.fill('');await paste(input,'+1 (202) 555-0123');assert.equal(await country.inputValue(),'US');assert.equal(await input.inputValue(),'2025550123');
  assert.equal(await input.evaluate(node=>node.validity.valid),true);
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    for(const width of [1440,390]){
      const state=await mount(browser,width),{page}=state;
      try{
        await page.goto(base+'/business/settings');await page.getByTestId('branch-summary-total').waitFor();
        assert.match(await page.getByTestId('branch-summary-total').innerText(),/27/);
        await page.getByTestId('branch-summary-hours').focus();await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.querySelector('[data-testid="branch-summary-page"]')?.textContent.includes('14'));
        assert(state.branchQueries.some(query=>query.includes('openingHours=configured')));
        assert.equal(await page.getByTestId('branch-summary-hours').getAttribute('aria-pressed'),'true');
        await page.getByTestId('branch-summary-zones').click();await page.getByTestId('branch-filter-time-zone').selectOption('UTC');
        await page.waitForFunction(()=>document.querySelector('[data-testid="branch-summary-page"]')?.textContent.includes('3'));
        await page.getByTestId('branch-summary-total').click();
        await page.waitForFunction(()=>document.querySelector('[data-testid="branch-summary-page"]')?.textContent.includes('20'));
        await page.getByTestId('next-page').click();
        await page.waitForFunction(()=>document.querySelector('[data-testid="branch-summary-page"]')?.textContent.includes('7'));
        await page.getByTestId('branch-summary-page').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'branch-records');
        await page.goto(base+'/people/customers');await page.getByTestId('add-customers').click();await page.getByTestId('input-name').fill('Test customer');
        await exercisePhone(page,'input-phone');await screenshot(page,`manual-phone-${width}`);await page.getByTestId('input-phone').fill('123');
        await page.getByTestId('save-record').click();assert.equal(state.writes.filter(write=>write.endpoint==='/api/clinic/customers').length,0);
        await page.getByTestId('input-phone').fill('2025550123');await page.getByTestId('save-record').click();
        await page.waitForFunction(()=>!document.querySelector('[data-testid="form-customers"]'));
        assert.equal(state.writes.find(write=>write.endpoint==='/api/clinic/customers').body.phone,'+12025550123');
        assert.deepEqual(state.errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        console.log(`PASS: clickable branch cards and manual phone validation at ${width}px`);
      }catch(error){console.error('UI state:',page.url(),state.errors,await page.locator('body').innerText().then(text=>text.slice(0,1600)));throw error;}finally{await state.context.close();}
      const guided=await mount(browser,width,true);
      try{
        const {page}=guided;await page.goto(base+'/clinic-setup');await page.getByTestId('setup-staff_1-phone').waitFor();
        await exercisePhone(page,'setup-staff_1-phone');await screenshot(page,`guided-phone-${width}`);await page.getByTestId('setup-staff_1-phone').fill('123');
        await page.getByTestId('setup-staff-continue').click();assert.equal(guided.writes.filter(write=>write.endpoint==='/api/concierge/draft').length,0);
        await page.getByTestId('setup-staff_1-phone').fill('2025550123');await page.getByTestId('setup-staff-continue').click();
        await page.getByTestId('concierge-review-open').waitFor();assert.equal(guided.current().draft.staff[0].phone,'+12025550123');
        assert.deepEqual(guided.errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        console.log(`PASS: guided phone validation and canonical saved number at ${width}px`);
      }finally{await guided.context.close();}
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
