import type { Session, ServiceDraft } from './contract';
export type GatheringProgress={phase:'searching'|'reading'|'collecting'|'extracting'|'saving'|'complete';percent:number;url?:string;completed?:number;total?:number};
export class ConciergeHTTPError extends Error {constructor(readonly code:string,readonly status:number){super(code);}}
export class ConciergeAPI {
 constructor(readonly signal:AbortSignal){}
 async request<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T>{
  const response=await this.fetch(path,{method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return await response.json() as T;
 }
 async gathering(path:string,body:unknown,onProgress:(progress:GatheringProgress)=>void):Promise<Session>{
  const response=await this.fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify(body)});
  if(!response.headers.get('content-type')?.includes('text/event-stream'))return response.json() as Promise<Session>;
  if(!response.body)throw new ConciergeHTTPError('concierge_stream_interrupted',503);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0,session:Session|null=null;
  const frame=(value:string)=>{let event='',data='';for(const line of value.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data+=line.slice(5).trimStart();}if(!data)return;const payload=JSON.parse(data);
   if(event==='error')throw new ConciergeHTTPError(payload.error??'concierge_operation_failed',503);
   if(event==='gathering.progress'&&['searching','reading','collecting','extracting','saving','complete'].includes(payload.phase)&&Number.isFinite(payload.percent))onProgress({...payload,percent:Math.max(0,Math.min(100,Math.round(payload.percent)))});
   if(event==='session.committed')session=payload as Session;
  };
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>1500000)throw new ConciergeHTTPError('concierge_provider_response',503);buffer+=decoder.decode(chunk.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let index;while((index=buffer.indexOf('\n\n'))!==-1){frame(buffer.slice(0,index));buffer=buffer.slice(index+2);}if(session)return session;}throw new ConciergeHTTPError('concierge_stream_interrupted',503);}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 async fetch(path:string,init:RequestInit={},signal=this.signal):Promise<Response>{
  let r:Response;
  try {r=await fetch(`/api/concierge${path}`,{...init,headers:{...init.headers,'X-JorMall-Intent':'concierge'},credentials:'same-origin',cache:'no-store',signal});}
  catch(e){if(signal.aborted)throw e;throw new ConciergeHTTPError('offline',0);}
  if(!r.ok){const b=await r.json().catch(()=>({}));if(r.status===401)window.dispatchEvent(new Event('jormall:session-expired'));throw new ConciergeHTTPError(typeof b.error==='string'?b.error:'error',r.status);}return r;
 }
 /** A stream is speculative until the server emits the revisioned, committed session. */
 async turnStream(body:{revision:number;requestId:string;text:string},onService:(s:ServiceDraft)=>void):Promise<Session>{
  const response=await this.fetch('/turn-stream',{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify(body)});
  if(!response.body)throw new ConciergeHTTPError('concierge_provider_response',503);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0,committed:Session|null=null;
  const frame=(text:string)=>{let event='',data='';for(const line of text.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data+=line.slice(5).trimStart();}if(!data)return;
   let value:unknown;try{value=JSON.parse(data);}catch{throw new ConciergeHTTPError('concierge_provider_response',503);}
   if(event==='error')throw new ConciergeHTTPError((value as {error?:string}).error??'concierge_operation_failed',409);
   if(event==='service.preview'){const p=value as {revision:number;service:ServiceDraft};if(p.revision===body.revision)onService(p.service);}
   if(event==='session.committed')committed=value as Session;
  };
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>1500000)throw new ConciergeHTTPError('concierge_provider_response',503);buffer+=decoder.decode(chunk.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let index;while((index=buffer.indexOf('\n\n'))!==-1){frame(buffer.slice(0,index));buffer=buffer.slice(index+2);}if(committed)return committed;}
    if(!committed)throw new ConciergeHTTPError('concierge_stream_interrupted',503);return committed;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 async upload<T>(file:File,revision:number,requestId:string):Promise<T>{
  return (await this.fetch('/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Draft-Revision':String(revision),'X-Request-Id':requestId},body:file})).json() as Promise<T>;
 }
}

/** Retry identifier; also works on HTTP development pages where randomUUID is unavailable. */
export function createRequestId():string{if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;const s=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
