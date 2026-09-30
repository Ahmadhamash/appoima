import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS } from '../domain/concierge-core';

export const UPLOAD_FORMATS = ['pdf','txt','csv','json','png','jpg','jpeg','webp','mp3','wav','m4a','ogg','flac','aac','webm','mp4','mov','mkv'] as const;
export class ConciergeMediaError extends Error { constructor(public readonly code:string){super(code);} }
export type UploadMime = 'application/pdf'|'text/plain'|'image/png'|'image/jpeg'|'image/webp'|'audio/media'|'video/media';
/** Check the content as well as the extension; binary media never goes through the text decoder. */
export function uploadMime(name:string, bytes:Uint8Array):UploadMime {
 const ext=name.split('.').at(-1)?.toLowerCase(),b=Buffer.from(bytes);
 if(!ext||!UPLOAD_FORMATS.includes(ext as typeof UPLOAD_FORMATS[number])||!b.length)throw new ConciergeMediaError('concierge_file_type');
 const starts=(value:string,offset=0)=>b.subarray(offset,offset+value.length).toString('ascii')===value;
 if(ext==='pdf'&&starts('%PDF-'))return 'application/pdf';
 if(['txt','csv','json'].includes(ext)){
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(b);if(text.length>LIMITS.textFileChars||/[\u0000-\u0008]/u.test(text))throw new Error();return 'text/plain';}catch{throw new ConciergeMediaError('concierge_text_file');}
 }
 if(ext==='png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(['jpg','jpeg'].includes(ext)&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(ext==='webp'&&starts('RIFF')&&starts('WEBP',8))return 'image/webp';
 const iso=starts('ftyp',4),ebml=b.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 if((['mp4','mov'].includes(ext)&&iso)||(['webm','mkv'].includes(ext)&&ebml))return 'video/media';
 if((ext==='m4a'&&iso)||(ext==='wav'&&starts('RIFF')&&starts('WAVE',8))||(ext==='ogg'&&starts('OggS'))||(ext==='flac'&&starts('fLaC'))||(ext==='mp3'&&(starts('ID3')||(b[0]===255&&((b[1]??0)&224)===224)))||(ext==='aac'&&b[0]===255&&((b[1]??0)&246)===240))return 'audio/media';
 throw new ConciergeMediaError('concierge_file_type');
}

const execute=promisify(execFile);
export type PreparedMedia={audio:Uint8Array|null;frames:{bytes:Uint8Array;seconds:number}[];duration:number};
/** Read the whole audio track and sample the video timeline. All temporary files are removed. */
export async function prepareMedia(bytes:Uint8Array,signal:AbortSignal):Promise<PreparedMedia>{
 const directory=await mkdtemp(join(tmpdir(),'jormall-setup-media-'));
 const run=async(command:string,args:string[],timeout=60000)=>{
  try{return await execute(command,args,{timeout,signal,maxBuffer:512000,windowsHide:true});}
  catch(error){if(signal.aborted)throw new ConciergeMediaError('concierge_timeout');if((error as NodeJS.ErrnoException).code==='ENOENT')throw new ConciergeMediaError('concierge_media_unavailable');throw new ConciergeMediaError('concierge_media_unreadable');}
 };
 try{
  const input=join(directory,'input');await writeFile(input,bytes);
  const probe=await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,duration','-of','json',input],20000);
  let duration:number,audio=false,video=false;
  try{const data=JSON.parse(probe.stdout);duration=Number(data.format?.duration??Math.max(...data.streams.map((stream:{duration?:string})=>Number(stream.duration)||0)));audio=data.streams.some((stream:{codec_type:string})=>stream.codec_type==='audio');video=data.streams.some((stream:{codec_type:string})=>stream.codec_type==='video');}catch{throw new ConciergeMediaError('concierge_media_unreadable');}
  if(!Number.isFinite(duration)||duration<=0||(!audio&&!video))throw new ConciergeMediaError('concierge_media_unreadable');
  if(duration>600)throw new ConciergeMediaError('concierge_media_too_long');
  const result:PreparedMedia={audio:null,frames:[],duration};
  if(audio){const output=join(directory,'audio.mp3');await run('ffmpeg',['-v','error','-nostdin','-i',input,'-map','0:a:0','-vn','-ac','1','-ar','16000','-b:a','32k',output]);result.audio=await readFile(output);if(result.audio.byteLength>25*1024*1024)throw new ConciergeMediaError('concierge_upload_too_large');}
  if(video){const count=Math.min(12,Math.max(1,Math.ceil(duration/5)));for(let index=0;index<count;index++){
   const seconds=duration*(index+0.5)/count,output=join(directory,`frame-${index}.jpg`);
   await run('ffmpeg',['-v','error','-nostdin','-ss',String(seconds),'-i',input,'-map','0:v:0','-frames:v','1','-vf','scale=min(1024\\,iw):-2',output],20000);
   result.frames.push({bytes:await readFile(output),seconds});
  }}
  return result;
 }finally{await rm(directory,{recursive:true,force:true});}
}
