"""Opt-in live WebRTC diagnostic. Uses a silent synthetic track, never the user's microphone.
The project key stays in the server-side child process. Prints only transport status.
"""
import json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
if not os.environ.get('JORMALL_OPENAI_API_KEY'):
    raise SystemExit('Application-specific key required')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True,args=['--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page()
    page.goto('http://localhost:19880/login')
    offer=page.evaluate('''async()=>{
      window.voiceStatus={connected:false,audio:false,transcript:false,done:false};
      const pc=new RTCPeerConnection();window.testPeer=pc;
      const ac=new AudioContext(),dst=ac.createMediaStreamDestination();window.testAudioContext=ac;
      const oscillator=ac.createOscillator(),gain=ac.createGain();gain.gain.value=0;oscillator.connect(gain);gain.connect(dst);oscillator.start();await ac.resume();
      pc.addTrack(dst.stream.getAudioTracks()[0],dst.stream);
      pc.ontrack=e=>{voiceStatus.audio=true;const audio=new Audio();audio.autoplay=true;audio.muted=true;audio.srcObject=e.streams[0];window.testOutput=audio;audio.play().catch(()=>{});};
      const dc=pc.createDataChannel('oai-events');window.testChannel=dc;
      dc.onopen=()=>{voiceStatus.connected=true;dc.send(JSON.stringify({type:'response.create',response:{instructions:'Say only in Jordanian Arabic: أهلين، جاهزة أساعدك. This is a connection check.'}}));};
      dc.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.type==='response.output_audio_transcript.delta')voiceStatus.transcript=true;if(msg.type==='output_audio_buffer.stopped')voiceStatus.done=true;if(msg.type==='error')voiceStatus.error=msg.error?.code||'realtime_error';if(msg.type==='response.done'&&msg.response?.status==='failed')voiceStatus.error=msg.response?.status_details?.error?.code||'response_failed';};
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);return offer.sdp;
    }''')
    code="import {createRealtimeOffer} from './src/concierge/providers.ts';let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{createRealtimeOffer(s,'ar',null,{},'jormall-local-diagnostic').then(answer=>console.log(JSON.stringify({answer}))).catch(e=>console.log(JSON.stringify({error:e.code||'failed'})));});"
    result=subprocess.run(['pnpm.cmd','--filter','api-server','exec','tsx','-e',code],input=offer,text=True,capture_output=True,cwd=ROOT,timeout=45)
    lines=[line for line in result.stdout.splitlines() if line.startswith('{')]
    answer=json.loads(lines[-1]) if lines else {'error':'provider_process_failed'}
    if not lines:
        detail=(result.stderr or result.stdout).replace(os.environ['JORMALL_OPENAI_API_KEY'],'[redacted]')
        print(json.dumps({'diagnostic':detail[:1200],'exitCode':result.returncode}))
    if 'error' in answer:
        print(json.dumps({'error':answer['error']}));browser.close();raise SystemExit(1)
    page.evaluate('answer=>testPeer.setRemoteDescription({type:"answer",sdp:answer})',answer['answer'])
    try:page.wait_for_function('voiceStatus.done||voiceStatus.error',timeout=30000)
    except Exception:pass
    status=page.evaluate('voiceStatus')
    status['audioStats']=page.evaluate('''async()=>{const rows=[...(await testPeer.getStats()).values()].filter(r=>r.type==='inbound-rtp'&&r.kind==='audio');return rows.map(r=>({packetsLost:r.packetsLost,jitter:r.jitter,concealedSamples:r.concealedSamples,totalSamplesReceived:r.totalSamplesReceived}));}''')
    page.evaluate('testPeer.close();testAudioContext.close()')
    browser.close()
    print(json.dumps(status))
    if not all(status.get(k) for k in ['connected','audio','transcript','done']) or status.get('error'):raise SystemExit(1)
