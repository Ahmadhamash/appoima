/** Real app/real DB browser acceptance. Creates synthetic records; NEVER run on production.
 * Needs puppeteer-core installed in the runner, Chromium, and started API/web workflows.
 * No network/API mocking. Credentials are environment-only, never printed or persisted.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
if(process.env.E2E_ALLOW_WRITE!=='1')throw new Error('Use a disposable database. Explicit E2E_ALLOW_WRITE=1 is required; this creates test records.');
for(const key of ['E2E_BASE_URL','E2E_MANAGER_EMAIL','E2E_MANAGER_PASSWORD'])if(!process.env[key])throw new Error(`${key} is required.`);
const puppeteer=require(process.env.PUPPETEER_MODULE||'puppeteer-core');
const base=process.env.E2E_BASE_URL.replace(/\/$/,'');
const out=path.resolve(process.env.E2E_OUTPUT||'verification/browser-phase4');fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:process.env.E2E_NO_SANDBOX==='1'?['--no-sandbox']:[]});
const errors=[],records={};
const selector=(id)=>`[data-testid="${id}"]`;
async function pageFor(context=browser){const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',(e)=>errors.push(e.message));return p;}
async function visible(p,id){await p.waitForFunction((s)=>[...document.querySelectorAll(s)].some((e)=>{const r=e.getBoundingClientRect();return r.width&&r.height;}),{},selector(id));for(const e of await p.$$(selector(id)))if(await e.boundingBox())return e;throw new Error(`Not visible: ${id}`);}
async function click(p,id){const e=await visible(p,id);await p.waitForFunction((el)=>!el.disabled,{},e);await e.click();}
async function fill(p,id,value){const e=await visible(p,id);await e.click({clickCount:3});await e.press('Backspace');await e.type(value);}
async function date(p,id,value){const e=await visible(p,id);await p.evaluate((el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},e,value);}
async function select(p,id,value){await p.waitForSelector(`${selector(id)} option[value="${value}"]`);await p.select(selector(id),String(value));}
async function call(p,url,body,method=body?'POST':'GET'){const result=await p.evaluate(async({url,body,method})=>{const r=await fetch('/api'+url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};},{url,body,method});assert.ok(result.status<400,`${method} ${url}: ${result.status} ${result.body?.error||''}`);return result.body;}
async function login(p,email,password,newPassword){await p.goto(base+'/login',{waitUntil:'networkidle2'});await fill(p,'input-email',email);await fill(p,'input-password',password);await click(p,'button-submit');await p.waitForFunction(()=>!location.pathname.endsWith('/login'));
 if(newPassword){await visible(p,'input-current');await fill(p,'input-current',password);await fill(p,'input-new',newPassword);await fill(p,'input-confirm',newPassword);await click(p,'button-submit');}
 await visible(p,'role-home-schedule');
}
async function lang(p,value){await click(p,`button-lang-${value}`);await p.waitForFunction((v)=>document.documentElement.lang===v,{},value);assert.equal(await p.evaluate(()=>document.documentElement.dir),value==='ar'?'rtl':'ltr');}
async function screenshot(p,name){const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);assert.equal(overflow,false,`${name}: horizontal overflow`);await p.screenshot({path:path.join(out,`${name}.png`),fullPage:true});}
async function status(p,id,target){await click(p,`appointment-action-${target}`);await click(p,'confirm-appointment-action');await p.waitForFunction((value)=>document.querySelector('[data-testid="appointment-current-status"]')?.dataset.status===value,{},target);assert.equal((await call(p,`/clinic/appointments/${id}`)).status,target);}
const shift=(d,n)=>{const x=new Date(`${d}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
try {
 const p=await pageFor();await p.setViewport({width:1366,height:900});await login(p,process.env.E2E_MANAGER_EMAIL,process.env.E2E_MANAGER_PASSWORD);
 const tag=randomBytes(5).toString('hex'),week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d=>[d,[{open:'09:00',close:'17:00'}]]));
 const created=async(url,body)=>{const r=await call(p,url,body);assert.ok(r.item?.id);return r.item.id;};
 records.branch=await created('/clinic/branches',{name:`Phase4 E2E branch ${tag}`,nameLang:'en',timeZone:'UTC',openingHours:week});
 records.service=await created('/clinic/services',{name:`Phase4 E2E skin care ${tag}`,nameLang:'en',branchId:records.branch,durationMinutes:45,price:'25.000',currency:'JOD',category:'Skin',requiresRoom:true,isActive:true,employeeIds:[]});
 records.room=await created('/clinic/rooms',{name:`Phase4 E2E room ${tag}`,nameLang:'en',branchId:records.branch,capacity:1,status:'available',serviceIds:[records.service]});
 const initial=randomBytes(18).toString('base64url'),replacement=randomBytes(18).toString('base64url'),email=`phase4-e2e-${tag}@example.test`;
 records.employee=await created('/clinic/employees',{name:`Phase4 E2E doctor ${tag}`,nameLang:'en',email,initialPassword:initial,branchId:records.branch,role:'doctor',permissions:['customers.read','inventory.manage'],isActive:true,serviceIds:[records.service],workingHours:week});
 records.customer=await created('/clinic/customers',{name:`Phase4 booking ${tag}`,nameLang:'en',branchId:records.branch,email:`booking-${tag}@example.test`,notes:'Synthetic browser acceptance record',sensitiveNotes:'Synthetic restricted note'});
 records.waitingCustomer=await created('/clinic/customers',{name:`Phase4 waiting ${tag}`,nameLang:'en',branchId:records.branch,email:`waiting-${tag}@example.test`,notes:'Synthetic browser acceptance record'});
 const context=await browser.createBrowserContext(),doctor=await pageFor(context);await doctor.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await login(doctor,email,initial,replacement);
 const waitBalance=async(page,quantity)=>page.waitForFunction(v=>Number(document.querySelector('[data-testid="inventory-current-balance"]')?.dataset.balance)===v,{},quantity);
 records.scenarios=[];
 let index=0;
 for(const [language,width]of [['en',1366],['en',390],['ar',1366],['ar',390]]){
   const scenario={language,width},day=shift(new Date().toISOString().slice(0,10),4+index++);records.scenarios.push(scenario);
   await p.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});await lang(p,language);
   // Real UI item creation and receipt; no pre-filled balance or fake dashboard values.
   await p.goto(base+'/business/inventory',{waitUntil:'networkidle2'});await click(p,'inventory-add-item');await fill(p,'inventory-name',`${language==='ar'?'مادة اختبار':'Test material'} ${tag}-${index}`);await select(p,'inventory-name-language',language);await select(p,'inventory-create-branch',records.branch);await select(p,'inventory-unit','ml');await click(p,'inventory-create-save');await visible(p,'inventory-detail');
   scenario.item=Number(new URL(p.url()).pathname.split('/').at(-1));assert.ok(scenario.item);await waitBalance(p,0);
   await fill(p,'movement-quantity','10');await fill(p,'movement-reason',language==='ar'?'استلام تجريبي فقط':'Synthetic acceptance receipt');await click(p,'save-inventory-movement');await waitBalance(p,10);await screenshot(p,`${language}-${width}-inventory-receipt`);
   // Prepare the original booking with the real API; its cancellation and replacement are UI actions.
   const availability=await call(p,`/clinic/scheduling/availability?branchId=${records.branch}&serviceId=${records.service}&employeeId=${records.employee}&date=${day}`);assert.ok(availability.slots.length);const slot=availability.slots[0];
   scenario.original=(await call(p,'/clinic/appointments',{branchId:records.branch,customerId:records.customer,serviceId:records.service,employeeId:records.employee,startsAt:slot.startsAt,idempotencyKey:randomUUID()})).id;
   // Add first queue entry in the actual form; the existing customer selection is pre-populated.
   await p.goto(base+`/appointments/waiting-list?add=1&customerId=${records.waitingCustomer}&branchId=${records.branch}&serviceId=${records.service}&employeeId=${records.employee}&date=${day}`,{waitUntil:'networkidle2'});await visible(p,'waiting-form');await fill(p,'waiting-note',language==='ar'?'طلب انتظار تجريبي':'Synthetic waiting request');await click(p,'waiting-save');await p.waitForSelector(selector('waiting-form'),{hidden:true});
   const firstQueue=await call(p,`/clinic/waiting-list?branchId=${records.branch}&pageSize=50`);const first=firstQueue.items.find(e=>e.serviceId===records.service&&e.customerId===records.waitingCustomer&&e.windowStart.slice(0,10)===day);assert.ok(first);scenario.firstEntry=first.id;
   // A second eligible request allows the UI decline -> next suggestion flow to be checked.
   scenario.secondEntry=(await call(p,'/clinic/waiting-list',{branchId:records.branch,customerId:records.waitingCustomer,serviceId:records.service,preferredEmployeeId:null,preferredDate:day,idempotencyKey:randomUUID()})).id;
   await p.goto(base+`/appointments/${scenario.original}`,{waitUntil:'networkidle2'});await click(p,'appointment-action-cancelled');await fill(p,'appointment-action-reason',language==='ar'?'إلغاء تجريبي':'Synthetic cancellation');await click(p,'confirm-appointment-action');await visible(p,'confirm-replacement');
   let s=(await call(p,`/clinic/appointments/${scenario.original}/replacement`)).suggestion;assert.equal(s.entry.id,scenario.firstEntry);assert.equal(s.offer.status,'offered');assert.equal((await call(p,`/clinic/appointments/${scenario.original}`)).status,'cancelled');
   await screenshot(p,`${language}-${width}-replacement-review`);await click(p,'decline-replacement');await fill(p,'replacement-decline-reason',language==='ar'?'رفض تجريبي للاقتراح الأول':'Synthetic first-offer decline');await click(p,'confirm-decline-replacement');
   await p.waitForFunction(async({id,entry})=>{const r=await fetch(`/api/clinic/appointments/${id}/replacement`);return (await r.json()).suggestion?.entry.id===entry;},{}, {id:scenario.original,entry:scenario.secondEntry});
   s=(await call(p,`/clinic/appointments/${scenario.original}/replacement`)).suggestion;await visible(p,`replacement-offer-${s.offer.id}`);await click(p,'confirm-replacement');await visible(p,'booking-success');scenario.replacement=Number(new URL(p.url()).pathname.split('/').at(-1));assert.ok(scenario.replacement);assert.equal((await call(p,`/clinic/appointments/${scenario.replacement}`)).status,'confirmed');
   await status(p,scenario.replacement,'checked_in');
   // Assigned provider records ACTUAL use while completing. Combined API transaction is observed afterwards.
   await doctor.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});await doctor.goto(base+`/appointments/${scenario.replacement}`,{waitUntil:'networkidle2'});await lang(doctor,language);await status(doctor,scenario.replacement,'in_service');await click(doctor,'appointment-action-completed');await visible(doctor,'consumption-fields');await select(doctor,'consumption-item',scenario.item);await click(doctor,'consumption-add-item');await fill(doctor,`consumption-quantity-${scenario.item}`,'2.5');await fill(doctor,'completion-notes',language==='ar'?'استخدام فعلي تجريبي':'Synthetic actual materials used');await click(doctor,'confirm-appointment-action');await visible(doctor,'consumption-recorded');
   const record=await call(doctor,`/clinic/appointments/${scenario.replacement}/consumption`);assert.equal(record.recorded,true);assert.equal(record.lines.length,1);assert.equal(record.lines[0].quantity,'2.500');assert.equal(record.canRecord,false);await screenshot(doctor,`${language}-${width}-actual-consumption`);
   await p.goto(base+`/business/inventory/${scenario.item}`,{waitUntil:'networkidle2'});await waitBalance(p,7.5);const stock=await call(p,`/clinic/inventory/items/${scenario.item}`);assert.equal(stock.movements.filter(m=>m.kind==='consumption').length,1);
   await p.goto(base+'/business/services',{waitUntil:'networkidle2'});await fill(p,'search-services',tag);await visible(p,`service-actual-use-${records.service}`);await screenshot(p,`${language}-${width}-service-actual-totals`);
 }
 assert.deepEqual(errors,[],'Uncaught browser errors');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'passed',realDatabase:true,languages:['en','ar'],viewports:[1366,390],records},null,2));
 console.log('PASS Phase 4 real-browser inventory, waiting-list decline/confirm, actual completion use and EN/AR desktop/390px checks. Synthetic ledgers retained in the disposable database.');
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({result:'failed',message:error.message,records,uncaughtErrors:errors},null,2));throw error;}
finally{await browser.close();}
