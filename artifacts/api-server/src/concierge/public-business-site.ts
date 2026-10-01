import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

export function publicIPv4(address:string){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a!>=224||a===169&&b===254||a===172&&b!>=16&&b!<=31||a===192&&(b===168||b===0||b===2)||a===100&&b!>=64&&b!<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
/** DNS-pinned public HTTPS fetch: no cookies/auth, private IPs, arbitrary ports or unbounded bodies. */
export async function readPublicSite(raw:string,maxBytes=700000,redirects=0):Promise<{url:string;bytes:Buffer;mime:string}>{
 const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname)||!url.hostname.includes('.'))throw new Error('public_https_required');
 const addresses=await Promise.race([lookup(url.hostname,{all:true,family:4}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('dns_timeout')),3000);timer.unref();})]);
 if(!addresses.length||addresses.some(value=>!publicIPv4(value.address)))throw new Error('private_address');
 const address=addresses[0]!;
 const result=await new Promise<{status:number;location?:string;bytes:Buffer;mime:string}>((resolve,reject)=>{
  const req=request(url,{headers:{Accept:'text/html,image/*','Accept-Encoding':'identity','User-Agent':'JorMall-Business-Preview/1.0'},lookup:((_hostname:unknown,options:{all?:boolean},callback:Function)=>options.all?callback(null,[address]):callback(null,address.address,4)) as never},res=>{
   if(res.statusCode&&res.statusCode>=300&&res.statusCode<400){res.resume();resolve({status:res.statusCode,location:res.headers.location,bytes:Buffer.alloc(0),mime:''});return;}
   if(res.statusCode!==200||Number(res.headers['content-length']??0)>maxBytes){res.destroy();reject(new Error('unavailable'));return;}
   const parts:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('too_large'));return;}parts.push(chunk);});res.on('end',()=>resolve({status:200,bytes:Buffer.concat(parts),mime:String(res.headers['content-type']??'')}));res.on('error',reject);
  });const deadline=setTimeout(()=>req.destroy(new Error('timeout')),5000);req.on('close',()=>clearTimeout(deadline));req.on('error',reject);req.end();
 });
 if(result.location){if(redirects>=2)throw new Error('redirect_limit');return readPublicSite(new URL(result.location,url).href,maxBytes,redirects+1);}
 return {url:url.href,bytes:result.bytes,mime:result.mime};
}
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ');
const attr=(tag:string,key:string)=>decode(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`,'i').exec(tag)?.[1]??'');
export function siteIdentity(html:string,base:string){
 const text=decode(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,22000);
 // A parked or reset website is not evidence of a business identity or its colors.
 if(/Welcome to WordPress|This is your first post|domain (?:is )?for sale/i.test(text))return {text:'',logo:null,colors:[] as string[],pages:[] as string[]};
 let logo:string|null=null;
 for(const tag of html.match(/<img\b[^>]*>/gi)??[]){if(/logo/i.test(attr(tag,'alt')+' '+attr(tag,'class')+' '+attr(tag,'src'))){logo=attr(tag,'src')||attr(tag,'data-src');if(logo)break;}}
 for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const visit=(value:unknown,depth=0)=>{if(!value||depth>6)return;if(Array.isArray(value)){value.forEach(item=>visit(item,depth+1));return;}if(typeof value!=='object')return;const row=value as Record<string,unknown>;const found=row.logo;if(typeof found==='string')logo=found;else if(found&&typeof found==='object'&&typeof (found as {url?:unknown}).url==='string')logo=(found as {url:string}).url;if(row['@graph'])visit(row['@graph'],depth+1);};visit(JSON.parse(script[1]!));}catch{/* Ignore malformed page metadata. */}
 }
 const safe=(raw:string)=>{try{const url=new URL(raw,base);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
 // Website theme colors, including Elementor defaults, are not evidence of the
 // clinic's chosen brand color. The manager chooses a color in the editor.
 const colors:string[]=[];
 const pages:string[]=[];for(const tag of html.match(/<a\b[^>]*>/gi)??[]){const href=attr(tag,'href');if(!/service|treatment|branch|contact|about|خدم|فروع|اتصل|عنا|%d8/i.test(href))continue;const url=safe(href);if(url&&new URL(url).origin===new URL(base).origin&&!pages.includes(url)){pages.push(url);if(pages.length>=3)break;}}
 return {text,logo:logo?safe(logo):null,colors:colors.slice(0,3),pages};
}
export function rasterDataUrl(bytes:Buffer){
 let mime='';if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';else if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))mime='image/gif';
 return mime&&bytes.length<=180000?`data:${mime};base64,${bytes.toString('base64')}`:null;
}
