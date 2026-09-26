"""Actual production ConciergeView + React service components; synthetic HTTP, no live server/AI."""
import os,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
BUNDLE=Path(os.environ.get('WIZARD_TEST_OUT', ROOT/'verification/service-wizard/ui-test'))
OUT=ROOT/'verification/service-wizard';OUT.mkdir(parents=True,exist_ok=True)
CSS='\n'.join((ROOT/p).read_text() for p in ['artifacts/jormall/src/components/concierge/concierge.css','artifacts/jormall/src/components/services/services.css'])
checks=[];errors=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name)
def setup(browser,width=1440,height=1000):
 ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce');page=ctx.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(7000)
 page.on('dialog',lambda d:d.accept())
 page.set_content('<html lang="ar" dir="rtl"><head><style>body{margin:0;font-family:Arial,sans-serif;background:#edf2f3;color:#173d3f}*{box-sizing:border-box}button,input,select,textarea{font:inherit}</style><style>'+CSS+'</style></head><body><main><h1>جورمول — العيادة</h1><p>لوحة المواعيد الحالية</p></main></body></html>')
 page.add_script_tag(path=str(BUNDLE/'runtime.js'));page.add_script_tag(path=str(BUNDLE/'ui.js'));page.add_script_tag(path=str(BUNDLE/'fixture.js'))
 expect(page.get_by_test_id('concierge-manual')).to_be_visible()
 return page,ctx
def enter_manual(page):
 page.get_by_test_id('concierge-manual').click();expect(page.get_by_test_id('wizard-add-service')).to_be_enabled()
def add_laser(page):
 page.get_by_test_id('wizard-add-service').click();page.get_by_role('button',name='ليزر طبي',exact=False).click();expect(page.get_by_test_id('wizard-service-editor')).to_be_visible()
def select(page,label,value):
 page.locator('label').filter(has_text=re.compile('^'+re.escape(label))).locator('select').select_option(value)
def fill_complete(page):
 page.get_by_test_id('wizard-service-name').fill('ليزر اللحية للرجال')
 page.get_by_label('مدة الموعد بالدقائق',exact=True).fill('20');page.get_by_label('السعر',exact=True).fill('15');page.get_by_label('العملة',exact=True).fill('JOD')
 select(page,'هل تحتاج الخدمة إلى غرفة؟','false');select(page,'نطاق الخدمة','all')
 select(page,'الفئة المستهدفة','men');page.get_by_label('المنطقة، عند الحاجة',exact=True).fill('اللحية');select(page,'تأكيد النطاق الطبي','medical')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page,ctx=setup(browser);enter_manual(page)
 check('Existing canvas orb and live wizard render together',page.locator('canvas').count()==1 and page.get_by_test_id('service-wizard-panel').is_visible())
 add_laser(page)
 check('Template does not invent duration or price',page.get_by_label('مدة الموعد بالدقائق',exact=True).input_value()=='' and page.get_by_label('السعر',exact=True).input_value()=='')
 fill_complete(page)
 page.get_by_role('button',name='+ إضافة حقل',exact=True).click();page.get_by_label('السؤال',exact=True).fill('سبب الزيارة');select(page,'نوع الإجابة','long_text');page.get_by_label('إجابة مطلوبة',exact=True).check()
 check('Custom booking field renders in actual live preview',page.locator('.sv-intake').count()==1)
 page.get_by_test_id('wizard-save-service').click();expect(page.get_by_test_id('wizard-review')).to_be_visible()
 expect(page.get_by_test_id('concierge-language')).to_be_enabled();expect(page.get_by_test_id('concierge-attach')).to_be_disabled()
 check('Manual save sends no AI turn and keeps exactly one service',page.evaluate("fixture.session.draft.services.length===1 && !fixture.calls.some(c=>c.path.includes('turn'))"))
 check('Original core sections unchanged',page.evaluate("['branches','staff','rooms'].every(k=>fixture.session.draft[k].length===0)"))
 page.screenshot(path=str(OUT/'wizard-desktop-ar.png'),full_page=True)
 page.get_by_test_id('wizard-review').click();expect(page.get_by_test_id('wizard-save-setup')).to_be_disabled()
 check('Approval is disabled until explicit manager confirmation')
 page.locator('.sv-approval input[type=checkbox]').check();expect(page.get_by_test_id('wizard-save-setup')).to_be_enabled()
 page.get_by_test_id('wizard-save-setup').click();expect(page.get_by_test_id('concierge-enter')).to_be_visible()
 check('Only approval calls publication and app cache invalidation',page.evaluate('fixture.applied===1 && testApplied===1'))
 ctx.close()
 page,ctx=setup(browser,390,844);enter_manual(page);add_laser(page);fill_complete(page);page.get_by_test_id('wizard-save-service').click();expect(page.get_by_test_id('wizard-review')).to_be_visible()
 page.screenshot(path=str(OUT/'wizard-mobile-ar.png'),full_page=True)
 check('Arabic mobile RTL and no horizontal overflow',page.locator('dialog').get_attribute('dir')=='rtl' and page.locator('dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'))
 page.get_by_test_id('concierge-add-links').click();page.get_by_test_id('concierge-links-input').fill('https://clinic.example');page.get_by_test_id('concierge-links-submit').click();expect(page.get_by_test_id('concierge-company-card')).to_be_visible()
 check('Switching manual to links preserves saved service',page.evaluate('fixture.session.draft.services.length===1'))
 page.get_by_role('button',name='نعم، هاي شركتي',exact=True).click()
 expect(page.get_by_role('button',name='نقدّم هذه الخدمة',exact=True)).to_be_visible()
 check('Public service needs a separate opt-in',page.evaluate('fixture.session.draft.services.length===1'))
 page.get_by_role('button',name='نقدّم هذه الخدمة',exact=True).click();expect(page.get_by_role('button',name='نقدّم هذه الخدمة',exact=True)).to_have_count(0)
 check('Explicit opt-in adds just the selected service',page.evaluate('fixture.session.draft.services.length===2 && fixture.applied===0'))
 ctx.close()
 page,ctx=setup(browser);page.get_by_test_id('concierge-text-choice').click();expect(page.get_by_test_id('concierge-message')).to_be_visible()
 page.get_by_test_id('concierge-message').fill('أنا عندي ليزر رجال لحيه بس');page.get_by_test_id('concierge-send').click()
 expect(page.locator('.sv-wizard-meta')).to_contain_text('معاينة مؤقتة')
 check('Streaming service preview appears before committed draft',page.evaluate('fixture.session.draft.services.length===0'))
 expect(page.get_by_test_id('concierge-send')).to_be_enabled()
 check('Final commit replaces preview with exactly one persisted draft service',page.evaluate('fixture.session.draft.services.length===1'))
 expect(page.locator('.sv-wizard-meta')).to_contain_text('مسودة محفوظة')
 page.get_by_test_id('wizard-review').click();page.locator('.sv-approval input[type=checkbox]').check();expect(page.get_by_test_id('wizard-save-setup')).to_be_disabled()
 check('Missing prices and duration prevent publication even after checkbox')
 ctx.close()
 page,ctx=setup(browser);page.evaluate('fixture.failStream=true');page.get_by_test_id('concierge-text-choice').click();page.get_by_test_id('concierge-message').fill('ليزر رجال لحيه بس');page.get_by_test_id('concierge-send').click();expect(page.locator('.sv-wizard-meta')).to_contain_text('معاينة مؤقتة');expect(page.locator('.jc-error')).to_be_visible()
 check('Interrupted stream clears speculative service and never publishes',page.evaluate('fixture.session.draft.services.length===0 && fixture.applied===0') and page.locator('.sv-card').count()==0)
 ctx.close();browser.close()
 check('No uncaught browser errors',not errors)
report={'passed':len(checks),'checks':checks,'errors':errors,'scope':'Actual new React19 service components and existing ConciergeView in Chromium; synthetic HTTP and model stream. Not a full application build or DB/auth/live AI/voice test.'}
(OUT/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
