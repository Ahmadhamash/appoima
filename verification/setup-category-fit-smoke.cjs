const {fillTime,readTime}=require('./time-input-helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const {mount}=require('./weekly-schedule-smoke.cjs');
const base=process.env.SETUP_TEST_URL||'http://localhost:19881';
async function fits(page,label){
  const metrics=await page.locator('.jc-controls').evaluate(node=>({height:node.clientHeight,content:node.scrollHeight,width:node.clientWidth,contentWidth:node.scrollWidth}));
  assert.ok(metrics.content<=metrics.height+2,`${label} needs vertical scrolling: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.contentWidth<=metrics.width+2,`${label} overflows horizontally`);
  const outside=await page.locator('.jc-controls input:visible,.jc-controls select:visible,.jc-controls button:visible').evaluateAll(nodes=>nodes.filter(node=>{const r=node.getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1;}).map(node=>node.dataset.testid));
  assert.deepEqual(outside,[],`${label} has controls outside the screen`);
}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const [width,height,lang]of [[1440,900,'en'],[1366,768,'ar'],[390,844,'ar'],[390,667,'en']]){
  const fixture=await mount(browser,width,lang,true),{page}=fixture;await page.setViewportSize({width,height});
  try{
   fixture.current().draft.services=[1,2].map(n=>({key:`service_${n}`,name:`Session ${n}`,nameLang:'en',branchKey:'branch_1',branchScope:'branch',durationMinutes:30,price:'25',currency:'JOD',category:`Main ${n}`,requiresRoom:false,definition:null}));
   await page.route('**/api/concierge/service-options',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({categories:['Clinic consults'],branches:[],services:[],employees:[],rooms:[]})}));
   await page.goto(base+'/clinic-setup');await page.getByTestId('setup-branch_1-name').waitFor();await fits(page,'Branch identity');
   await page.getByTestId('branch-detail-pages-branch_1-next').click();
   const id='setup-branch_1';for(const day of ['tue','wed','thu','fri','sat','sun'])await page.getByTestId(`${id}-openingHours-${day}`).check();
   await fits(page,'All seven working days');
   await page.getByTestId(`${id}-mon-detail-pages-next`).click();await page.getByTestId(`${id}-breaks-mon-add`).click();await fillTime(page,`${id}-breaks-mon-0-open`,'12:00');await fillTime(page,`${id}-breaks-mon-0-close`,'13:00');
   await fits(page,'Break editor');await page.getByTestId(`${id}-apply-all`).click();assert.equal(await readTime(page,`${id}-breaks-tue-0-open`),'12:00');
   if(process.env.SETUP_SHOT_DIR){fs.mkdirSync(process.env.SETUP_SHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SETUP_SHOT_DIR,`setup-${width}-${height}.png`)});}
   await page.getByTestId('concierge-branch-pages-next').click();await fits(page,'Second branch');assert.equal(await page.getByTestId('setup-branch_2-name').inputValue(),'Branch 2');
   await page.getByTestId('concierge-journey-services').click();await page.getByTestId('service-name-service_1').waitFor();
   assert.equal(await page.locator('.jc-service-tree .jc-service-group').count(),2);
   assert.equal(await page.locator('.jc-service-tree .jc-service-batch-row').count(),2);
   await page.getByTestId('service-category-service_1').fill('نحت الجسم');await page.getByTestId('service-category-service_1').press('Enter');
   await page.getByTestId('service-group-toggle-service_2').click();await page.getByTestId('service-category-service_2-open-options').click();
   const options=page.getByTestId('service-category-service_2-options');await options.getByRole('option',{name:'نحت الجسم',exact:true}).click();
   assert.equal(await page.locator('.jc-service-tree .jc-service-group').count(),1,'Same main service must group its subservices together');
   assert.equal(await page.getByTestId('service-name-service_2').inputValue(),'Session 2');
   await page.getByTestId('service-category-service_1-open-options').click();const labels=await page.getByTestId('service-category-service_1-options').getByRole('option').allTextContents();assert.ok(labels.includes('Clinic consults'));for(const name of ['Hair','Nails','Skin','Laser','Massage','Makeup','Other'])assert.ok(!labels.includes(name));await page.getByTestId('service-category-service_1').press('Escape');
   await page.getByTestId('concierge-journey-staff').click();assert.deepEqual(fixture.current().draft.services.map(s=>s.category),['نحت الجسم','نحت الجسم']);await fits(page,'Staff identity');
   await page.getByTestId('staff-detail-pages-staff_1-next').click();await fits(page,'Staff branch schedule');
   await page.getByTestId('concierge-journey-services').click();assert.equal(await page.getByTestId('service-category-service_1').inputValue(),'نحت الجسم');
   await page.locator('.jc-service-bulk>summary').click();await fits(page,'Shared service selection');await page.getByTestId('service-bulk-detail-pages-next').click();await fits(page,'Shared service details');
   await page.getByTestId('concierge-journey-review').click();await page.getByTestId('concierge-review-open').click();await page.getByTestId('draft-branch_1').locator(':scope>summary').click();await page.getByTestId('concierge-record-branch_1-pages-next').click();await fits(page,'Review branch schedule');
   assert.deepEqual(fixture.errors,[]);assert.ok(page.url().endsWith('/clinic-setup'));console.log(`PASS categories, saved drafts, all week/breaks, branch/staff parts fit ${width}x${height} ${lang}`);
  }catch(error){await page.screenshot({path:'C:/VSCode-Codex-2/data/tmp/setup-fit-failure.png'});console.error(await page.locator('.jc-controls').evaluate(root=>Array.from(root.querySelectorAll('*')).filter(n=>!n.hidden&&n.getBoundingClientRect().height>60).map(n=>({class:n.className,height:Math.round(n.getBoundingClientRect().height),top:Math.round(n.getBoundingClientRect().top)}))));console.error(await page.locator('.jc-dialog').innerText());throw error;}finally{await fixture.context.close();}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
