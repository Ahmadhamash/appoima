/** Bounded SSE reader and complete-record extractor. No partial JSON is trusted or persisted. */
export class ResponseStreamError extends Error { constructor() { super('concierge_provider_response'); } }
function skipSpace(s: string, start: number): number { while (/\s/.test(s[start] ?? '') && start < s.length) start++; return start; }
function completeValue(s: string, start: number): number | null {
  start=skipSpace(s,start); const first=s[start]; if(first===undefined)return null;
  let quoted=false,escaped=false; const stack:string[]=[];
  for(let i=start;i<s.length;i++){
    const c=s[i]!;
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"'){quoted=false;if(first==='"'&&!stack.length)return i+1;}continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='{'||c==='['){stack.push(c);continue;}
    if(c==='}'||c===']'){
      if(!stack.length)return i;
      const open=stack.pop();if(c==='}'&&open!=='{'||c===']'&&open!=='[')throw new ResponseStreamError();
      if(!stack.length)return i+1;continue;
    }
    if(!stack.length&&(c===','||/\s/.test(c)))return i;
  }
  return null;
}
function memberStart(s:string,start:number,wanted:string):number|null {
  let at=skipSpace(s,start);if(s[at]!=='{')return null;at++;
  while(at<s.length){at=skipSpace(s,at);if(s[at]!== '"')return null;const end=completeValue(s,at);if(end===null)return null;
    let key:unknown;try{key=JSON.parse(s.slice(at,end));}catch{throw new ResponseStreamError();}
    at=skipSpace(s,end);if(s[at]!==':')return null;at=skipSpace(s,at+1);if(key===wanted)return at;
    const valueEnd=completeValue(s,at);if(valueEnd===null)return null;at=skipSpace(s,valueEnd);if(s[at]!==',')return null;at++;
  }return null;
}
/** Locates ONLY root.patch.services, ignoring lookalike text in strings or nested objects. */
export function completedServiceRecords(jsonPrefix:string):unknown[] {
  const patch=memberStart(jsonPrefix,0,'patch');if(patch===null)return [];
  const services=memberStart(jsonPrefix,patch,'services');if(services===null||jsonPrefix[services]!=='[')return [];
  const result:unknown[]=[];let at=services+1;
  while(at<jsonPrefix.length){at=skipSpace(jsonPrefix,at);if(jsonPrefix[at]===']')break;const end=completeValue(jsonPrefix,at);if(end===null)break;
    try{result.push(JSON.parse(jsonPrefix.slice(at,end)));}catch{throw new ResponseStreamError();}
    if(result.length>20)throw new ResponseStreamError();at=skipSpace(jsonPrefix,end);if(jsonPrefix[at]!==',')break;at++;
  }return result;
}
export async function consumeResponseStream(response:Response,onText:(text:string)=>void,signal?:AbortSignal):Promise<Record<string,unknown>> {
  if(!response.body)throw new ResponseStreamError();
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',bytes=0,completed:Record<string,unknown>|null=null;
  function event(block:string){
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return;let payload:Record<string,unknown>;
    try{payload=JSON.parse(data);}catch{throw new ResponseStreamError();}
    if(payload.type==='response.output_text.delta'&&typeof payload.delta==='string')onText(payload.delta);
    if(payload.type==='response.completed'&&payload.response&&typeof payload.response==='object')completed=payload.response as Record<string,unknown>;
    if(['response.failed','response.incomplete','error','response.refusal.done'].includes(String(payload.type)))throw new ResponseStreamError();
  }
  const abort=()=>{void reader.cancel(signal?.reason).catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>750000)throw new ResponseStreamError();
      buffer+=decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let boundary:number;
      while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
    }
    buffer+=decoder.decode();if(buffer.trim())event(buffer.replace(/\r\n/g,'\n'));
    signal?.throwIfAborted();if(!completed)throw new ResponseStreamError();return completed;
  }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
