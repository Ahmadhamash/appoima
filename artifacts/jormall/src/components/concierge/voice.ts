import { ConciergeAPI } from './api';

/** Buffers final tokens only; partial hypotheses replace, never append to history. */
export class TranscriptAccumulator {
 private final='';
 reset(){this.final='';}
 consume(tokens:{text:string;is_final?:boolean}[]):{partial:string;utterances:string[]}{
  let partial='';const utterances:string[]=[];
  for(const token of tokens){if(typeof token.text!=='string')continue;
   if(token.text==='<end>'&&token.is_final){const text=this.final.trim();if(text)utterances.push(text);this.final='';partial='';}
   else if(!/^<[^>]+>$/.test(token.text)){if(token.is_final)this.final+=token.text;else partial+=token.text;}
  }if(this.final.length+partial.length>6000)throw new Error('message_too_long');
  return {partial:this.final+partial,utterances};
 }
}

function waitEvent(target:EventTarget,event:string,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
  const clean=()=>{target.removeEventListener(event,ok);target.removeEventListener('error',fail);signal.removeEventListener('abort',abort);};
  const ok=()=>{clean();resolve();};
  const fail=()=>{clean();reject(new Error('media_playback_failed'));};
  const abort=()=>{clean();reject(new DOMException('Aborted','AbortError'));};
  target.addEventListener(event,ok,{once:true});target.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});
 });
}
/** Authenticated OpenAI server TTS for fixed prompts; live conversation uses WebRTC. */
export class SpeechPlayer {
 private context:AudioContext|null=null;private cancel:AbortController|null=null;private audio:HTMLAudioElement|null=null;private url:string|null=null;private meter=0;private timeout=0;
 constructor(private api:ConciergeAPI,private level:(n:number)=>void){}
 async unlock(){if(!this.context)this.context=new AudioContext();if(this.context.state==='suspended')await this.context.resume();}
 stop(){this.cancel?.abort();this.cancel=null;clearTimeout(this.timeout);cancelAnimationFrame(this.meter);if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.audio=null;}if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.level(0);}
 async play(id:string,onStart:()=>void):Promise<void>{
  this.stop();const controller=new AbortController();this.cancel=controller;const signal=AbortSignal.any([controller.signal,this.api.signal]);this.timeout=window.setTimeout(()=>controller.abort(),120000);
  let source:MediaElementAudioSourceNode|undefined,analyser:AnalyserNode|undefined;
  try{
   const response=await this.api.fetch('/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({utteranceId:id})},signal);
   if(signal.aborted)return;const audio=new Audio();audio.preload='auto';this.audio=audio;
   if(this.context?.state==='running'){source=this.context.createMediaElementSource(audio);analyser=this.context.createAnalyser();analyser.fftSize=512;source.connect(analyser);analyser.connect(this.context.destination);const data=new Uint8Array(analyser.fftSize);const tick=()=>{if(signal.aborted)return;analyser!.getByteTimeDomainData(data);let sum=0;for(const n of data)sum+=((n-128)/128)**2;this.level(Math.min(1,Math.sqrt(sum/data.length)*4));this.meter=requestAnimationFrame(tick);};tick();}
   const started=()=>onStart();audio.addEventListener('playing',started,{once:true});
   if(window.MediaSource?.isTypeSupported('audio/mpeg')&&response.body){
    const media=new MediaSource();this.url=URL.createObjectURL(media);audio.src=this.url;
    await waitEvent(media,'sourceopen',signal);const buffer=media.addSourceBuffer('audio/mpeg'),reader=response.body.getReader();let playing:Promise<void>|undefined;let total=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;if(signal.aborted)throw new DOMException('Aborted','AbortError');total+=value.byteLength;if(total>8*1024*1024)throw new Error('audio_large');const updated=waitEvent(buffer,'updateend',signal);buffer.appendBuffer(value);await updated;
      if(!playing){playing=audio.play();playing.catch(()=>{});await playing;}
     }if(!total)throw new Error('empty_audio');if(media.readyState==='open')media.endOfStream();
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   }else{const blob=await response.blob();if(blob.size>8*1024*1024||!blob.size)throw new Error('audio_large');this.url=URL.createObjectURL(blob);audio.src=this.url;await audio.play();}
   if(!audio.ended)await waitEvent(audio,'ended',signal);
  }finally{source?.disconnect();analyser?.disconnect();if(this.cancel===controller)this.stop();}
 }
 dispose(){this.stop();void this.context?.close().catch(()=>{});this.context=null;}
}
