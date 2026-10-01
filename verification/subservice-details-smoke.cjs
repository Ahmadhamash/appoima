const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const {mount}=require('./weekly-schedule-smoke.cjs');
const base=process.env.SETUP_TEST_URL||'http://localhost:19881';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const [width,lang,manage]of [[1440,'en',true],[390,'ar',true],[1440,'en',false]]){
  const fixture=await mount(browser,width,lang),{page}=fixture;let attempts=0,confirmed=0;
  let items=[80,81].map(id=>({id,name:id===80?'Full body laser':'Face laser',nameLang:'en',branchId:1,durationMinutes:45,price:'30.000',currency:'JOD',category:'Laser',definition:{version:1,template:'custom',section:'Laser treatments',description:null,audience:'all',bodyArea:null,medicalScope:'medical',unsupportedCapabilities:[],intakeFields:[]},requiresRoom:false,isActive:true,employeeIds:[]}));
  try{
   if(!manage)await page.route('**/api/auth/me',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({user:{id:104,clinicId:10,branchId:null,name:'Viewer',nameLang:'en',role:'other_staff',permissions:['services.read','settings.read'],mustChangePassword:false,nav:['home','business'],home:'manager'}})}));
   await page.route(/\/api\/clinic\/services(?:\?.*)?$/,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items,total:items.length,page:1,pageSize:20})}));
   await page.route('**/api/clinic/services/*',async route=>{
    const id=Number(new URL(route.request().url()).pathname.split('/').pop());
    if(route.request().method()==='DELETE'){
     attempts++;assert.deepEqual(route.request().postDataJSON(),{confirmed:true});
     if(attempts===1)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'internal_error'})});
     confirmed++;items=items.filter(item=>item.id!==id);return route.fulfill({contentType:'application/json',body:JSON.stringify({id})});
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify({item:items.find(item=>item.id===id)})});
   });
   await page.goto(base+'/business/services');await page.getByTestId('open-subservice-80').waitFor();
   assert.equal(await page.locator('[data-testid^="details-services-"]').count(),0,'No Details buttons remain');
   assert.equal(await page.getByTestId('record-services-80').locator('td').count(),5,'No empty Actions column');
   // Click a non-name cell on the whole row, then test keyboard access on the name.
   await page.getByTestId('record-services-80').locator('td').nth(2).click();await page.getByTestId('details-services').waitFor();
   assert.match(await page.getByTestId('details-services').innerText(),/Full body laser/);
   if(!manage){assert.equal(await page.getByTestId('delete-subservice').count(),0);assert.equal(await page.getByTestId('edit-record').count(),0);}
   else{
    await page.getByTestId('edit-record').click();await page.getByTestId('input-name').waitFor();assert.equal(await page.getByTestId('input-name').inputValue(),'Full body laser');
    page.once('dialog',dialog=>dialog.accept());await page.getByTestId('cancel-record').click();
    await page.getByTestId('open-subservice-80').focus();await page.keyboard.press('Enter');await page.getByTestId('details-services').waitFor();
    await page.getByTestId('delete-subservice').click();await page.getByTestId('delete-subservice-confirmation').waitFor();
    assert.match(await page.getByTestId('delete-subservice-confirmation').innerText(),/Full body laser/);assert.equal(attempts,0);
    assert.equal(await page.getByTestId('cancel-delete-subservice').evaluate(node=>node===document.activeElement),true,'Cancel receives initial focus');
    await page.getByTestId('cancel-delete-subservice').click();await page.getByTestId('delete-subservice-confirmation').waitFor({state:'hidden'});assert.equal(attempts,0);assert.equal(items.length,2);
    await page.getByTestId('delete-subservice').click();await page.getByTestId('confirm-delete-subservice').click();await page.getByTestId('delete-subservice-confirmation').getByRole('alert').waitFor();assert.equal(items.length,2,'Failed delete keeps the item and confirmation open');
    await page.getByTestId('confirm-delete-subservice').click();await page.getByTestId('delete-subservice-confirmation').waitFor({state:'hidden'});await page.getByTestId('record-services-80').waitFor({state:'hidden'});assert.equal(confirmed,1);await page.getByTestId('record-services-81').waitFor();
    await page.getByTestId('open-subservice-81').focus();await page.keyboard.press('Space');await page.getByTestId('details-services').waitFor();assert.match(await page.getByTestId('details-services').innerText(),/Face laser/);
   }
   assert.deepEqual(fixture.errors,[]);console.log(`PASS clickable subservices, details, edit and confirmed deletion (${width}, ${lang}, manage=${manage})`);
  }catch(error){console.error(fixture.errors);console.error(await page.locator('body').innerText());throw error;}finally{await fixture.context.close();}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
