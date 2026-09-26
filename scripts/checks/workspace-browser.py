"""Production component tests with synthetic callback fixtures. NOT full-app API acceptance."""
import os,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
folder=Path(os.environ.get('WORKSPACE_TEST_OUT',root/'verification/internal-workspace/component-harness'))
out=root/'verification/internal-workspace/screenshots';out.mkdir(parents=True,exist_ok=True)
def load_fixture(page,query):
 page.goto('about:blank')
 html=(folder/'index.html').read_text()
 html=re.sub(r'<script[^>]*src=[^>]*></script>','',html)
 html=html.replace('<link rel="stylesheet" href="workspace.css">','<style>'+(folder/'workspace.css').read_text()+'</style>')
 page.set_content(html)
 page.evaluate('(params)=>window.__testParams=params',query)
 page.add_script_tag(content=(folder/'ui.js').read_text())
 page.add_script_tag(content=(folder/'fixture.js').read_text())
checks=[];errors=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
 page.on('pageerror',lambda error:errors.append(str(error)))
 load_fixture(page,'lang=en');page.get_by_test_id('workspace-identity-panel').wait_for()
 check('Actual identity editor and signed-in surface render',page.locator('.cw-title').count()==2)
 page.get_by_role('button',name='Edit identity',exact=True).click()
 page.get_by_test_id('workspace-nameEn').fill('Owner corrected clinic')
 check('Editing changes only the private preview',page.locator('#editor .cw-title').inner_text()=='Owner corrected clinic' and page.locator('#active .cw-title').inner_text()=='Safa Care Clinic')
 check('Unsaved local status and dirty callback are visible',page.evaluate('window.__fixture.dirty') and 'unsaved' in page.locator('.cw-save-status').inner_text())
 page.get_by_test_id('workspace-save-identity').click();page.get_by_role('button',name='Edit identity',exact=True).wait_for()
 check('Save to draft survives rerender but does not change active workspace',page.evaluate('window.__fixture.draft.profile.nameEn')=='Owner corrected clinic' and page.locator('#active .cw-title').inner_text()=='Safa Care Clinic')
 page.get_by_test_id('fixture-apply').click()
 check('Only explicit confirmed save changes active workspace',page.locator('#active .cw-title').inner_text()=='Owner corrected clinic')
 page.get_by_role('button',name='Edit identity',exact=True).click();page.get_by_test_id('workspace-nameEn').fill('Unsaved replacement');page.get_by_role('button',name='Discard edits',exact=True).click()
 check('Discard restores saved identity, not the abandoned text',page.get_by_test_id('workspace-nameEn').input_value()=='Owner corrected clinic')
 page.get_by_test_id('workspace-nameAr').fill('');page.get_by_test_id('workspace-nameEn').fill('');page.get_by_test_id('workspace-save-identity').click()
 check('Invalid identity stays editable and reports a field error',page.get_by_role('alert').count()==1 and 'name' in page.get_by_role('alert').inner_text())
 page.get_by_test_id('workspace-nameEn').fill('Retry preserves edits');page.evaluate('window.__fixture.fail()');page.get_by_test_id('workspace-save-identity').click();page.wait_for_timeout(80)
 check('Failed save retains owner input and shows recovery error',page.get_by_test_id('workspace-nameEn').input_value()=='Retry preserves edits' and page.get_by_role('alert').count()==1)
 page.get_by_test_id('workspace-save-identity').click();page.wait_for_timeout(80);check('Retry saves the same pending identity',page.evaluate('window.__fixture.draft.profile.nameEn')=='Retry preserves edits')
 page.evaluate('window.__fixture.propose()');page.get_by_text('Source facts awaiting your decision',exact=True).wait_for()
 check('Source fact has a source URL and does not overwrite a field',page.evaluate('window.__fixture.draft.profile.phone') is None and page.get_by_role('link',name='View source',exact=True).get_attribute('href')=='https://clinic.example/contact')
 page.get_by_role('button',name='Use this value',exact=True).click();page.wait_for_timeout(80)
 check('Explicit source selection saves the one fact and updates preview',page.evaluate('window.__fixture.draft.profile.phone')=='+9626000001' and '+9626000001' in page.locator('#editor .cw-contact').inner_text())
 page.get_by_role('button',name='Mobile',exact=True).click();check('Private mobile preview toggle is accessible',page.get_by_role('button',name='Mobile',exact=True).get_attribute('aria-pressed')=='true' and page.locator('.cw-preview-mobile').count()==1)
 page.get_by_role('button',name='Desktop',exact=True).click();page.screenshot(path=str(out/'owner-preview-en-desktop.png'),full_page=True)
 load_fixture(page,'lang=ar');page.get_by_test_id('workspace-identity-panel').wait_for();check('Arabic owner preview uses RTL and real localized labels',page.locator('#editor .cw-panel').get_attribute('dir')=='rtl' and page.locator('#editor .cw-title').inner_text()=='عيادة صفا')
 page.screenshot(path=str(out/'owner-preview-ar-desktop.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='تعديل الهوية',exact=True).click();check('Arabic identity form fits a narrow mobile screen',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 page.get_by_test_id('workspace-logo-upload').set_input_files({'name':'unsafe.svg','mimeType':'image/svg+xml','buffer':b'<svg></svg>'});check('Invalid logo format is rejected with visible feedback',page.get_by_role('alert').count()==1)
 page.screenshot(path=str(out/'owner-editor-ar-mobile.png'),full_page=True)
 for language,width in [('ar',1440),('en',1440),('ar',390),('en',390)]:
  page.set_viewport_size({'width':width,'height':1000 if width>600 else 844});load_fixture(page,f'lang={language}&view=active&clinic={"b" if language=="en" else "a"}');page.locator('.cw-title').wait_for()
  check(f'Active {language} internal surface at {width}px fits without horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  page.screenshot(path=str(out/f'internal-home-{language}-{"desktop" if width>600 else "mobile"}.png'),full_page=True)
 page.get_by_role('link',name='Book appointment',exact=True).first.click();check('Booking entry targets existing authenticated route',page.evaluate('window.__lastNavigation')=='/appointments/new')
 load_fixture(page,'lang=en');page.get_by_role('button',name='Edit identity',exact=True).click();page.get_by_test_id('workspace-nameEn').fill('<img src=x onerror=alert(1)>')
 check('Owner content renders as text, never executable HTML',page.locator('#editor .cw-title img').count()==0 and page.locator('#editor .cw-title').inner_text()=='<img src=x onerror=alert(1)>')
 check('No JavaScript errors in production components',not errors)
 browser.close()

report={'passed':len(checks),'failed':0,'checks':checks,'consoleErrors':errors,'scope':'Actual WorkspaceIdentityPanel and workspaceSurface components in Chromium, with synthetic callbacks/store. Not a React application build or real HTTP/PostgreSQL flow. Screenshots explicitly identify this scope.'}
(root/'verification/internal-workspace/browser-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report,ensure_ascii=False))
