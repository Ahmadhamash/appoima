import { WorkspaceValidationError } from '@workspace/service-definition';
import { importApprovalEditsSchema } from '../domain/import-approval';
import { saveConciergeWorkspace, selectConciergeWorkspaceFact, reloadConciergeWorkspace } from '../services/concierge';
import express, { Router, type IRouter, type RequestHandler, type ErrorRequestHandler, type Request, type Response } from 'express';
import type { ProgressSink } from '../concierge/progress';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { conciergeServiceOptions, acceptServiceSuggestion, sonioxAssistKey, finishConciergeStep, backConciergeStep, selectConciergeStep } from '../services/concierge';
import { requireAuth, requirePasswordChanged } from '../middlewares/auth';
import { badRequest, forbidden, HttpError } from '../lib/errors';
import { ConciergeInputError, LIMITS } from '../domain/concierge-core';
import { ConciergeProviderError, classifyCompanyVoiceUtterance } from '../concierge/providers';
import { uploadMime, ConciergeMediaError } from '../concierge/media';
import { bootstrapConcierge, startConcierge, setConciergeName, setConciergeMode, findConciergeCompany, confirmConciergeCompany, approveConciergeImport, turnConcierge, saveConciergeDraft, previewConcierge, applyConcierge, realtimeOffer, speechConcierge, ensureManager } from '../services/concierge';
const router:IRouter=Router();
async function gatheringResponse(req:Request,res:Response,operation:(progress?:ProgressSink)=>Promise<unknown>){
 if(!req.get('Accept')?.includes('text/event-stream')){res.json(await operation());return;}
 res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('X-Accel-Buffering','no');res.setHeader('X-Content-Type-Options','nosniff');res.flushHeaders();
 const emit=(event:string,data:unknown)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
 const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keep-alive\n\n');},15000);
 try{const session=await operation(progress=>emit('gathering.progress',progress));emit('gathering.progress',{phase:'complete',percent:100});emit('session.committed',session);}
 catch(error){const code=error instanceof HttpError||error instanceof ConciergeInputError||error instanceof ConciergeProviderError?error.code:'concierge_operation_failed';emit('error',{error:code});}
 finally{clearInterval(heartbeat);res.end();}
}
const wrap=(handler:RequestHandler):RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next);}catch(err){
  if(err instanceof WorkspaceValidationError)return next(badRequest('workspace_invalid'));
  if(err instanceof ConciergeInputError)return next(badRequest(err.code));
  if(err instanceof ConciergeMediaError)return next(badRequest(err.code));
  if(err instanceof ConciergeProviderError)return next(new HttpError(503,err.code));
  const e=err as {code?:string;cause?:{code?:string}};if(['42P01','42703'].includes(e?.code??'')||['42P01','42703'].includes(e?.cause?.code??''))return next(new HttpError(503,'concierge_migration_required'));
  // Never pass arbitrary database errors (which can contain SQL parameters) to the global logger.
  if(err instanceof HttpError||err instanceof z.ZodError)return next(err);
  if(e?.code==='23505'||e?.cause?.code==='23505')return next(new HttpError(409,'concierge_duplicate'));
  next(new HttpError(500,'concierge_operation_failed'));
}};
router.use('/concierge',requireAuth,requirePasswordChanged,wrap((req,res,next)=>{
  ensureManager(req.user!);res.setHeader('Cache-Control','no-store, private');res.setHeader('Pragma','no-cache');
  // A cross-origin page cannot set this custom header without a successful CORS preflight.
  // No CORS grant is enabled for these routes. Session cookies are same-origin and SameSite=Lax.
  if(req.method!=='GET'&&req.get('X-JorMall-Intent')!=='concierge')throw forbidden('concierge_origin');
  if(req.method!=='GET'&&req.get('sec-fetch-site')==='cross-site')throw forbidden('concierge_origin');
  next();
}));
const revision=z.number().int().nonnegative(),language=z.enum(['ar','en']),requestId=z.string().uuid();
router.post('/concierge/step-confirm',wrap(async(req,res)=>{const b=z.object({revision}).strict().parse(req.body);res.json(await finishConciergeStep(req.user!,b.revision));}));
router.post('/concierge/step-back',wrap(async(req,res)=>{const b=z.object({revision}).strict().parse(req.body);res.json(await backConciergeStep(req.user!,b.revision));}));
router.post('/concierge/step-select',wrap(async(req,res)=>{const b=z.object({revision,step:z.enum(['company','branches','services','rooms','staff','review'])}).strict().parse(req.body);res.json(await selectConciergeStep(req.user!,b.revision,b.step));}));
router.post('/concierge/stt-assist-key',rateLimit({windowMs:60000,limit:3,keyGenerator:req=>String(req.user!.id),standardHeaders:true,legacyHeaders:false,message:{error:'concierge_provider_limit'}}),wrap(async(req,res)=>{res.json(await sonioxAssistKey(req.user!));}));
router.get('/concierge/bootstrap',wrap(async(req,res)=>{res.json(await bootstrapConcierge(req.user!));}));
router.post('/concierge/start',wrap(async(req,res)=>{const body=z.object({language,reopen:z.boolean().default(false)}).strict().parse(req.body);res.json(await startConcierge(req.user!,body.language,body.reopen));}));
router.post('/concierge/name',wrap(async(req,res)=>{const b=z.object({name:z.string().trim().min(1).max(80).refine(v=>!/[\u0000-\u001f]/u.test(v)),revision,language}).strict().parse(req.body);res.json(await setConciergeName(req.user!,b.name,b.revision,b.language));}));
router.post('/concierge/mode',wrap(async(req,res)=>{const b=z.object({mode:z.enum(['manual','voice','text']),revision,consent:z.boolean()}).strict().parse(req.body);res.json(await setConciergeMode(req.user!,b.mode,b.revision,b.consent));}));
router.put('/concierge/workspace-draft',wrap(async(req,res)=>{const b=z.object({revision,profile:z.unknown()}).strict().parse(req.body);res.json(await saveConciergeWorkspace(req.user!,b.revision,b.profile));}));
router.post('/concierge/workspace-fact',wrap(async(req,res)=>{const b=z.object({revision,id:z.string().min(1).max(40),accept:z.boolean()}).strict().parse(req.body);res.json(await selectConciergeWorkspaceFact(req.user!,b.revision,b.id,b.accept));}));
router.post('/concierge/workspace-reload',wrap(async(req,res)=>{const b=z.object({revision}).strict().parse(req.body);res.json(await reloadConciergeWorkspace(req.user!,b.revision));}));
const linksLimit=rateLimit({windowMs:60000,limit:6,keyGenerator:req=>String(req.user!.id),standardHeaders:true,legacyHeaders:false,message:{error:'concierge_provider_limit'}});
router.post('/concierge/company-voice-intent',rateLimit({windowMs:60000,limit:20,keyGenerator:req=>String(req.user!.id),standardHeaders:true,legacyHeaders:false,message:{error:'concierge_provider_limit'}}),wrap(async(req,res)=>{const b=z.object({utterance:z.string().trim().min(1).max(6000)}).strict().parse(req.body);res.json(await classifyCompanyVoiceUtterance(b.utterance));}));
router.post('/concierge/company-lookup',wrap(async(req,res)=>{const b=z.object({revision,query:z.string().trim().min(2).max(120).refine(v=>!/[\u0000-\u001f]/u.test(v))}).strict().parse(req.body);await gatheringResponse(req,res,progress=>findConciergeCompany(req.user!,b.revision,b.query,[],progress));}));
router.post('/concierge/import-links',linksLimit,wrap(async(req,res)=>{
 const publicUrl=z.string().trim().max(500).url().refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443');}catch{return false;}});
 const b=z.object({revision,urls:z.array(publicUrl).min(1).max(5)}).strict().parse(req.body);
 await gatheringResponse(req,res,progress=>findConciergeCompany(req.user!,b.revision,`Find the medical clinic identified by these user-provided public website/social links. Do not substitute a different business. Verify public sources: ${b.urls.join('\n')}`,b.urls,progress));
}));
router.post('/concierge/company-confirm',wrap(async(req,res)=>{const b=z.object({revision,answer:z.enum(['yes','retry','skip']),selectedIndex:z.number().int().min(0).max(2).optional(),colors:z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(3).optional()}).strict().parse(req.body);await gatheringResponse(req,res,progress=>confirmConciergeCompany(req.user!,b.revision,b.answer,b.colors,b.selectedIndex,progress));}));
router.post('/concierge/import-approve',wrap(async(req,res)=>{const unique=<T>(values:T[])=>new Set(values).size===values.length;const b=z.object({revision,factIds:z.array(z.string().min(1).max(40)).max(20).refine(unique),serviceIndexes:z.array(z.number().int().min(0).max(49)).max(50).refine(unique),branchIndexes:z.array(z.number().int().min(0).max(49)).max(50).refine(unique),logoColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),edits:importApprovalEditsSchema.optional()}).strict().parse(req.body);res.json(await approveConciergeImport(req.user!,b.revision,b.factIds,b.serviceIndexes,b.branchIndexes,b.logoColor,b.edits));}));
// Partial events are display-only. Only session.committed represents durable state.
router.get('/concierge/service-options',wrap(async(req,res)=>{res.json(await conciergeServiceOptions(req.user!));}));
router.post('/concierge/service-suggestion',wrap(async(req,res)=>{
  const b=z.object({revision,key:z.string().min(1).max(80)}).strict().parse(req.body);
  res.json(await acceptServiceSuggestion(req.user!,b.revision,b.key));
}));
router.post('/concierge/turn-stream',wrap(async(req,res)=>{
  const b=z.object({revision,requestId,text:z.string().trim().min(1).max(LIMITS.messageChars)}).strict().parse(req.body);
  const controller=new AbortController();let heartbeat:ReturnType<typeof setInterval>|undefined;
  res.on('close',()=>controller.abort());
  const emit=(event:string,data:unknown)=>{if(!res.destroyed&&!controller.signal.aborted)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
  try{
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('X-Accel-Buffering','no');
    res.setHeader('X-Content-Type-Options','nosniff');res.flushHeaders();
    heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keep-alive\n\n');},15000);
    const session=await turnConcierge(req.user!,b,undefined,{signal:controller.signal,onService:service=>emit('service.preview',{service,revision:b.revision})});
    emit('session.committed',session);res.end();
  }catch(error){
    const e=error as {code?:string;status?:number;statusCode?:number;message?:string;cause?:{code?:string}};
    const code=error instanceof WorkspaceValidationError?'workspace_invalid':error instanceof ConciergeInputError||error instanceof ConciergeProviderError?error.code:
      error instanceof HttpError?error.code:
      ['42P01','42703'].includes(e?.code??e?.cause?.code??'')?'concierge_migration_required':'concierge_operation_failed';
    emit('error',{error:code});res.end();
  }finally{if(heartbeat)clearInterval(heartbeat);controller.abort();}
}));
router.post('/concierge/turn',wrap(async(req,res)=>{const b=z.object({revision,requestId,text:z.string().trim().min(1).max(LIMITS.messageChars)}).strict().parse(req.body);res.json(await turnConcierge(req.user!,b));}));
router.post('/concierge/upload',express.raw({type:'application/octet-stream',limit:LIMITS.uploadBytes}),wrap(async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||req.body.length===0||req.body.length>LIMITS.uploadBytes)throw badRequest('concierge_file_type');
  const rev=z.coerce.number().int().nonnegative().parse(req.get('X-Draft-Revision')),id=requestId.parse(req.get('X-Request-Id'));
  let name:string;try{name=decodeURIComponent(req.get('X-File-Name')??'');}catch{throw badRequest('concierge_file_type');}
  if(!name||name.length>180||/[\\/\u0000-\u001f]/u.test(name))throw badRequest('concierge_file_type');
  const mime=uploadMime(name,req.body);
  res.json(await turnConcierge(req.user!,{revision:rev,requestId:id,text:'Read the attached business setup file. Extract only supported facts actually present, including the clinic name as a workspaceFact with exact evidence when provided. Unknown service assignments remain null.'},{name,mime,bytes:req.body}));
}));
router.put('/concierge/draft',wrap(async(req,res)=>{const b=z.object({revision,draft:z.unknown()}).strict().parse(req.body);res.json(await saveConciergeDraft(req.user!,b.revision,b.draft));}));
router.get('/concierge/review',wrap(async(req,res)=>{res.json(await previewConcierge(req.user!));}));
router.post('/concierge/apply',wrap(async(req,res)=>{
  const b=z.object({revision,confirmed:z.literal(true),staff:z.array(z.object({key:z.string().min(1).max(40),initialPassword:z.string().min(10).max(200),permissions:z.array(z.string()).max(14)}).strict()).max(50)}).strict().parse(req.body);
  res.json(await applyConcierge(req.user!,b.revision,b.staff));
}));
router.post('/concierge/realtime-offer',express.text({type:'application/sdp',limit:'30kb'}),wrap(async(req,res)=>{if(typeof req.body!=='string')throw badRequest('concierge_invalid_data');const answer=await realtimeOffer(req.user!,req.body);res.type('application/sdp').send(answer);}));
router.post('/concierge/speech',wrap(async(req,res)=>{
  const b=z.object({utteranceId:z.string().min(1).max(80)}).strict().parse(req.body);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
  res.on('close',()=>controller.abort());let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const upstream=await speechConcierge(req.user!,b.utteranceId,controller.signal);
    const mime=upstream.headers.get('content-type')??'';if(!mime.includes('audio/')){await upstream.body?.cancel();throw new ConciergeProviderError('concierge_provider_response');}
    res.setHeader('Content-Type','audio/mpeg');res.setHeader('X-Content-Type-Options','nosniff');
    reader=upstream.body!.getReader();let total=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>8*1024*1024)throw new ConciergeProviderError('concierge_provider_response');
      if(!res.write(Buffer.from(chunk.value)))await new Promise<void>((resolve,reject)=>{const clear=()=>{res.off('drain',ok);res.off('close',closed);};const ok=()=>{clear();resolve();};const closed=()=>{clear();reject(new Error('closed'));};res.once('drain',ok);res.once('close',closed);});
    }res.end();
  }catch(err){if(res.headersSent){res.destroy();return;}throw err;}
  finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});reader?.releaseLock();}
}));
const uploadError:ErrorRequestHandler=(err,_req,_res,next)=>{if(err?.type==='entity.too.large')return next(new HttpError(413,'concierge_upload_too_large'));next(err);};
router.use('/concierge',uploadError);
export default router;
