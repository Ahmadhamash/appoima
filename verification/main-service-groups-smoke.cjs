const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const {mount}=require('./weekly-schedule-smoke.cjs');
const base=process.env.SETUP_TEST_URL||'http://localhost:19881';
const definition=section=>({version:1,template:'custom',section,description:'Keep existing intake settings',audience:'unspecified',bodyArea:null,medicalScope:'medical',unsupportedCapabilities:[],intakeFields:[]});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const [width,lang,manage]of [[1440,'en',true],[390,'ar',true],[1440,'en',false]]){
  const fixture=await mount(browser,width,lang),{page}=fixture;let saves=0,deletes=0,stale=false,revision=1;
  let items=[{id:70,name:'Forehead Botox',definition:definition('Botox')},{id:80,name:'Full body laser',definition:definition('Laser Hair Removal')},{id:81,name:'Face laser',definition:definition('Laser Hair Removal')}].map(item=>({...item,nameLang:'en',branchId:1,durationMinutes:30,price:'25.000',currency:'JOD',category:'Custom category',requiresRoom:false,followUpEnabled:item.id===81,isActive:true,requiredEquipment:[],employeeIds:[]}));
  const groups=()=>[...new Set(items.map(item=>item.definition.section))].sort().map((name,index)=>({id:items.find(item=>item.definition.section===name).id,name,number:index+1,count:items.filter(item=>item.definition.section===name).length}));
  const current=id=>{const item=items.find(item=>item.id===id);return item?{id,name:item.definition.section,revision:String(revision).padStart(64,'0'),items:items.filter(other=>other.definition.section===item.definition.section)}:null;};
  try{
   if(!manage)await page.route('**/api/auth/me',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({user:{id:104,clinicId:10,name:'Viewer',nameLang:'en',role:'other_staff',permissions:['services.read','settings.read'],mustChangePassword:false,nav:['home','business'],home:'manager'}})}));
   await page.route(/\/api\/clinic\/services(?:\?.*)?$/,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items,total:items.length,page:1,pageSize:20,serviceGroupTotal:groups().length,serviceGroups:groups()})}));
   await page.route(/\/api\/clinic\/services\/\d+\/group$/,async route=>{
    const id=Number(new URL(route.request().url()).pathname.split('/').at(-2)),request=route.request(),body=request.method()==='GET'?null:request.postDataJSON();
    if(request.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify(current(id))});
    if(request.method()==='PUT'){
     saves++;assert.equal(body.revision,current(id).revision);assert.equal(body.services.length,2);
     for(const input of body.services){const item=items.find(row=>row.id===input.id);assert.equal(input.service.definition.description,'Keep existing intake settings');Object.assign(item,input.service,{definition:{...input.service.definition,section:body.name}});}revision++;
     return route.fulfill({contentType:'application/json',body:JSON.stringify({id})});
    }
    deletes++;assert.equal(body.confirmed,true);
    if(stale){stale=false;revision++;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'operation_changed'})});}
    assert.equal(body.revision,current(id).revision);const name=current(id).name;items=items.filter(item=>item.definition.section!==name);revision++;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({id})});
   });
   await page.goto(base+'/business/services');await page.getByTestId('main-service-number-70').waitFor();
   assert.equal(await page.getByTestId('main-service-number-70').innerText(),'1');assert.equal(await page.getByTestId('main-service-number-80').innerText(),'2');
   if(!manage){assert.equal(await page.locator('[data-testid^="edit-main-service-"]').count(),0);assert.equal(await page.locator('[data-testid^="delete-main-service-"]').count(),0);}
   else{
    await page.getByTestId('edit-main-service-80').click();await page.getByTestId('edit-main-service-name').fill('Discarded edit');await page.getByTestId('edit-subservice-name-81').fill('Discarded subservice');await page.getByTestId('cancel-main-service-edit').click();assert.equal(saves,0);assert.equal(items[2].name,'Face laser');
    await page.getByTestId('edit-main-service-80').click();await page.getByTestId('edit-main-service-name').waitFor();assert.equal(await page.getByTestId('edit-main-service-name').inputValue(),'Laser Hair Removal');assert.equal(await page.locator('[data-testid^="edit-subservice-name-"]').count(),2);
    await page.getByTestId('edit-subservice-duration-80').fill('0');await page.getByTestId('save-main-service').click();assert.equal(saves,0,'Invalid duration prevents saving');await page.getByTestId('edit-subservice-duration-80').fill('45');
    await page.getByTestId('edit-main-service-name').fill('Laser treatments');await page.getByTestId('edit-subservice-name-80').fill('Updated full body laser');await page.getByTestId('edit-subservice-price-80').fill('35.500');await page.getByTestId('edit-subservice-name-81').fill('Updated face laser');await page.getByTestId('save-main-service').click();await page.getByTestId('form-main-service').waitFor({state:'hidden'});
    assert.equal(saves,1);await page.getByTestId('main-service-name-80').waitFor();assert.equal(await page.getByTestId('main-service-name-80').innerText(),'Laser treatments');assert.match(await page.getByTestId('record-services-80').innerText(),/Updated full body laser/);assert.match(await page.getByTestId('record-services-80').innerText(),/35.500/);assert.match(await page.getByTestId('record-services-81').innerText(),/Updated face laser/);assert.equal(items[2].followUpEnabled,true);
    await page.getByTestId('delete-main-service-80').click();await page.getByTestId('main-service-delete-members').waitFor();assert.equal(deletes,0);assert.equal(await page.getByTestId('main-service-delete-members').locator('li').count(),2);assert.match(await page.getByTestId('delete-main-service-confirmation').innerText(),lang==='ar'?/كل خدماتها الفرعية \(2\)/:/all 2 associated subservices/);
    await page.getByTestId('cancel-main-service-delete').click();assert.equal(deletes,0);assert.equal(items.length,3);
    stale=true;await page.getByTestId('delete-main-service-80').click();await page.getByTestId('confirm-main-service-delete').click();await page.getByTestId('reload-main-service-delete').waitFor();assert.equal(items.length,3);assert.equal(await page.getByTestId('confirm-main-service-delete').isDisabled(),true);await page.getByTestId('reload-main-service-delete').click();await page.getByTestId('reload-main-service-delete').waitFor({state:'hidden'});await page.getByTestId('main-service-delete-members').waitFor();await page.getByTestId('confirm-main-service-delete').click();await page.getByTestId('delete-main-service-confirmation').waitFor({state:'hidden'});await page.getByTestId('record-services-80').waitFor({state:'hidden'});await page.getByTestId('record-services-81').waitFor({state:'hidden'});assert.equal(items.length,1);
    // Delete the first group in a fresh list and verify the following group becomes 1.
    items.push({id:90,name:'Last treatment',nameLang:'en',branchId:1,durationMinutes:30,price:'10.000',currency:'JOD',category:'Custom category',definition:definition('Z last service'),isActive:true,requiresRoom:false,employeeIds:[]});await page.reload();await page.getByTestId('main-service-number-90').waitFor();assert.equal(await page.getByTestId('main-service-number-90').innerText(),'2');await page.getByTestId('delete-main-service-70').click();await page.getByTestId('confirm-main-service-delete').click();await page.getByTestId('delete-main-service-confirmation').waitFor({state:'hidden'});await page.getByTestId('main-service-number-70').waitFor({state:'hidden'});assert.equal(await page.getByTestId('main-service-number-90').innerText(),'1');
   }
   assert.deepEqual(fixture.errors,[]);console.log(`PASS numbered main services, edit all, cancel, confirm group delete and renumber (${width}, ${lang}, manage=${manage})`);
  }catch(error){console.error(fixture.errors);console.error(await page.locator('body').innerText());throw error;}finally{await fixture.context.close();}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
