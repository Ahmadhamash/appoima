import type { Language } from './contract';

/** Streaming Soniox transcripts for clinic setup, with the original manual-finalize
 * mode retained for the in-app assistant. Audio is never stored in the browser. */
export class SonioxAssist {
 private socket:WebSocket|null=null;
 private recorder:MediaRecorder|null=null;
 private alive=true;private ready=false;private text='';private confidence:number[]=[];
 private timer=0;private pending:((text:string|null)=>void)|null=null;private language:Language='ar';
 private onEndpoint:((text:string)=>void)|null=null;private onPartial:((text:string)=>void)|null=null;
 async start(requestKey:()=>Promise<{enabled:boolean;apiKey?:string}>,stream:MediaStream,language:Language,onEndpoint?:((text:string)=>void),onPartial?:((text:string)=>void)){
  try{
   this.language=language;this.onEndpoint=onEndpoint??null;this.onPartial=onPartial??null;
   if(!window.MediaRecorder||!window.WebSocket)return;
   const credentials=await requestKey();
   if(!this.alive||!credentials.enabled||!credentials.apiKey)return;
   const socket=new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');this.socket=socket;
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('timeout')),3000);socket.onopen=()=>{clearTimeout(timeout);resolve();};socket.onerror=()=>{clearTimeout(timeout);reject(new Error('socket'));};socket.onclose=()=>{clearTimeout(timeout);reject(new Error('closed'));};});
   if(!this.alive){socket.close();return;}
   socket.send(JSON.stringify({api_key:credentials.apiKey,model:'stt-rt-v5',audio_format:'auto',language_hints:language==='ar'?['ar','en']:['en','ar'],enable_endpoint_detection:!!this.onEndpoint,...(this.onEndpoint?{endpoint_latency_adjustment_level:1,endpoint_sensitivity:0,max_endpoint_delay_ms:1800}:{}),context:{general:[{key:'domain',value:'Beauty center and salon appointment setup in Jordan'}],text:'Jordanian Arabic; preserve proper names, no translation.',terms:['بيوتي سنتر','مركز تجميل','أخصائية','مناكير','بديكير','سشوار','ليزر','فروع']}}));
   socket.onmessage=e=>{if(!this.alive||typeof e.data!=='string'||e.data.length>100000)return;try{const message=JSON.parse(e.data);if(message.error_code||message.finished){this.stop();return;}let provisional='';for(const token of message.tokens??[]){if(typeof token.text!=='string')continue;if(!token.is_final){if(!/^<[^>]+>$/.test(token.text))provisional+=token.text;continue;}if(token.text==='<end>'||token.text==='<fin>'){const value=this.text.trim(),confidence=this.confidence.length?this.confidence.reduce((sum,n)=>sum+n,0)/this.confidence.length:0;this.text='';this.confidence=[];this.onPartial?.('');if(token.text==='<end>'){if(value&&value.length<=6000)this.onEndpoint?.(value);}else{const done=this.pending;this.pending=null;clearTimeout(this.timer);done?.(value&&confidence>=.7?value:null);}continue;}if(!/^<[^>]+>$/.test(token.text)){this.text+=token.text;if(/[\p{L}\p{N}]/u.test(token.text))this.confidence.push(typeof token.confidence==='number'?token.confidence:0);if(this.text.length>6000){this.stop();return;}}}if(this.onEndpoint)this.onPartial?.((this.text+provisional).slice(0,6000));}catch{this.stop();}};
   socket.onerror=()=>this.stop();socket.onclose=()=>this.stop();
   const mime=['audio/webm;codecs=opus','audio/mp4'].find(value=>MediaRecorder.isTypeSupported(value));
   if(!mime){this.stop();return;}
   const recorder=new MediaRecorder(stream,{mimeType:mime});this.recorder=recorder;
   recorder.ondataavailable=e=>{if(this.alive&&socket.readyState===WebSocket.OPEN&&e.data.size){if(socket.bufferedAmount>256000){this.stop();return;}socket.send(e.data);}};
   recorder.onerror=()=>this.stop();recorder.start(100);this.ready=true;
  }catch{this.stop();}
 }
 get isReady(){return this.ready;}
 speechStarted(){if(!this.ready||(!this.onEndpoint&&this.pending))this.stop();}
 async refine(original:string):Promise<string>{
  if(!this.ready||!this.recorder||this.recorder.state!=='recording'||this.socket?.readyState!==WebSocket.OPEN)return original;
  if(this.pending){this.stop();return original;}
  return new Promise(resolve=>{
   this.pending=text=>resolve(text&&!(this.language==='ar'&&/[\u0600-\u06ff]/u.test(original)&&!/[\u0600-\u06ff]/u.test(text))?text:original);
   this.timer=window.setTimeout(()=>this.stop(),2500);
   // Flush the last encoded audio bytes before the finalization control message.
   this.recorder!.addEventListener('dataavailable',()=>{if(this.pending&&this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'finalize'}));},{once:true});
   try{this.recorder!.requestData();}catch{this.stop();}
  });
 }
 stop(){this.alive=false;this.ready=false;clearTimeout(this.timer);const pending=this.pending;this.pending=null;pending?.(null);if(this.recorder){this.recorder.ondataavailable=null;if(this.recorder.state!=='inactive')this.recorder.stop();this.recorder=null;}if(this.socket){this.socket.onclose=null;this.socket.onerror=null;this.socket.onmessage=null;this.socket.close();this.socket=null;}this.text='';this.confidence=[];}
}
