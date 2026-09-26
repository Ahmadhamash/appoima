/** Real app/browser acceptance against a disposable database. No mocks or live AI calls.
 * Creates labelled synthetic fixtures and leaves them in the disposable database.
 * Credentials are environment-only. Never run against production or record real clinical data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
if(process.env.E2E_ALLOW_WRITE!=='1')throw new Error('Disposable database required. Set E2E_ALLOW_WRITE=1; setup fixtures and audit events will be written.');
for(const key of ['E2E_BASE_URL','E2E_MANAGER_EMAIL','E2E_MANAGER_PASSWORD'])if(!process.env[key])throw new Error(`${key} is required.`);
const base=process.env.E2E_BASE_URL.replace(/\/$/,''),out=path.resolve(process.env.E2E_OUTPUT||'verification/browser-phase5');
const address=new URL(base);if(!['http:','https:'].includes(address.protocol)||address.username||address.password)throw new Error('E2E_BASE_URL must be an HTTP(S) app origin without credentials.');
const puppeteer=require(process.env.PUPPETEER_MODULE||'puppeteer-core');
fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:process.env.E2E_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const errors=[],unexpectedWrites=[],records={};let guarded=false;
const selector=id=>`[data-testid="${id}"]`;
async function pageFor(context=browser){const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('request',req=>{
 const url=new URL(req.url());if(guarded&&url.origin===address.origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method())&&!['/api/assistant/help','/api/assistant/actions'].includes(url.pathname))unexpectedWrites.push({method:req.method(),path:url.pathname});
 });return p;}
async function visible(p,id){await p.waitForFunction(s=>[...document.querySelectorAll(s)].some(e=>{const r=e.getBoundingClientRect();return r.width&&r.height;}),{},selector(id));for(const e of await p.$$(selector(id)))if(await e.boundingBox())return e;throw new Error(`Not visible: ${id}`);}
async function click(p,id){const e=await visible(p,id);await p.waitForFunction(el=>!el.disabled,{},e);await e.click();}
async function fill(p,id,value){const e=await visible(p,id);await e.click({clickCount:3});await e.press('Backspace');await e.type(value);}
async function date(p,id,value){const e=await visible(p,id);await p.evaluate((el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},e,value);}
async function select(p,id,value){await p.waitForSelector(`${selector(id)} option[value="${value}"]`);await p.select(selector(id),String(value));}
async function call(p,url,body,method=body?'POST':'GET'){const result=await p.evaluate(async({url,body,method})=>{const r=await fetch('/api'+url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};},{url,body,method});assert.ok(result.status<400,`${method} ${url}: ${result.status} ${result.body?.error||''}`);return result.body;}
async function login(p,email,password,newPassword){await p.goto(base+'/login',{waitUntil:'networkidle2'});await fill(p,'input-email',email);await fill(p,'input-password',password);await click(p,'button-submit');await p.waitForFunction(()=>!location.pathname.endsWith('/login'));
 if(newPassword){await visible(p,'input-current');await fill(p,'input-current',password);await fill(p,'input-new',newPassword);await fill(p,'input-confirm',newPassword);await click(p,'button-submit');}
 await visible(p,'assistant-open');}
async function lang(p,value){await click(p,`button-lang-${value}`);await p.waitForFunction(v=>document.documentElement.lang===v,{},value);assert.equal(await p.evaluate(()=>document.documentElement.dir),value==='ar'?'rtl':'ltr');}
async function shot(p,name){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false,`${name}: page overflow`);assert.equal(await p.evaluate(()=>{const d=document.querySelector('[data-testid="assistant-dialog"]');return d?d.scrollWidth>d.clientWidth+2:false;}),false,`${name}: panel overflow`);await p.screenshot({path:path.join(out,`${name}.png`),fullPage:true});}
async function openHelp(p,width){await click(p,width===390?'assistant-open-mobile':'assistant-open');await visible(p,'assistant-provider-status');assert.equal(await p.$eval(selector('assistant-dialog'),e=>e.open),true);}
async function closeHelp(p,width){await p.keyboard.press('Escape');await p.waitForSelector(selector('assistant-dialog'),{hidden:true});await p.waitForFunction(id=>document.activeElement?.getAttribute('data-testid')===id,{},width===390?'assistant-open-mobile':'assistant-open');}
async function action(p,kind){await select(p,'assistant-action-select',kind);const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/assistant/actions'&&r.request().method()==='POST');await click(p,'assistant-run-action');const response=await pending;assert.equal(response.status(),200);const result=await response.json();assert.equal(result.action,kind);assert.equal(result.readOnly,true);assert.equal(result.generation,undefined);await visible(p,'assistant-action-result');assert.equal(await p.$eval(selector('assistant-local-text'),e=>e.textContent),result.text);return result;}
async function snapshot(p){return {own:await call(p,`/clinic/appointments/${records.own}`),cancelled:await call(p,`/clinic/appointments/${records.cancelled}`),waiting:await call(p,`/clinic/waiting-list?branchId=${records.branch}&pageSize=50`),replacement:await call(p,`/clinic/appointments/${records.cancelled}/replacement`)};}
const shift=(d,n)=>{const x=new Date(`${d}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
try {
 const p=await pageFor();await p.setViewport({width:1366,height:900});await login(p,process.env.E2E_MANAGER_EMAIL,process.env.E2E_MANAGER_PASSWORD);
 const settings=await call(p,'/assistant/bootstrap?language=en');assert.equal(settings.provider.state,'disabled','Run this suite with AI_ASSISTANT_ENABLED=false; it never calls a live provider.');assert.equal(settings.actions.length,4,'Test manager needs appointments.manage.');
 const tag=randomBytes(5).toString('hex'),week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d=>[d,[{open:'09:00',close:'17:00'}]]));
 const created=async(url,body)=>{const r=await call(p,url,body);assert.ok(r.item?.id);return r.item.id;};
 records.branch=await created('/clinic/branches',{name:`Phase5 synthetic branch ${tag}`,nameLang:'en',timeZone:'UTC',openingHours:week});
 records.service=await created('/clinic/services',{name:`Phase5 synthetic service ${tag}`,nameLang:'en',branchId:records.branch,durationMinutes:45,price:'25.000',currency:'JOD',category:'Skin',requiresRoom:false,isActive:true,employeeIds:[]});
 const email=`phase5-e2e-${tag}@example.test`,initial=randomBytes(18).toString('base64url'),replacement=randomBytes(18).toString('base64url');
 records.employee=await created('/clinic/employees',{name:`Phase5 synthetic doctor ${tag}`,nameLang:'en',email,initialPassword:initial,branchId:records.branch,role:'doctor',permissions:['customers.read','inventory.manage'],isActive:true,serviceIds:[records.service],workingHours:week});
 records.customer=await created('/clinic/customers',{name:`Phase5 synthetic customer ${tag}`,nameLang:'en',branchId:records.branch,email:`phase5-customer-${tag}@example.test`,notes:'PHASE5_PRIVATE_NOTE',sensitiveNotes:'PHASE5_PRIVATE_HISTORY'});
 records.waitingCustomer=await created('/clinic/customers',{name:`Phase5 synthetic waiting ${tag}`,nameLang:'en',branchId:records.branch,email:`phase5-waiting-${tag}@example.test`});
 records.day=shift(new Date().toISOString().slice(0,10),7);
 const book=async(hour)=>(await call(p,'/clinic/appointments',{branchId:records.branch,serviceId:records.service,employeeId:records.employee,customerId:records.customer,startsAt:`${records.day}T${hour}:00:00.000Z`,idempotencyKey:randomUUID()})).id;
 records.own=await book(10);records.cancelled=await book(12);
 records.waiting=(await call(p,'/clinic/waiting-list',{branchId:records.branch,serviceId:records.service,customerId:records.waitingCustomer,preferredEmployeeId:records.employee,preferredDate:records.day,fromTime:'12:00',toTime:'13:00',idempotencyKey:randomUUID()})).id;
 await call(p,`/clinic/appointments/${records.cancelled}/status`,{status:'cancelled',expectedVersion:1,reason:'Synthetic acceptance cancellation',idempotencyKey:randomUUID()});
 const context=await browser.createBrowserContext(),doctor=await pageFor(context);await doctor.setViewport({width:1366,height:900});await login(doctor,email,initial,replacement);
 const before=await snapshot(p);assert.equal(before.replacement.suggestion.offer.status,'offered');
 guarded=true;
 for(const [language,width]of [['en',1366],['en',390],['ar',1366],['ar',390]]){
   await p.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});await p.goto(base+`/appointments/${records.own}`,{waitUntil:'networkidle2'});await lang(p,language);await openHelp(p,width);
   await click(p,'assistant-topic-book');await p.waitForFunction(()=>document.querySelectorAll('[data-testid="assistant-conversation"] ol li').length>0);
   await fill(p,'assistant-question',language==='ar'?'كيف أسجل حضور العميل':'how do I check in');await click(p,'assistant-ask');await p.waitForFunction(()=>document.querySelectorAll('[data-testid="assistant-conversation"] ol').length===2);
   for(let i=0;i<25;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.querySelector('[data-testid="assistant-dialog"]').contains(document.activeElement)),true,'Modal keyboard focus must remain inside.');}
   await shot(p,`${language}-${width}-local-help`);
   await click(p,'assistant-tab-tools');const summary=await action(p,'summarize_appointment');assert.equal(summary.appointment.id,records.own);
   assert.equal(await p.$eval(selector('assistant-dialog'),e=>/PHASE5_PRIVATE_(NOTE|HISTORY)/.test(e.textContent)),false);
   await action(p,'draft_reply');await visible(p,'assistant-copy-local');assert.equal(await p.$(selector('assistant-generate')),null);await shot(p,`${language}-${width}-unsent-reply`);
   await select(p,'assistant-action-select','suggest_slots');await select(p,'assistant-slot-branch',records.branch);await select(p,'assistant-slot-service',records.service);await select(p,'assistant-slot-employee',records.employee);await date(p,'assistant-slot-date',records.day);
   const slots=await action(p,'suggest_slots');assert.ok(slots.slots.length>0&&slots.slots.length<=8);assert.ok(!slots.slots.some(s=>s.startsAt===`${records.day}T10:00:00.000Z`));await shot(p,`${language}-${width}-slot-suggestions`);
   await click(p,'assistant-review-link');await p.waitForSelector(selector('assistant-dialog'),{hidden:true});assert.equal(new URL(p.url()).pathname,'/appointments/new');
   await fill(p,'booking-customer-search',`Phase5 synthetic customer ${tag}`);await click(p,`booking-customer-${records.customer}`);await click(p,'booking-next');await visible(p,'booking-service');
   assert.equal(await p.$eval(selector('booking-branch'),e=>e.value),String(records.branch));assert.equal(await p.$eval(selector('booking-service'),e=>e.value),String(records.service));await click(p,'booking-next');assert.equal(await p.$eval(selector('booking-employee'),e=>e.value),String(records.employee));
   // Leave without choosing a time or pressing the final booking confirmation.
   await p.goto(base+`/appointments/${records.own}`,{waitUntil:'networkidle2'});await openHelp(p,width);
   await closeHelp(p,width);await openHelp(p,width);assert.equal(await p.$$eval(`${selector('assistant-conversation')} ol`,els=>els.length),0,'Conversation is not persisted after closing.');await closeHelp(p,width);
   await p.goto(base+`/appointments/${records.cancelled}`,{waitUntil:'networkidle2'});await openHelp(p,width);await click(p,'assistant-tab-tools');const explanation=await action(p,'explain_waiting');assert.equal(explanation.waiting.status,'offered');await shot(p,`${language}-${width}-waiting-explanation`);
   await click(p,'assistant-review-link');await p.waitForSelector(selector('assistant-dialog'),{hidden:true});assert.equal(new URL(p.url()).pathname,`/appointments/${records.cancelled}`);
   assert.deepEqual(await snapshot(p),before,'Assistant use must not change appointments/history/waiting records.');
   await doctor.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});await doctor.goto(base+`/appointments/${records.own}`,{waitUntil:'networkidle2'});await lang(doctor,language);await openHelp(doctor,width);
   for(const topic of ['book','setup','cancel','waiting'])assert.equal(await doctor.$(selector(`assistant-topic-${topic}`)),null);
   await click(doctor,'assistant-tab-tools');assert.deepEqual(await doctor.$$eval(`${selector('assistant-action-select')} option`,els=>els.map(e=>e.value)),['summarize_appointment']);assert.equal((await action(doctor,'summarize_appointment')).appointment.id,records.own);await shot(doctor,`${language}-${width}-assigned-doctor`);await closeHelp(doctor,width);
 }
 assert.deepEqual(unexpectedWrites,[],'No business mutations or AI-generation requests are allowed during assistant use.');assert.deepEqual(errors,[],'Uncaught browser errors.');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'passed',realDatabase:true,liveProviderCalled:false,languages:['en','ar'],viewports:[1366,390],roles:['manager','doctor'],records},null,2));
 console.log('PASS real-browser local help, four guarded read tools, own-provider role, modal keyboard/RTL and read-only checks. Synthetic fixtures retained. No live provider was called.');
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({result:'failed',message:error.message,records,uncaughtErrors:errors,unexpectedWrites},null,2));throw error;}
finally{guarded=false;await browser.close();}
