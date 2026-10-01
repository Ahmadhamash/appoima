const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const {mount}=require('./weekly-schedule-smoke.cjs');
const base=process.env.SETUP_TEST_URL||'http://localhost:19881';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{for(const [width,lang]of [[1440,'en'],[390,'ar']]){
 const fixture=await mount(browser,width,lang),{page}=fixture;let lastQuery;
 const items=[{id:70,name:'Active Botox',isActive:true,definition:{section:'Botox'}},{id:80,name:'Active laser',isActive:true,definition:{section:'Laser'}},{id:81,name:'Inactive laser',isActive:false,definition:{section:'Laser'}}].map(item=>({...item,nameLang:'en',branchId:1,category:'Custom',durationMinutes:30,price:'25.000',currency:'JOD'}));
 try{
  await page.route(/\/api\/clinic\/services(?:\?.*)?$/,route=>{
   const query=new URL(route.request().url()).searchParams;lastQuery=Object.fromEntries(query);let selected=items;
   if(query.has('status'))selected=selected.filter(item=>item.isActive===(query.get('status')==='active'));
   if(query.has('pageServiceIds'))selected=selected.filter(item=>query.get('pageServiceIds').split(',').includes(String(item.id)));
   const names=[...new Set(selected.map(item=>item.definition.section))],groups=names.map((name,index)=>({id:selected.find(item=>item.definition.section===name).id,name,number:index+1,count:selected.filter(item=>item.definition.section===name).length}));
   return route.fulfill({contentType:'application/json',body:JSON.stringify({items:selected,total:selected.length,page:1,pageSize:20,serviceSummary:{active:25,inactive:7},serviceGroupTotal:groups.length,serviceGroups:groups})});
  });
  await page.goto(base+'/business/services');await page.getByTestId('record-services-81').waitFor();
  const card=page.getByTestId('service-summary-status');assert.equal(await card.getByTestId('service-summary-active').locator('strong').innerText(),'25','Active total is from the API, not the page count');assert.equal(await card.getByTestId('service-summary-inactive').locator('strong').innerText(),'7');
  const top=await page.getByTestId('service-summary-active').boundingBox(),bottom=await page.getByTestId('service-summary-inactive').boundingBox();assert(top.y+top.height<=bottom.y,'Inactive is directly below Active in the same card');
  await page.getByTestId('service-summary-inactive').click();await page.getByTestId('record-services-70').waitFor({state:'hidden'});await page.getByTestId('record-services-80').waitFor({state:'hidden'});await page.getByTestId('record-services-81').waitFor();assert.equal(lastQuery.status,'inactive');assert.equal(await page.getByTestId('service-summary-active').locator('strong').innerText(),'25');
  await page.getByTestId('service-summary-active').click();await page.getByTestId('record-services-81').waitFor({state:'hidden'});await page.getByTestId('record-services-70').waitFor();await page.getByTestId('record-services-80').waitFor();assert.equal(lastQuery.status,'active');assert.equal(await page.getByTestId('service-summary-inactive').locator('strong').innerText(),'7');
  await page.getByTestId('service-clear-filters').click();await page.getByTestId('record-services-81').waitFor();
  await page.getByTestId('service-summary-sections').click();assert.equal(await page.locator('#service-records').evaluate(node=>node===document.activeElement),true,'Sections card opens and focuses the records');
  await page.getByTestId('service-summary-active-page').click();await page.getByTestId('record-services-81').waitFor({state:'hidden'});await page.getByTestId('service-filters').waitFor();assert.equal(lastQuery.status,'active');assert.equal(lastQuery.pageServiceIds,'70,80');
  await page.getByTestId('service-clear-filters').click();await page.getByTestId('record-services-81').waitFor();await page.getByTestId('service-summary-inactive').click();await page.getByTestId('record-services-70').waitFor({state:'hidden'});await page.getByTestId('service-summary-active-page').click();await page.getByTestId('empty-records').waitFor();assert.equal(lastQuery.pageServiceIds,'','Zero active entries display an empty list');await page.getByTestId('service-clear-filters').click();await page.getByTestId('record-services-70').waitFor();
  assert.deepEqual(fixture.errors,[]);console.log(`PASS stacked clinic totals, independent status counts and clickable records cards (${width}, ${lang})`);
 }catch(error){console.error(await page.locator('body').innerText());throw error;}finally{await fixture.context.close();}
}}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
