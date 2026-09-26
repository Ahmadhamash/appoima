"""Opt-in live companion check using synthetic Arabic speech, never a user's microphone."""
import base64,json,os,urllib.request
from playwright.sync_api import sync_playwright

def post(url,key,payload):
    request=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response:return response.read()

temporary=json.loads(post('https://api.soniox.com/v1/auth/temporary-api-key',os.environ['SONIOX_API_KEY'],dict(usage_type='transcribe_websocket',expires_in_seconds=60,single_use=True,max_session_duration_seconds=60)))['api_key']
speech=post('https://api.openai.com/v1/audio/speech',os.environ['JORMALL_OPENAI_API_KEY'],dict(model='gpt-4o-mini-tts',voice='marin',response_format='mp3',input='اسم المركز كارمالايت، وعنا فرعين، والخدمات نفسها بكل الفروع.',instructions='تحدثي باللهجة الأردنية بوضوح.'))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True,args=['--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page();diagnostics=[]
    def frame(payload):
        try:
            data=json.loads(payload)
            if data.get('error_type'):diagnostics.append({'error':data['error_type']})
            elif data.get('error_code'):diagnostics.append({'errorCode':data['error_code'],'message':data.get('error_message','')[:180]})
            elif data.get('tokens'):diagnostics.append({'tokens':[{k:t.get(k) for k in ['text','confidence','is_final']} for t in data['tokens']]})
        except (ValueError,TypeError):pass
    page.on('websocket',lambda ws:ws.on('framereceived',frame));page.goto('http://localhost:19880/login')
    result=page.evaluate('''async({key,audio})=>{
      const {SonioxAssist}=await import('/src/components/concierge/soniox-assist.ts');
      const context=new AudioContext(),destination=context.createMediaStreamDestination();await context.resume();
      const helper=new SonioxAssist();await helper.start({request:async()=>({enabled:true,apiKey:key})},destination.stream,'ar');
      const bytes=Uint8Array.from(atob(audio),c=>c.charCodeAt(0));const source=context.createBufferSource();source.buffer=await context.decodeAudioData(bytes.buffer);source.connect(destination);
      helper.speechStarted();await new Promise(resolve=>{source.onended=resolve;source.start();});await new Promise(resolve=>setTimeout(resolve,300));
      const start=performance.now(),text=await helper.refine('FALLBACK_SENTINEL');helper.stop();destination.stream.getTracks().forEach(t=>t.stop());await context.close();
      return {recognized:text!=='FALLBACK_SENTINEL',arabic:/[\u0600-\u06ff]/.test(text),latencyMs:Math.round(performance.now()-start),text};
    }''',dict(key=temporary,audio=base64.b64encode(speech).decode()))
    print(json.dumps(result,ensure_ascii=True));browser.close()
    if not result['recognized']:
        print(json.dumps(diagnostics,ensure_ascii=True));raise SystemExit(1)
