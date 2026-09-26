/** Real app/real DB browser acceptance. Creates synthetic records; NEVER run on production.
 * Needs puppeteer-core installed in the runner, Chromium, and started API/web workflows.
 * No network/API mocking. Credentials are environment-only, never printed or persisted.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
if(process.env.E2E_ALLOW_WRITE!=='1')throw new Error('Use a disposable database. Explicit E2E_ALLOW_WRITE=1 is required; this creates test records.');
for(const key of ['E2E_BASE_URL','E2E_MANAGER_EMAIL','E2E_MANAGER_PASSWORD'])if(!process.env[key])throw new Error(`${key} is required.`);
const puppeteer=require(process.env.PUPPETEER_MODULE||'puppeteer-core');
const base=process.env.E2E_BASE_URL.replace(/\/$/,'');
const out=path.resolve(process.env.E2E_OUTPUT||'verification/browser-phase3');fs.mkdirSync(out,{recursive:true});
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
try{
 const p=await pageFor();await p.setViewport({width:1366,height:900});await login(p,process.env.E2E_MANAGER_EMAIL,process.env.E2E_MANAGER_PASSWORD);
 const tag=randomBytes(5).toString('hex'),week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map((d)=>[d,[{open:'09:00',close:'17:00'}]]));
 const created=async(url,body)=>{const r=await call(p,url,body);assert.ok(r.item?.id,`${url}: missing item id`);return r.item.id;};
 records.branch=await created('/clinic/branches',{name:`E2E branch ${tag}`,nameLang:'en',timeZone:'UTC',openingHours:week});
 records.service=await created('/clinic/services',{name:`E2E skin care ${tag}`,nameLang:'en',branchId:records.branch,durationMinutes:45,price:'25.000',currency:'JOD',category:'Skin',requiresRoom:true,isActive:true,employeeIds:[]});
 records.room=await created('/clinic/rooms',{name:`E2E room ${tag}`,nameLang:'en',branchId:records.branch,capacity:1,status:'available',serviceIds:[records.service]});
 const initial=randomBytes(18).toString('base64url'),replacement=randomBytes(18).toString('base64url'),email=`e2e-${tag}@example.test`;
 records.employee=await created('/clinic/employees',{name:`E2E doctor ${tag}`,nameLang:'en',email,initialPassword:initial,branchId:records.branch,role:'doctor',permissions:['customers.read'],isActive:true,serviceIds:[records.service],workingHours:week});
 records.customer=await created('/clinic/customers',{name:`E2E customer ${tag}`,nameLang:'en',branchId:records.branch,email:`customer-${tag}@example.test`,notes:'Synthetic acceptance record',sensitiveNotes:'Synthetic restricted note'});
 const context=await browser.createBrowserContext(),doctor=await pageFor(context);await doctor.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await login(doctor,email,initial,replacement);
 records.appointments=[];
 for(const [language,width,index]of [['en',1366,0],['ar',390,1]]){
  await p.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});await lang(p,language);
  await click(p,'nav-appointments');await visible(p,'choice-view-appointments');assert.equal((await p.$$(selector('choice-create-appointment'))).length,1);await screenshot(p,`${language}-${width}-navigation`);
  await click(p,'choice-create-appointment');await fill(p,'booking-customer-search',tag);await click(p,`booking-customer-${records.customer}`);await click(p,'booking-next');
  await select(p,'booking-branch',records.branch);await select(p,'booking-service',records.service);await click(p,'booking-next');await select(p,'booking-employee',records.employee);await click(p,'booking-next');
  const day=shift(new Date().toISOString().slice(0,10),3+index);await date(p,'slot-date',day);const offered=await call(p,`/clinic/scheduling/availability?branchId=${records.branch}&serviceId=${records.service}&employeeId=${records.employee}&date=${day}`);assert.ok(offered.slots.length);
  await click(p,`slot-${offered.slots[0].startsAt}`);await click(p,'booking-next');await screenshot(p,`${language}-${width}-booking-review`);await click(p,'booking-submit');await visible(p,'booking-success');
  const id=Number(new URL(p.url()).pathname.split('/').at(-1));assert.ok(id);records.appointments.push(id);let a=await call(p,`/clinic/appointments/${id}`);assert.equal(a.status,'pending');assert.equal(a.roomId,records.room);
  // The browser reschedules the actual record, then checks history from the API.
  await click(p,'appointment-reschedule');const movedDay=shift(day,3);await date(p,'slot-date',movedDay);const moved=await call(p,`/clinic/scheduling/availability?branchId=${records.branch}&serviceId=${records.service}&employeeId=${records.employee}&date=${movedDay}&excludeAppointmentId=${id}`);
  assert.ok(moved.slots.length);await click(p,`slot-${moved.slots[0].startsAt}`);await fill(p,'reschedule-reason',language==='ar'?'طلب تغيير الوقت للاختبار':'Acceptance reschedule');await click(p,'reschedule-submit');await click(p,'reschedule-submit');await visible(p,'appointment-detail');
  a=await call(p,`/clinic/appointments/${id}`);assert.equal(a.history.length,2);assert.equal(a.history[1].event,'rescheduled');assert.equal(a.history[1].before.startsAt,offered.slots[0].startsAt);
  await status(p,id,'confirmed');await status(p,id,'checked_in');
  await doctor.goto(base+`/appointments/${id}`,{waitUntil:'networkidle2'});await lang(doctor,language);await visible(doctor,'appointment-detail');assert.equal((await doctor.$$(selector('appointment-sensitive-notes'))).length,0);assert.equal((await doctor.$$(selector('appointment-reschedule'))).length,0);
  await status(doctor,id,'in_service');await click(doctor,'appointment-action-completed');await fill(doctor,'completion-notes',language==='ar'?'تمت الخدمة بنجاح للاختبار':'Completed synthetic service');await click(doctor,'confirm-appointment-action');await doctor.waitForFunction(()=>document.querySelector('[data-testid="appointment-current-status"]')?.dataset.status==='completed');
  await screenshot(doctor,`${language}-390-provider-completed`);await click(p,'refresh-appointment');await p.waitForFunction(()=>document.querySelector('[data-testid="appointment-current-status"]')?.dataset.status==='completed');await screenshot(p,`${language}-${width}-history`);
  const history=await call(p,`/clinic/customers/${records.customer}/appointments?page=1&pageSize=20`);assert.ok(history.items.some((v)=>v.id===id&&v.status==='completed'));
  await p.goto(base+'/appointments/view',{waitUntil:'networkidle2'});await screenshot(p,`${language}-${width}-daily`);
 }
 assert.deepEqual(errors,[],'Uncaught browser errors');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'passed',realDatabase:true,languages:['en','ar'],viewports:[1366,390],records},null,2));
 console.log('PASS real-browser booking, rescheduling, lifecycle, restricted notes and EN/AR 390px navigation. Synthetic records retained in the disposable database.');
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({result:'failed',message:error.message,records,uncaughtErrors:errors},null,2));throw error;}
finally{await browser.close();}
