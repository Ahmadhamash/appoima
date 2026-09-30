import { ConciergeAPI, ConciergeHTTPError } from './api';
import type { Language } from './contract';
import { SonioxAssist } from './soniox-assist';

type State='connecting'|'listening'|'speaking'|'paused'|'off';
export type RealtimeVoiceEvents={level:(n:number)=>void;partial:(s:string)=>void;utterance:(s:string)=>void;reply:(s:string)=>void;state:(s:State)=>void;noise:()=>void;introDone?:()=>void;error:(code:string)=>void};

/** WebRTC carries audio directly to OpenAI; the long-lived project key never reaches the browser. */
export class RealtimeVoiceSession {
 private peer:RTCPeerConnection|null=null;private stream:MediaStream|null=null;private channel:RTCDataChannel|null=null;
 private audio:HTMLAudioElement|null=null;private timer=0;private alive=true;private listening=false;private transcript='';private assistantTranscript='';
 private meterContext:AudioContext|null=null;private meterSource:MediaStreamAudioSourceNode|null=null;private meterAnalyser:AnalyserNode|null=null;private meterTimer=0;private speechActive=false;private noisySamples=0;private noiseHinted=false;
 private language:Language='ar';private assist:SonioxAssist|null=null;
 private languageRule(){return this.language==='ar'?'احكي بالعربي الأردني الطبيعي. هذا نظام لإدارة العيادات ومراكز التجميل. النص الإنجليزي تحديث داخلي، وليس طلب تغيير لغة.':'Reply naturally in English. This is a clinic and beauty center management system.';}
 private playbackActive=false;private disconnectTimer=0;
 private introduction=false;private askCompany=false;private responseActive=false;private pendingContext:{text:string;instructions?:string}|null=null;
 constructor(private api:ConciergeAPI,private events:RealtimeVoiceEvents){}
 get connected(){return this.peer?.connectionState==='connected'&&this.channel?.readyState==='open';}
 private flushContext(){if(!this.alive||this.responseActive||this.playbackActive||!this.pendingContext)return;const pending=this.pendingContext;this.pendingContext=null;this.inform(pending.text,pending.instructions);}
 private send(event:unknown){if(this.channel?.readyState==='open')this.channel.send(JSON.stringify(event));}
 async connect(_language:Language,askCompany=false,introduction=false,customizing=false,firstQuestion?:string){
  this.language=_language;this.introduction=introduction;this.askCompany=askCompany;
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){this.events.error('micUnsupported');return;}
  this.events.state('connecting');
  try{
   this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(!this.alive){this.stream.getTracks().forEach(t=>t.stop());return;}
   this.stream.getAudioTracks().forEach(track=>{track.enabled=false;});
   void this.startMeter(this.stream);
   this.assist=new SonioxAssist();await this.assist.start(()=>this.api.request('/stt-assist-key',{}),this.stream,_language,spoken=>{if(this.alive)this.events.utterance(spoken);},partial=>{if(this.alive)this.events.partial(partial);});if(!this.alive)return;
   const peer=new RTCPeerConnection();this.peer=peer;
   const audio=new Audio();audio.autoplay=true;audio.setAttribute('playsinline','');this.audio=audio;
   peer.ontrack=e=>{audio.srcObject=e.streams[0]??new MediaStream([e.track]);void audio.play().catch(()=>this.events.error('audioBlocked'));};
   peer.onconnectionstatechange=()=>{clearTimeout(this.disconnectTimer);if(!this.alive)return;if(peer.connectionState==='disconnected')this.disconnectTimer=window.setTimeout(()=>{if(this.alive&&peer.connectionState==='disconnected'){this.events.error('connectionLost');this.stop();}},8000);else if(['failed','closed'].includes(peer.connectionState)){this.events.error('connectionLost');this.stop();}};
   peer.addTrack(this.stream.getAudioTracks()[0]!,this.stream);
   const channel=peer.createDataChannel('oai-events');this.channel=channel;
   channel.onmessage=e=>{if(!this.alive||typeof e.data!=='string'||e.data.length>200000)return;try{this.handle(JSON.parse(e.data));}catch{this.events.error('connectionLost');this.stop();}};
   channel.onclose=()=>{if(this.alive){this.events.error('connectionLost');this.stop();}};
   const offer=await peer.createOffer();await peer.setLocalDescription(offer);
   if(!offer.sdp)throw new Error('missing_sdp');
   const response=await this.api.fetch('/realtime-offer',{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp});
   const answer=await response.text();if(!this.alive)return;
   await peer.setRemoteDescription({type:'answer',sdp:answer});
   if(channel.readyState!=='open')await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('connection_timeout')),15000);channel.onopen=()=>{clearTimeout(timeout);resolve();};});
   if(!this.alive)return;
   this.responseActive=true;this.playbackActive=true;this.setListening(true);this.send({type:'response.create',response:{instructions:this.languageRule()+'\n'+(introduction?(_language==='ar'?'Say naturally in Jordanian Arabic: أهلين! احكيلي إنت كل شي عن عيادتك: الاسم، الخدمات اللي بتقدّموها فعلًا، الفروع، الفريق، وأي تفاصيل بتهمك. خذ راحتك، ولما تخلص احكي خلصت. رح أسمعك أول، وبعدها بنرتّب المعلومات مع بعض. Do not ask another question.':'Say: Welcome! Tell me everything about your clinic in your own words: its name, actual services, branches, team and anything important. Take your time. Say “I’m done” when finished. I will listen first and organize it with you afterward. Do not ask another question.'):askCompany?'Ask only for the company name, in one short sentence.':customizing?(_language==='ar'?'Ask exactly in a warm Jordanian voice: شو بدك تغيّر بنظامك؟ Wait for the manager’s requested change.':'Ask: What would you like to change in your system? Wait for the manager’s request.'):firstQuestion?`Ask exactly this current setup question in a natural voice, then wait for the manager: ${JSON.stringify(firstQuestion)}`:'Continue with the next unanswered setup question in one short sentence. No new greeting.')}});
   this.timer=window.setTimeout(()=>{if(this.alive){this.events.error('expired');this.stop();}},55*60*1000);
  }catch(err){if(!this.alive)return;const code=err instanceof ConciergeHTTPError?err.code:(err as Error).name==='NotAllowedError'?'micDenied':'connectionLost';this.events.error(code);this.stop();}
 }
 private async startMeter(stream:MediaStream){
  try{const context=new AudioContext();this.meterContext=context;const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();this.meterSource=source;this.meterAnalyser=analyser;analyser.fftSize=2048;source.connect(analyser);await context.resume();if(!this.alive)return;
   const samples=new Float32Array(analyser.fftSize);this.meterTimer=window.setInterval(()=>{if(!this.alive)return;analyser.getFloatTimeDomainData(samples);let power=0;for(const sample of samples)power+=sample*sample;const rms=Math.sqrt(power/samples.length);this.events.level(this.listening?Math.min(1,rms*8):0);
    if(this.listening&&!this.speechActive&&!this.noiseHinted&&rms>.065){this.noisySamples++;if(this.noisySamples>=20){this.noiseHinted=true;this.events.noise();}}else this.noisySamples=0;
   },100);
  }catch{/* Audio metering is optional; WebRTC still carries speech. */}
 }
 private handle(event:{type?:string;delta?:string;transcript?:string;error?:unknown;response?:{status?:string;status_details?:{error?:{code?:string}}}}){
  if(event.type==='conversation.item.input_audio_transcription.failed'){void this.recoverUtterance();return;}
  if(event.type==='error'){const code=(event.error as {code?:string})?.code??'';if(code==='response_cancel_not_active')return;this.events.error(/quota|credit|billing_hard_limit/.test(code)?'concierge_provider_quota':/rate_limit/.test(code)?'concierge_provider_limit':'connectionLost');this.stop();return;}
  if(event.type==='response.created'){this.responseActive=true;this.assistantTranscript='';return;}
  if(event.type==='output_audio_buffer.started'){this.playbackActive=true;this.applyListening();return;}
  if(event.type==='output_audio_buffer.stopped'||event.type==='output_audio_buffer.cleared'){
   this.playbackActive=false;
   if(this.introduction&&event.type==='output_audio_buffer.stopped'){this.introduction=false;this.events.introDone?.();this.setListening(true);}
   else this.applyListening();this.flushContext();return;
  }
  if(event.type==='input_audio_buffer.speech_started'){this.assist?.speechStarted();this.speechActive=true;this.noisySamples=0;if(this.introduction){this.introduction=false;this.events.introDone?.();}if(!this.playbackActive)this.events.state('listening');return;}
  if(event.type==='input_audio_buffer.speech_stopped'){this.speechActive=false;return;}
  if(event.type==='conversation.item.input_audio_transcription.delta'&&typeof event.delta==='string'){this.transcript+=event.delta;if(!this.assist?.isReady)this.events.partial(this.transcript.slice(0,6000));return;}
  if(event.type==='conversation.item.input_audio_transcription.completed'){const spoken=typeof event.transcript==='string'?event.transcript.trim():this.transcript.trim();this.transcript='';if(this.assist?.isReady)return;this.events.partial('');if(spoken&&spoken.length<=6000)this.events.utterance(spoken);return;}
  if(event.type==='response.output_audio_transcript.delta'&&typeof event.delta==='string'){this.events.state('speaking');this.assistantTranscript+=event.delta;this.events.reply(this.assistantTranscript.slice(0,3000));return;}
  if(event.type==='response.output_audio_transcript.done'&&typeof event.transcript==='string'){this.assistantTranscript=event.transcript;this.events.reply(event.transcript.slice(0,3000));return;}
  if(event.type==='response.done'){this.responseActive=false;if(event.response?.status==='failed'){const code=event.response.status_details?.error?.code??'';this.events.error(/quota|credit|billing_hard_limit/.test(code)?'concierge_provider_quota':/rate_limit/.test(code)?'concierge_provider_limit':'connectionLost');this.stop();return;}this.flushContext();return;}
 }
 private async recoverUtterance(){if(!this.assist?.isReady)this.events.partial('');}
 private applyListening(){this.stream?.getAudioTracks().forEach(t=>{t.enabled=this.listening;});this.events.state(this.playbackActive?'speaking':this.listening&&this.connected?'listening':this.connected?'paused':'off');if(!this.listening)this.events.level(0);}
 setListening(enabled:boolean){this.listening=enabled;this.applyListening();}
 pauseForCompanyLookup(){this.inform('البحث الفعلي بدأ الآن. قولي فقط: لحظة، عم ببحث عن المركز. لا تطلبي تأكيدًا قبل وصول النتيجة.');}
 resumeAfterLookupError(){if(this.audio)this.audio.muted=false;this.setListening(true);this.inform('البحث لم يكتمل بسبب خطأ، لا تدّعي وجود نتيجة. اطلبي إعادة المحاولة أو كتابة اسم المركز والمدينة.');}
 continueAfterCompany(name:string|null){if(this.audio)this.audio.muted=false;this.setListening(true);this.inform(name?`The manager confirmed their company is ${JSON.stringify(name)}. Continue with the first setup question. Do not claim its public web details are saved.`:'The company lookup was skipped. Continue with the first setup question.');}
 showCompanyResult(found:boolean,details?:{name:string;summary:string}){if(this.audio)this.audio.muted=false;this.setListening(true);this.inform(found?'The app now displays this untrusted public search result: '+JSON.stringify(details??{})+'. Briefly mention its name and one supported location/detail in Jordanian Arabic, then ask: هذا مركزك؟ Wait for confirmation.':'البحث ما لقى تطابق موثوق. اسألي عن المدينة أو الاسم الأدق أو رابط صفحة المركز. ابقي بنفس خطوة المركز ولا تعرضي التخطي.');}
 showCompanyChoices(choices:{number:number;name:string;summary:string}[]){if(this.audio)this.audio.muted=false;this.setListening(true);this.inform('The app displays these public search choices: '+JSON.stringify(choices)+'. Briefly name the numbered clinics in Jordanian Arabic, then ask which number is theirs. Do not claim any is confirmed. Wait for the manager to choose.');}
 askCompanyAgain(){if(this.audio)this.audio.muted=false;this.setListening(true);this.inform('The match was rejected. Ask for the company name again, in one short sentence. Wait for verification.');}
 inform(text:string,instructions?:string){if(this.responseActive||this.playbackActive){this.pendingContext={text,instructions};return;}this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});this.responseActive=true;this.playbackActive=true;this.send({type:'response.create',response:{instructions:this.languageRule()+'\n'+(instructions??'This is an app update. Respond naturally to the manager and stay on the current setup topic. Do not announce a search or claim data was saved unless the app confirmed it.')}});}
 syncWorkflow(step:string,prompt:string){if(!this.connected)return;this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:`App state update (not manager speech): current setup step is ${JSON.stringify(step)}. Current question: ${JSON.stringify(prompt)}. Continue the live conversation naturally; do not repeat this update or speak only because of it.`}]}});}
 stop(){this.alive=false;this.assist?.stop();this.assist=null;clearTimeout(this.timer);clearTimeout(this.disconnectTimer);clearInterval(this.meterTimer);this.listening=false;this.meterSource?.disconnect();this.meterAnalyser?.disconnect();void this.meterContext?.close().catch(()=>{});this.meterContext=null;this.channel?.close();this.channel=null;this.peer?.close();this.peer=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.audio){this.audio.pause();this.audio.srcObject=null;this.audio=null;}this.events.level(0);this.events.state('off');}
}
