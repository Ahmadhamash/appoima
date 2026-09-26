"""Actual app/React UI with synthetic API and WebRTC transport; no external AI calls."""
import copy,json,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'verification'/'concierge-guided';OUT.mkdir(parents=True,exist_ok=True)
permissions=[f'{area}.{level}' for area in ['settings','employees','services','rooms','customers','appointments','inventory'] for level in ['read','manage']]
user=dict(id=999,clinicId=999,branchId=None,email='fixture@example.test',name='مدير التجربة',nameLang='ar',role='manager',permissions=permissions,mustChangePassword=False,home='manager',nav=['home','people','business','appointments'])
base=dict(revision=1,stage='conversation',preferredName=user['name'],language='ar',consented=True,draft=dict(branches=[],services=[],rooms=[],staff=[]),uploads=[],ui='none',navigation=None,companyChecked=True,companyCandidate=None,companyProfile=None,message=dict(id='stage:conversation',role='assistant',text='شو اسم شركتك؟'),busy=False,applied=None)
caps=dict(enabled=True,llm=True,tts=True,stt=True,voice=True,configuredOnly=True,missing=[],formats=['pdf'],uploadMaxBytes=8388608,voiceSeconds=3300)
staff=dict(key='staff_1',name='سارة أحمد',nameLang='ar',email='sara@example.test',phone=None,jobTitle='موظفة استقبال',branchKey=None,role='secretary',serviceKeys=None,workingHours=None,breaks=None)
SHIM="""
window.micRequests=0;window.voiceSends=[];window.inputSamples=[];setInterval(()=>{const v=document.querySelector('[data-testid="input-name"]')?.value;if(v&&inputSamples.at(-1)!==v)inputSamples.push(v)},20);window.fakeTrack={enabled:true,stop(){this.stopped=true}};
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{window.micRequests++;return {getAudioTracks:()=>[fakeTrack],getTracks:()=>[fakeTrack]}}});
window.RTCPeerConnection=class{connectionState='new';createDataChannel(){const c={readyState:'open',send:s=>voiceSends.push(JSON.parse(s)),close(){this.readyState='closed'}};window.voiceEmit=e=>c.onmessage?.({data:JSON.stringify(e)});return c;}addTrack(){}async createOffer(){return {type:'offer',sdp:'v=0\\r\\n'}}async setLocalDescription(){}async setRemoteDescription(){this.connectionState='connected';this.onconnectionstatechange?.()}close(){this.connectionState='closed'}};
"""

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True,args=['--enable-unsafe-swiftshader'])
    for width,height in [(1440,1000),(390,844)]:
        context=browser.new_context(viewport=dict(width=width,height=height),locale='ar-JO')
        context.add_init_script(SHIM)
        page=context.new_page();page.set_default_timeout(12000)
        state=copy.deepcopy(base);state['companyChecked']=False;requests=[];errors=[];turn_count=[0]
        page.on('pageerror',lambda e:errors.append(str(e)))
        def route(r):
            path=urlparse(r.request.url).path;requests.append((r.request.method,path));data={}
            if path=='/api/auth/me':data={'user':user}
            elif path=='/api/me/clinic':data={'clinic':dict(id=999,name='شركة التجربة',nameLang='ar',status='active',progress={})}
            elif path=='/api/concierge/bootstrap':data=dict(session=state,capabilities=caps)
            elif path=='/api/concierge/start':data=dict(session=state,capabilities=caps)
            elif path=='/api/concierge/mode':state['revision']+=1;data=state
            elif path=='/api/concierge/company-lookup':
                state['revision']+=1;state['companyCandidate']=dict(name='شركة التجربة',found=True,industry='خدمات',location='عمّان',website=None,summary='نتيجة تجريبية لاختبار واجهة تأكيد الشركة.',sources=[dict(title='مصدر تجريبي',url='https://example.com')]);data=state
            elif path=='/api/concierge/import-links':
                assert len(r.request.post_data_json['urls'])==2
                state['sourceImport']=True;state['companyChecked']=False;state['revision']+=1
                state['companyCandidate']=dict(name='مركز الروابط',found=True,industry=None,location=None,website=None,summary='بيانات عامة تجريبية',sources=[dict(title='موقع المركز',url='https://example.com')],details=dict(logoDataUrl=None,colors=['#8b426e'],website='https://example.com',branches=[dict(name='فرع تجريبي',detail='عمّان',sourceUrl='https://example.com')],services=[dict(name='خدمة بشرة',detail='السعر غير منشور',sourceUrl='https://example.com')],status='partial'));data=state
            elif path=='/api/concierge/company-confirm':
                if state.get('sourceImport'):
                    state['draft']['staff']=[];state['draft']['branches']=[dict(key='web_branch_1',existingId=None,name='فرع تجريبي',nameLang='ar',timeZone=None,openingHours=None)];state['draft']['services']=[dict(key='web_service_1',name='خدمة بشرة',nameLang='ar',branchKey=None,durationMinutes=None,price=None,currency=None,category=None,requiresRoom=None)];state['branding']=dict(name=state['companyCandidate']['name'],details=state['companyCandidate']['details'])
                state['workflow']=dict(step='staff',label='الموظفين',index=4,total=6,prompt='شو اسم أول موظف؟',completed=[],focus=dict(resource='employees',key='pending_staff',field='name'))
                state['revision']+=1;state['companyChecked']=True;state['companyProfile']=state['companyCandidate'];state['companyCandidate']=None;data=state
            elif path=='/api/concierge/realtime-offer':r.fulfill(status=200,content_type='application/sdp',body='v=0\r\n');return
            elif path=='/api/concierge/turn':
                turn_count[0]+=1;state['revision']+=1;state['draft']['staff']=[copy.deepcopy(staff)];state['navigation']='/people/employees'
                state['workflow']['focus']=dict(resource='employees',key='staff_1',field='email')
                if turn_count[0]>1:state['draft']['staff'][0]['phone']='0791234567'
                data=state
            elif path=='/api/concierge/upload':
                state['revision']+=1;state['uploads']=[dict(id='file',name='company.txt',size=20,status='read',summary='Company details')];data=state
            elif path=='/api/concierge/draft':
                body=r.request.post_data_json;state['draft']=body['draft'];state['revision']+=1;data=state
            elif path=='/api/concierge/review':data=dict(revision=state['revision'],draft=state['draft'],issues=[],staffAccess=[],grantablePermissions=permissions,options=dict(branches=[],services=[]))
            elif path=='/api/clinic/options':data=dict(branches=[],services=[],employees=[],timeZones=['Asia/Amman'],currencies=['JOD'],grantablePermissions=permissions,rolePresets=dict(secretary=[]))
            elif path.startswith('/api/clinic/'):data=dict(items=[],total=0,page=1,pageSize=20)
            else:data={}
            r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
        page.route('**/api/**',route)
        page.goto('http://localhost:19880/home')
        expect(page.get_by_test_id('concierge-voice-choice')).to_be_visible()
        expect(page.locator('.jc-mode-card')).to_have_count(3)
        assert page.evaluate("document.getElementById('root').inert")
        assert not any(path.endswith('/speech') for _,path in requests)
        page.screenshot(animations='disabled', path=str(OUT/f'entry-{width}.png'))
        page.get_by_test_id('concierge-voice-choice').click()
        expect(page.locator('dialog')).to_have_attribute('data-flow','intro')
        page.wait_for_function('window.voiceSends.length>0')
        assert not page.evaluate('fakeTrack.enabled')
        page.evaluate("voiceEmit({type:'response.created'});voiceEmit({type:'response.output_audio_transcript.delta',delta:'رح نعبّي سوا كل إشي بخص شركتك، خلال حوالي ربع ساعة.'});voiceEmit({type:'response.done'})")
        expect(page.locator('dialog')).to_have_attribute('data-flow','intro')
        page.screenshot(animations='disabled', path=str(OUT/f'intro-{width}.png'))
        page.evaluate("voiceEmit({type:'output_audio_buffer.stopped'})")
        expect(page.locator('dialog')).to_have_attribute('data-flow','workspace')
        assert page.evaluate('fakeTrack.enabled')
        assert not page.evaluate("document.getElementById('root').inert")
        page.evaluate("voiceEmit({type:'conversation.item.input_audio_transcription.completed',transcript:'شركة التجربة'})")
        expect(page.get_by_test_id('concierge-company-card')).to_be_visible()
        expect(page.locator('dialog')).to_have_attribute('data-flow','company')
        assert page.evaluate('fakeTrack.enabled')
        page.evaluate("voiceEmit({type:'conversation.item.input_audio_transcription.completed',transcript:'نعم'})")
        expect(page.locator('dialog')).to_have_attribute('data-flow','workspace')
        expect(page.get_by_test_id('form-employees')).to_have_attribute('data-assistant-key','pending_staff')
        page.get_by_test_id('input-jobTitle').fill('استقبال وتنسيق')
        page.evaluate("voiceEmit({type:'conversation.item.input_audio_transcription.completed',transcript:'اسم الموظفة سارة أحمد وإيميلها sara@example.test'});voiceEmit({type:'response.created'});voiceEmit({type:'response.output_audio_transcript.delta',delta:'تمام، شو أوقات دوام سارة؟'})")
        expect(page.get_by_test_id('form-employees')).to_be_visible()
        expect(page.get_by_test_id('input-name')).to_have_value(staff['name'])
        expect(page.get_by_test_id('input-email')).to_have_value(staff['email'])
        expect(page.get_by_test_id('input-jobTitle')).to_have_value('استقبال وتنسيق')
        page.wait_for_function("!document.querySelector('.jc-cursor-writing')")
        assert any(0<len(v)<len(staff['name']) for v in page.evaluate('inputSamples'))
        assert page.evaluate('fakeTrack.enabled')
        assert not any(method=='POST' and path=='/api/clinic/employees' for method,path in requests)
        page.screenshot(animations='disabled', path=str(OUT/f'writing-{width}.png'))
        page.get_by_test_id('input-name').fill('سارة خالد')
        page.evaluate("voiceEmit({type:'conversation.item.input_audio_transcription.completed',transcript:'رقمها 0791234567'})")
        expect(page.get_by_test_id('input-phone')).to_have_value('0791234567')
        expect(page.get_by_test_id('input-name')).to_have_value('سارة خالد')
        page.wait_for_function("!document.querySelector('.jc-cursor-writing')")
        page.evaluate("voiceEmit({type:'response.created'});voiceEmit({type:'response.output_audio_transcript.delta',delta:'ارفع ملف الشركة وبراجعه معك.'})")
        expect(page.locator('dialog')).to_have_attribute('data-flow','upload')
        page.get_by_test_id('concierge-upload-dismiss').click()
        expect(page.locator('dialog')).to_have_attribute('data-flow','workspace')
        page.get_by_test_id('concierge-attach').click()
        expect(page.locator('dialog')).to_have_attribute('data-flow','upload')
        assert page.evaluate('fakeTrack.enabled')
        page.screenshot(animations='disabled', path=str(OUT/f'upload-{width}.png'))
        page.get_by_test_id('concierge-file').set_input_files(dict(name='company.txt',mimeType='text/plain',buffer=b'Company details'))
        expect(page.locator('dialog')).to_have_attribute('data-flow','workspace')
        assert page.evaluate('fakeTrack.enabled')
        page.get_by_test_id('input-name').fill('سارة خالد')
        page.get_by_test_id('save-record').click()
        expect(page.locator('dialog')).to_have_attribute('data-flow','review')
        assert state['draft']['staff'][0]['name']=='سارة خالد'
        page.get_by_test_id('concierge-close').click()
        page.get_by_test_id('concierge-open').click()
        expect(page.locator('.jc-mode-card')).to_have_count(3)
        page.get_by_test_id('concierge-manual').click()
        expect(page.get_by_test_id('concierge-dialog')).not_to_be_visible()
        assert not page.evaluate("document.getElementById('root').inert")
        page.get_by_test_id('concierge-open').click()
        page.get_by_test_id('concierge-voice-choice').click()
        expect(page.locator('dialog')).to_have_attribute('data-flow','intro')
        page.wait_for_function('window.voiceEmit && window.fakeTrack.enabled===false')
        page.evaluate("voiceEmit({type:'response.done',response:{status:'failed',status_details:{error:{code:'credit_balance_exhausted'}}}})")
        expect(page.locator('dialog')).to_have_attribute('data-flow','entry')
        expect(page.locator('.jc-error')).to_be_visible()
        mic_before=page.evaluate('micRequests')
        page.get_by_test_id('concierge-links-choice').click()
        expect(page.locator('dialog')).to_have_attribute('data-flow','links')
        page.get_by_test_id('concierge-links-input').fill('https://example.com\nhttps://instagram.com/example')
        page.get_by_test_id('concierge-links-submit').click()
        expect(page.get_by_test_id('concierge-company-card')).to_be_visible()
        expect(page.get_by_test_id('concierge-company-card')).to_contain_text('خدمة بشرة')
        page.screenshot(animations='disabled', path=str(OUT/f'links-result-{width}.png'))
        page.get_by_role('button',name='نعم، هاي شركتي',exact=True).click()
        expect(page.get_by_test_id('concierge-review')).to_be_visible()
        assert page.evaluate('micRequests')==mic_before
        assert state['draft']['services'][0]['price'] is None
        assert not any(method=='POST' and path=='/api/concierge/apply' for method,path in requests)
        page.screenshot(animations='disabled', path=str(OUT/f'links-review-{width}.png'))
        assert not errors,errors
        print(f'PASS {width}px: three choices, blur, playback-timed intro, real field entry, concurrent voice, upload focus, corrected review, manual exit',flush=True)
        context.close()
    browser.close()
