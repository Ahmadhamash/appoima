"""Real Chromium DOM/canvas tests with SYNTHETIC HTTP fixtures (not DB/API acceptance).
Requires Python Playwright, Chromium, the local fixture server and build-concierge-ui-test.mjs.
Uses page.set_content + a test-only transport bridge when container browser navigation is restricted.
The production component itself is not replaced or mocked. No real provider requests are made.
"""
import asyncio,base64,copy,http.cookiejar,importlib.util,json,re,urllib.request,urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification/concierge';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('fixtures',Path(__file__).with_name('concierge-ui-harness.py'));fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
SHIM="""window.fetch=async (url,init={})=>{const req={path:String(url),method:init.method||'GET',headers:init.headers||{}};if(init.body instanceof Blob){const a=new Uint8Array(await init.body.arrayBuffer());let s='';for(const c of a)s+=String.fromCharCode(c);req.binary=btoa(s);}else if(init.body!==undefined)req.body=init.body;const r=await window.fixtureFetch(req);return new Response(Uint8Array.from(atob(r.body),c=>c.charCodeAt(0)),{status:r.status,headers:r.headers});};"""
results=[];errors=[]
def check(name,condition=True):
 assert condition,name
 results.append(name);print('PASS COMPONENT_BROWSER',name,flush=True)
def setup(browser,mode='text',width=1440,height=1000,reduced=False):
 opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));opener.open('http://127.0.0.1:18763/?mode='+mode).read()
 def request(req):
  data=req.get('body');body=base64.b64decode(req['binary']) if 'binary'in req else data.encode() if data is not None else None
  call=urllib.request.Request('http://127.0.0.1:18763'+req['path'],data=body,headers=req.get('headers',{}),method=req.get('method','GET'))
  try:r=opener.open(call)
  except urllib.error.HTTPError as e:r=e
  return {'status':r.status,'body':base64.b64encode(r.read()).decode(),'headers':dict(r.headers)}
 async def bridge(req):return await asyncio.to_thread(request,req)
 context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce' if reduced else 'no-preference')
 page=context.new_page();page.set_default_timeout(8000);page.on('pageerror',lambda e:errors.append(str(e)));page.expose_function('fixtureFetch',bridge)
 page.set_content(re.sub(r'<script.*?</script>','',fixtures.HTML,flags=re.S));page.add_style_tag(content=(ROOT/'artifacts/jormall/src/components/concierge/concierge.css').read_text());page.add_script_tag(content=SHIM);page.add_script_tag(content=(OUT/'browser-embedded-bundle.js').read_text())
 page.evaluate("window.testNav=[];window.testApplied=0;window.backgroundClicks=0;document.getElementById('background-action').onclick=()=>window.backgroundClicks++;window.view=new window.ConciergeView({onNavigate:p=>testNav.push(p),onApplied:()=>testApplied++,onStaffHelp:()=>testNav.push('HELP')});")
 expect(page.get_by_test_id('concierge-name')).to_be_visible()
 def state():return json.loads(opener.open('http://127.0.0.1:18763/__test/state').read())
 return page,context,state

def name(page,value='جاد'):
 page.get_by_test_id('concierge-name').fill(value);page.get_by_test_id('concierge-name-next').click();expect(page.get_by_test_id('concierge-manual')).to_be_visible()
def conversation(page):
 name(page);page.get_by_test_id('concierge-text-choice').click();expect(page.get_by_test_id('concierge-start')).to_be_disabled();page.get_by_test_id('concierge-consent').check();page.get_by_test_id('concierge-start').click();expect(page.get_by_test_id('concierge-message')).to_be_visible()
def say(page,msg):
 page.get_by_test_id('concierge-message').fill(msg);page.get_by_test_id('concierge-send').click();expect(page.get_by_test_id('concierge-send')).to_be_enabled()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page,ctx,state=setup(browser)
 check('auto-opens a native, full-screen modal',page.locator('dialog').evaluate('(e)=>e.open && e.matches(":modal") && e.clientWidth===innerWidth'))
 check('orb is a live canvas, not an image',page.locator('dialog canvas').count()==1 and page.locator('dialog img').count()==0)
 a=page.locator('canvas').evaluate('(e)=>e.toDataURL()');page.wait_for_timeout(600);b=page.locator('canvas').evaluate('(e)=>e.toDataURL()');check('liquid orb pixels actually animate',a!=b)
 page.screenshot(path=str(OUT/'ui-name-desktop.png'))
 # Native modal focus containment, rather than a cosmetic overlay.
 for _ in range(10):page.keyboard.press('Tab')
 check('keyboard focus is trapped in the active dialog',page.evaluate('document.querySelector("dialog").contains(document.activeElement)'))
 name(page);expect(page.get_by_test_id('concierge-name')).to_have_count(0);check('name field disappears after server acceptance')
 check('name persisted through the actual client API request',state()['session']['preferredName']=='جاد')
 page.get_by_test_id('concierge-close').click();expect(page.get_by_test_id('concierge-dialog')).not_to_be_visible();page.get_by_test_id('concierge-open').click();expect(page.get_by_test_id('concierge-manual')).to_be_visible();check('reopen resumes stage, does not ask for name again',page.get_by_test_id('concierge-name').count()==0)
 page.get_by_test_id('concierge-manual').click();page.wait_for_function('testNav.length===1');check('manual choice enters the existing setup route',page.evaluate('testNav[0]')=='/business/settings');ctx.close()
 page,ctx,state=setup(browser,'unconfigured',390,844);page.screenshot(path=str(OUT/'ui-name-mobile-ar.png'));check('Arabic is RTL at 390px',page.locator('dialog').get_attribute('dir')=='rtl')
 check('no horizontal overflow at 390px',page.locator('dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'))
 name(page);expect(page.get_by_test_id('concierge-voice-choice')).to_be_disabled();expect(page.get_by_test_id('concierge-manual')).to_be_enabled();check('missing keys are honest; manual setup remains available')
 page.get_by_test_id('concierge-language').click();expect(page.locator('dialog')).to_have_attribute('dir','ltr');expect(page.get_by_test_id('concierge-manual')).to_be_visible();check('English translation switches direction');page.wait_for_timeout(750);page.screenshot(path=str(OUT/'ui-choice-mobile-en.png'))
 page.keyboard.press('Escape');expect(page.get_by_test_id('concierge-dialog')).not_to_be_visible();check('Escape releases modal focus and overlay');ctx.close()
 page,ctx,state=setup(browser)
 conversation(page);check('cloud consent is explicit and submitted',state()['session']['consented'] is True)
 say(page,'عندي pdf للفروع');expect(page.get_by_test_id('concierge-upload')).to_be_visible();check('mentioning a PDF reveals a contextual upload control')
 check('draft is collected but business apply was never called',len(state()['session']['draft']['branches'])==1 and not any(c['path'].endswith('/apply') for c in state()['calls']))
 check('custom mutation header and retry ID sent',any(c['intent']=='concierge' and re.match(r'^[0-9a-f-]{36}$',c['body'].get('requestId','')) for c in state()['calls']))
 page.get_by_test_id('concierge-file').set_input_files({'name':'info.txt','mimeType':'text/plain','buffer':'فرع عمّان'.encode()});expect(page.locator('.jc-status')).to_have_text('عم برفع الملف وبقرأ محتواه…');check('upload has truthful pending state, orb stays visible',page.get_by_test_id('concierge-file-result').count()==0 and page.get_by_test_id('concierge-orb').is_visible())
 expect(page.get_by_test_id('concierge-file-result')).to_contain_text('تمت قراءة الملف');check('read success appears only after the fixture processing response')
 page.screenshot(path=str(OUT/'ui-conversation-desktop.png'))
 page.get_by_test_id('concierge-review-open').click();expect(page.get_by_test_id('concierge-review')).to_be_visible();expect(page.get_by_test_id('concierge-apply')).to_be_disabled();check('review cannot apply without explicit confirmation')
 page.locator('details summary').first.click();page.get_by_test_id('draft-branch_new-name').fill('فرع جديد');expect(page.get_by_test_id('concierge-confirm')).to_be_disabled();check('edits require saving corrections and fresh review')
 page.get_by_test_id('concierge-save-draft').click();expect(page.get_by_test_id('concierge-save-draft')).to_be_disabled();check('edited draft round-trips through API',state()['session']['draft']['branches'][0]['name']=='فرع جديد')
 page.get_by_test_id('concierge-confirm').check();page.get_by_test_id('concierge-apply').click();expect(page.get_by_test_id('concierge-enter')).to_be_visible();check('confirmed setup invokes apply and cache invalidation',state()['session']['stage']=='complete' and page.evaluate('testApplied')==1)
 check('successful apply is not duplicated',sum(c['path'].endswith('/apply') for c in state()['calls'])==1);ctx.close()
 page,ctx,state=setup(browser,'staff',390,844);conversation(page);say(page,'موظفة وفرع');page.get_by_test_id('concierge-review-open').click();expect(page.get_by_test_id('draft-staff_new-password')).to_be_visible();page.get_by_test_id('draft-staff_new-password').fill('Synthetic-secure-password!')
 check('password is not sent in conversational or draft requests','Synthetic-secure-password!' not in json.dumps(state()['calls']))
 page.get_by_test_id('access-staff_new-appointments.manage').check();page.get_by_test_id('concierge-confirm').check();page.get_by_test_id('concierge-apply').click();expect(page.get_by_test_id('concierge-enter')).to_be_visible();apply=[c for c in state()['calls'] if c['path'].endswith('/apply')][0]['body'];check('staff password and reviewed permissions go only to apply',apply['staff'][0]['initialPassword']=='Synthetic-secure-password!' and 'appointments.manage' in apply['staff'][0]['permissions'])
 check('password fields are removed after saving',page.locator('input[type=password]').count()==0);ctx.close()
 page,ctx,state=setup(browser);conversation(page);say(page,'FAIL');expect(page.locator('.jc-error')).to_be_visible();check('provider failure is shown without a false success',state()['session']['draft']==fixtures.EMPTY and page.get_by_test_id('concierge-enter').count()==0)
 page.get_by_test_id('concierge-close').click();ctx.close()
 page,ctx,state=setup(browser,reduced=True);a=page.locator('canvas').evaluate('(e)=>e.toDataURL()');page.wait_for_timeout(300);b=page.locator('canvas').evaluate('(e)=>e.toDataURL()');check('reduced-motion freezes liquid animation',a==b);ctx.close()
 # In the restricted container, about:blank is not a secure microphone origin.
 page,ctx,state=setup(browser,'voice');page.get_by_test_id('concierge-name').fill('جاد');page.wait_for_timeout(900);check('greeting completion does not erase the typed name',page.get_by_test_id('concierge-name').input_value()=='جاد');name(page);page.get_by_test_id('concierge-voice-choice').click();page.get_by_test_id('concierge-consent').check();page.get_by_test_id('concierge-start').click();expect(page.get_by_test_id('concierge-message')).to_be_visible();check('unsupported microphone environment falls back without requesting a token',not any(c['path'].endswith('/voice-token') for c in state()['calls']));page.get_by_test_id('concierge-close').click();check('close stops audio and releases modal',page.evaluate('!document.querySelector("dialog").open'));ctx.close()
 check('no uncaught JavaScript errors',not errors);browser.close()
report={'passed':len(results),'checks':results,'uncaughtErrors':errors,'scope':'Real production DOM/canvas controller, synthetic HTTP fixtures; browser navigation policy required set_content plus test transport bridge. No React app, real auth/database or live provider acceptance. Microphone capture/AudioWorklet on a secure origin remains unverified.'}
(OUT/'component-browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
