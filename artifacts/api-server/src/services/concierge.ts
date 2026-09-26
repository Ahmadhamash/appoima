import {serviceExclusions,filterRemovedServices} from '../domain/service-wizard';
import { beginWorkspaceDraft, editWorkspaceDraft, acceptWorkspaceFact, parseWorkspaceProfile, WorkspaceValidationError, type WorkspaceDraft } from '@workspace/service-definition';
import { readWorkspace, applyWorkspace } from './clinic-workspace';
import { lookupLinkedClinic } from '../concierge/linked-clinic';
import { localConciergeTurn } from '../domain/local-concierge';
import { createDefinition, normalizeServiceName } from '@workspace/service-definition';
import { assertServiceOnly, publicServiceSuggestions, draftFromSuggestion, changedServiceSources, ensureWizardDefinitions, type ServiceSource, type ServiceSuggestion } from '../domain/service-wizard';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, sql, asc } from 'drizzle-orm';
import { db, managerOnboardingTable as onboarding, usersTable, clinicsTable, branchesTable, servicesTable, roomsTable, appointmentsTable, customersTable, type User, type ManagerOnboarding } from '@workspace/db';
import { hasPermission, type Permission } from '../domain/permissions';
import { emptyDraft, parseDraft, mergeDraft, draftIssues, fixedSpeech, mentionsUpload, nameLanguage, CONSENT_VERSION, LIMITS, NAVIGATION, KINDS, type Stage, type Draft, type Language, type ConversationMessage, type UploadedDocument, type ServiceDraft } from '../domain/concierge-core';
import { badRequest, forbidden, conflict, notFound, HttpError } from '../lib/errors';
import { recordAudit } from './audit';
import { applyConciergeSetup, previewConciergeSetup } from './concierge-setup';
import { callDirector, createRealtimeOffer, createSpeech, lookupCompany, type CompanyCandidate, type ModelFile } from '../concierge/providers';
import { conciergeConfig, publicCapabilities } from '../concierge/config';
import { enrichCompany, type BusinessDetails } from '../concierge/company-details';
import { createSonioxAssistKey } from '../concierge/providers';
import { importPublicDetails } from '../domain/concierge-public-import';
import { setupWorkflow, canFinishStep, type SetupStep } from '../domain/concierge-workflow';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type State = { excludedServices?:string[]; workspace?:WorkspaceDraft; serviceWizard?:boolean; entryMode?:'manual'|'voice'|'text'; serviceSources?:Record<string,ServiceSource>; serviceSuggestions?:ServiceSuggestion[]; sourceImport?:boolean; branding?:{name:string;details:BusinessDetails}; companySearchQuery?:string; companyCandidates?:CompanyCandidate[]; completedSteps?:SetupStep[]; accessFingerprint?:string; draft:Draft; messages:ConversationMessage[]; uploads:UploadedDocument[]; branchBasis:Record<string,string>; lastTurnId?:string; lastTurnHash?:string; ui?:'none'|'upload'|'review'; navigation?:string; applied?:Record<string,number[]>; companyCandidate?:CompanyCandidate|null; companyProfile?:CompanyCandidate|null; companySkipped?:boolean };
const initialState = ():State=>({draft:emptyDraft(),messages:[],uploads:[],branchBasis:{},ui:'none'});
function stateOf(row:ManagerOnboarding):State { return {...initialState(),...row.state,draft:parseDraft(row.state.draft??emptyDraft())} as State; }
export function ensureManager(actor:User) {
  if(!conciergeConfig().enabled)throw notFound();
  if(!actor.clinicId||actor.role!=='manager'||!hasPermission(actor,'settings.manage')||!actor.isActive||actor.mustChangePassword)throw forbidden();
  return actor.clinicId;
}
async function freshManager(actor:User, executor:Tx|typeof db=db):Promise<User> {
  const clinicId=ensureManager(actor);
  const [fresh]=await executor.select().from(usersTable).where(and(eq(usersTable.id,actor.id),eq(usersTable.clinicId,clinicId)));
  const [clinic]=await executor.select({status:clinicsTable.status}).from(clinicsTable).where(eq(clinicsTable.id,clinicId));
  if(!fresh||clinic?.status!=='active')throw forbidden();ensureManager(fresh);return fresh;
}
function where(actor:User) { return and(eq(onboarding.clinicId,ensureManager(actor)),eq(onboarding.userId,actor.id)); }
const authFingerprint=(actor:User)=>JSON.stringify([actor.id,actor.clinicId,actor.role,actor.permissions.slice().sort()]);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const branchFingerprint=(b:{name:string;nameLang:string;timeZone:string;openingHours:unknown})=>hash({name:b.name,nameLang:b.nameLang,timeZone:b.timeZone,openingHours:b.openingHours});
function checkAccess(row:ManagerOnboarding,actor:User){const state=stateOf(row);if(state.accessFingerprint&&state.accessFingerprint!==authFingerprint(actor))throw forbidden('concierge_access_changed');}
async function withSession<T>(actor:User, work:(tx:Tx,row:ManagerOnboarding,actor:User)=>Promise<T>,allowReset=false):Promise<T> {
  return db.transaction(async tx=>{
    // Same ordering as setup writes; no network call is performed inside this transaction.
    await tx.execute(sql`select pg_advisory_xact_lock(7140002, ${ensureManager(actor)})`);
    const fresh=await freshManager(actor,tx);
    const [row]=await tx.select().from(onboarding).where(where(fresh)).for('update');
    if(!row)throw conflict('concierge_session_required');
    if(!allowReset)checkAccess(row,fresh);
    return work(tx,row,fresh);
  });
}
function noBusy(row:ManagerOnboarding) { if(row.busyUntil&&row.busyUntil.getTime()>Date.now())throw conflict('concierge_busy'); }
function checkRevision(row:ManagerOnboarding,revision:number) { if(row.revision!==revision)throw conflict('concierge_stale'); }
const audit=(tx:Tx,actor:User,action:string,details:Record<string,unknown>={})=>recordAudit({clinicId:actor.clinicId,actorUserId:actor.id,action:`concierge.${action}`,entityType:'manager_onboarding',details},tx);
function consent(row:ManagerOnboarding) { if(row.consentVersion!==CONSENT_VERSION)throw forbidden('concierge_consent_required'); }
async function change(tx:Tx,row:ManagerOnboarding,fields:Partial<typeof onboarding.$inferInsert>) {
  const [updated]=await tx.update(onboarding).set({...fields,revision:row.revision+1,updatedAt:new Date()}).where(eq(onboarding.id,row.id)).returning();return updated!;
}
function publicSession(row:ManagerOnboarding) {
  const state=stateOf(row), latest=state.messages.filter(m=>m.role==='assistant').at(-1);
  const conversation=row.stage==='conversation';
  return {revision:row.revision,stage:row.stage,preferredName:row.preferredName,language:row.language,consented:row.consentVersion===CONSENT_VERSION,
    workspace:state.workspace??null,serviceWizard:state.serviceWizard??false,entryMode:state.entryMode??'text',serviceSources:state.serviceSources??{},serviceSuggestions:state.serviceSuggestions??[],sourceImport:state.sourceImport??false,branding:state.branding??null,draft:state.draft,uploads:state.uploads,ui:state.ui??'none',navigation:state.navigation??null,companyCandidate:state.companyCandidate??null,companyCandidates:state.companyCandidates??[],companyProfile:state.companyProfile??null,companyChecked:!!state.companyProfile,workflow:setupWorkflow(state,row.language as Language),
    message:conversation&&latest&&state.lastTurnId&&(state.serviceWizard||!publicCapabilities().llm||state.ui==='upload')?latest:conversation&&state.companyProfile?{id:latest?.id??'stage:workflow',role:'assistant',text:setupWorkflow(state,row.language as Language).prompt}:conversation&&!state.companyProfile?{id:'stage:company',role:'assistant',text:row.language==='ar'?'أهلين! شو اسم شركتك؟ بحب أتأكد منها قبل ما نبدأ.':'Hi! What is your company name? I’ll check it before we begin.'}:{id:`stage:${row.stage}`,role:'assistant',text:fixedSpeech(row.stage as Stage,row.language as Language)},
    busy:!!row.busyUntil&&row.busyUntil.getTime()>Date.now(),applied:state.applied??null};
}
export async function businessContext(actor:User) {
  const c=ensureManager(actor);const allowed=(p:Permission)=>hasPermission(actor,p);
  const branches=allowed('settings.read')?await db.select().from(branchesTable).where(eq(branchesTable.clinicId,c)).orderBy(asc(branchesTable.id)).limit(201):[];
  const services=allowed('services.read')?await db.select({id:servicesTable.id,name:servicesTable.name,nameLang:servicesTable.nameLang,branchId:servicesTable.branchId,durationMinutes:servicesTable.durationMinutes,price:servicesTable.price,currency:servicesTable.currency,requiresRoom:servicesTable.requiresRoom}).from(servicesTable).where(eq(servicesTable.clinicId,c)).orderBy(asc(servicesTable.id)).limit(201):[];
  const rooms=allowed('rooms.read')?await db.select({id:roomsTable.id,name:roomsTable.name,branchId:roomsTable.branchId,capacity:roomsTable.capacity}).from(roomsTable).where(eq(roomsTable.clinicId,c)).orderBy(asc(roomsTable.id)).limit(201):[];
  const staff=allowed('employees.read')?await db.select({id:usersTable.id,name:usersTable.name,role:usersTable.role,branchId:usersTable.branchId,isActive:usersTable.isActive}).from(usersTable).where(eq(usersTable.clinicId,c)).orderBy(asc(usersTable.id)).limit(201):[];
  const [appointmentCount]=allowed('appointments.read')?await db.select({count:sql<number>`count(*)::int`}).from(appointmentsTable).where(eq(appointmentsTable.clinicId,c)):[{count:null}];
  const [customerCount]=allowed('customers.read')?await db.select({count:sql<number>`count(*)::int`}).from(customersTable).where(eq(customersTable.clinicId,c)):[{count:null}];
  return {branches:branches.slice(0,200).map(b=>({...b,key:`branch_${b.id}`})),services:services.slice(0,200).map(s=>({...s,key:`existing_service_${s.id}`})),rooms:rooms.slice(0,200),staff:staff.slice(0,200),
    counts:{appointments:appointmentCount?.count??null,customers:customerCount?.count??null},
    truncated:{branches:branches.length>200,services:services.length>200,rooms:rooms.length>200,staff:staff.length>200},
    navigation:Object.entries(NAVIGATION).filter(([,v])=>allowed(v.permission as Permission)).map(([key])=>key)};
}
export async function bootstrapConcierge(actor:User) {
  const fresh=await freshManager(actor);
  const [row]=await db.select().from(onboarding).where(where(fresh));
  if(row)checkAccess(row,fresh);
  return {capabilities:publicCapabilities(),session:row?publicSession(row):null,consentVersion:CONSENT_VERSION};
}
export async function startConcierge(actor:User,language:Language,reopen=false) {
  await freshManager(actor);
  const [existingBranch]=await db.select({id:branchesTable.id}).from(branchesTable).where(eq(branchesTable.clinicId,actor.clinicId!)).limit(1);
  const servicesOnly=!!existingBranch;
  await db.insert(onboarding).values({clinicId:actor.clinicId!,userId:actor.id,language,preferredName:actor.name?.trim().slice(0,80)||'مدير',stage:'choice',state:{...initialState(),serviceWizard:servicesOnly,accessFingerprint:authFingerprint(actor)} as unknown as Record<string,unknown>}).onConflictDoNothing();
  const row=await withSession(actor,async(tx,row,fresh)=>{
    noBusy(row);let stage=row.stage as Stage,state=stateOf(row);const accessChanged=!!state.accessFingerprint&&state.accessFingerprint!==authFingerprint(fresh);if(accessChanged&&!reopen)throw forbidden('concierge_access_changed');let expired=row.updatedAt.getTime()<Date.now()-LIMITS.retentionDays*86400000;
    // Minimize old conversations on next use; never discard a just-saved result on a retry.
    if(expired){state={...state,messages:[],uploads:[]};}
    if(reopen&&(stage==='manual'||stage==='complete')){stage=row.preferredName?'choice':'name';state={...initialState(),serviceWizard:servicesOnly,accessFingerprint:authFingerprint(fresh)};}
    if(accessChanged){stage=row.preferredName?'choice':'name';state={...initialState(),serviceWizard:servicesOnly,accessFingerprint:authFingerprint(fresh)};}
    let flowChanged=false;
    if(!servicesOnly&&state.serviceWizard&&stage!=='complete'&&state.draft.services.length===0){state={...state,serviceWizard:false,completedSteps:[]};flowChanged=true;}
    const workspaceAdded=!state.workspace;
    if(workspaceAdded)state.workspace=beginWorkspaceDraft(await readWorkspace(fresh.clinicId!,tx));
    // Upgrade empty/service-only legacy drafts without discarding collected services.
    // A legacy full-setup draft with pending branches/rooms/staff keeps its original flow.
    let upgraded=false;
    if(servicesOnly&&!state.serviceWizard&&stage!=='complete'&&['branches','rooms','staff'].every(k=>state.draft[k as keyof Draft].length===0)){
      state={...state,serviceWizard:true,completedSteps:[],draft:parseDraft({...state.draft,services:state.draft.services.map(s=>({...s,branchScope:s.branchKey?'branch':null,definition:s.definition??createDefinition(s.category==='Laser'?'laser':'custom',language)}))})};
      stage='choice';upgraded=true;
    }
    const consentChanged=stage==='conversation'&&state.entryMode!=='manual'&&publicCapabilities().llm&&row.consentVersion!==CONSENT_VERSION;
    if(consentChanged)stage=row.preferredName?'choice':'name';
    if(stage==='name')stage='choice';
    if(language!==row.language||stage!==row.stage||expired||accessChanged||upgraded||flowChanged||workspaceAdded||!row.preferredName)row=await change(tx,row,{stage,language,...(!row.preferredName?{preferredName:fresh.name?.trim().slice(0,80)||'مدير'}:{}),...(accessChanged||consentChanged?{consentVersion:null,consentAt:null}:{}),state:state as unknown as Record<string,unknown>});
    await audit(tx,fresh,'opened');return row;
  },true);return {capabilities:publicCapabilities(),session:publicSession(row),consentVersion:CONSENT_VERSION};
}
export async function setConciergeName(actor:User,name:string,revision:number,language:Language) {
  const row=await withSession(actor,async(tx,row,fresh)=>{noBusy(row);checkRevision(row,revision);if(row.stage!=='name'&&row.stage!=='choice')throw conflict('concierge_stale');
    await audit(tx,fresh,'name_set');return change(tx,row,{preferredName:name,language,stage:'choice'});});return publicSession(row);
}
export async function setConciergeMode(actor:User,mode:'manual'|'voice'|'text',revision:number,agreed:boolean) {
  const row=await withSession(actor,async(tx,row,fresh)=>{
    noBusy(row);checkRevision(row,revision);if(!row.preferredName)throw conflict('concierge_session_required');
    if(row.stage==='complete')throw conflict('concierge_stale');
    const caps=publicCapabilities();
    if(mode!=='manual'&&caps.llm&&!agreed)throw forbidden('concierge_consent_required');
    if(mode==='voice'&&!caps.voice)throw new HttpError(503,'concierge_voice_unavailable');
    const state=stateOf(row);const [clinic]=await tx.select({name:clinicsTable.name}).from(clinicsTable).where(eq(clinicsTable.id,fresh.clinicId!));
    const companyProfile=state.companyProfile??(state.serviceWizard?{name:clinic!.name,summary:'',industry:null,location:null,website:null,sources:[],found:true}:null);
    await audit(tx,fresh,'mode_selected',{mode});
    return change(tx,row,{stage:mode==='manual'&&!state.serviceWizard?'manual':'conversation',
      state:{...state,entryMode:mode,companyProfile} as unknown as Record<string,unknown>,
      ...(mode==='manual'||!caps.llm?{}:{consentVersion:CONSENT_VERSION,consentAt:new Date()})});
  });return publicSession(row);
}
export async function findConciergeCompany(actor:User,revision:number,query:string,sourceUrls:string[]=[]){
  const claim=await withSession(actor,async(tx,row,fresh)=>{if(!sourceUrls.length)consent(row);noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');const state=stateOf(row);if(state.companyProfile&&!state.serviceWizard)throw conflict('concierge_stale');const budget=reserveBudget(row,'turns',1);const id=randomUUID();await tx.update(onboarding).set({busyId:id,busyUntil:new Date(Date.now()+180000),budget}).where(eq(onboarding.id,row.id));await audit(tx,fresh,'company_lookup_started');return {id,language:row.language as Language,previousQuery:state.companySearchQuery??state.companyCandidate?.name??null};});
  try{const candidates=sourceUrls.length?[await lookupLinkedClinic(sourceUrls)]:await lookupCompany(claim.previousQuery?`${query}\nPrevious name/search context (latest correction wins): ${claim.previousQuery}`:query,claim.language);const candidate=candidates[0]!;const row=await withSession(actor,async(tx,row,fresh)=>{if(row.busyId!==claim.id||row.revision!==revision)throw conflict('concierge_stale');const state=stateOf(row);await audit(tx,fresh,'company_lookup_completed',{found:candidate.found,choiceCount:candidates.filter(c=>c.found).length});return change(tx,row,{busyId:null,busyUntil:null,state:{...state,sourceImport:sourceUrls.length>0||state.sourceImport,companyCandidate:candidate,companyCandidates:candidates.filter(c=>c.found).slice(0,3),companySearchQuery:query.slice(0,500)} as unknown as Record<string,unknown>});});return publicSession(row);}
  catch(err){await db.update(onboarding).set({busyId:null,busyUntil:null}).where(and(where(actor),eq(onboarding.busyId,claim.id))).catch(()=>{});throw err;}
}
export async function confirmConciergeCompany(actor:User,revision:number,answer:'yes'|'retry'|'skip',colors?:string[],selectedIndex=0){
  const context=await businessContext(actor);
  if(!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>2)throw badRequest('concierge_invalid_data');
  let details:BusinessDetails|undefined;
  if(answer==='yes'){
    const [current]=await db.select().from(onboarding).where(where(actor));
    if(!current||current.revision!==revision)throw conflict('concierge_stale');
    const state=stateOf(current),selected=(state.companyCandidates?.length?state.companyCandidates[selectedIndex]:selectedIndex===0?state.companyCandidate:null);
    if(!selected?.found)throw badRequest('concierge_invalid_data');
    details=selected.details??await enrichCompany(selected,current.language as Language);
  }
  const row=await withSession(actor,async(tx,row,fresh)=>{
    noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
    const state=stateOf(row),candidate=answer==='yes'?(state.companyCandidates?.length?state.companyCandidates[selectedIndex]:state.companyCandidate):state.companyCandidate;
    if(answer==='yes'&&!candidate?.found)throw badRequest('concierge_invalid_data');
    if(answer==='yes'&&candidate){candidate.details=details;if(candidate.details&&colors?.length)candidate.details.colors=colors;}
    const next:State={...state,companyCandidate:null,companyCandidates:[]};
    if(answer==='yes'&&candidate){
      next.companyProfile=candidate;
      if(state.workspace&&candidate.workspaceFacts)next.workspace={...state.workspace,proposals:candidate.workspaceFacts};
      if(candidate.details){
        next.branding={name:candidate.name,details:candidate.details};
        next.serviceSuggestions=publicServiceSuggestions(candidate.details,state.draft,context.services).filter(s=>!state.excludedServices?.includes(normalizeServiceName(s.name)));
        // Confirmed public branches enter the reviewable draft; services stay opt-in.
        if(!state.serviceWizard)next.draft=importPublicDetails(state.draft,{branches:candidate.details.branches,services:[]},context);
      }
    }else if(!state.serviceWizard){next.companyProfile=null;}
    await audit(tx,fresh,'company_confirmed',{answer});
    return change(tx,row,{state:next as unknown as Record<string,unknown>});
  });return publicSession(row);
}
/** Minimal authorized catalog; no emails, notes, customer data or credentials. */
export async function conciergeServiceOptions(actor:User){
  actor=await freshManager(actor);const clinicId=ensureManager(actor);
  const branches=await db.select({id:branchesTable.id,name:branchesTable.name}).from(branchesTable).where(eq(branchesTable.clinicId,clinicId)).orderBy(asc(branchesTable.id)).limit(200);
  const employees=hasPermission(actor,'employees.read')?await db.select({id:usersTable.id,name:usersTable.name,branchId:usersTable.branchId}).from(usersTable).where(and(eq(usersTable.clinicId,clinicId),eq(usersTable.isActive,true))).orderBy(asc(usersTable.name)).limit(200):[];
  const rooms=hasPermission(actor,'rooms.manage')?await db.select({id:roomsTable.id,name:roomsTable.name,branchId:roomsTable.branchId,status:roomsTable.status}).from(roomsTable).where(eq(roomsTable.clinicId,clinicId)).orderBy(asc(roomsTable.name)).limit(200):[];
  return {branches:branches.map(b=>({...b,key:`branch_${b.id}`})),employees,rooms};
}
export async function acceptServiceSuggestion(actor:User,revision:number,key:string){
  const row=await withSession(actor,async(tx,row,fresh)=>{
    noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation'||!hasPermission(fresh,'services.manage'))throw forbidden();
    const state=stateOf(row),suggestion=state.serviceSuggestions?.find(s=>s.key===key);if(!suggestion)throw notFound();
    if(state.draft.services.some(s=>normalizeServiceName(s.name??'')===normalizeServiceName(suggestion.name)))throw conflict('concierge_duplicate');
    const serviceKey=`service_${randomUUID().replace(/-/g,'').slice(0,20)}`;
    const draft=parseDraft({...state.draft,services:[...state.draft.services,draftFromSuggestion(suggestion,serviceKey,row.language as Language)]});
    await audit(tx,fresh,'service_candidate_selected',{key});
    return change(tx,row,{state:{...state,draft,excludedServices:serviceExclusions(state.draft,draft,state.excludedServices),serviceSuggestions:state.serviceSuggestions?.filter(s=>s.key!==key),serviceSources:{...state.serviceSources,[serviceKey]:{kind:'public',label:suggestion.name,url:suggestion.sourceUrl||null}}} as unknown as Record<string,unknown>});
  });return publicSession(row);
}
function reserveBudget(row:ManagerOnboarding,type:'turns'|'uploads'|'speechChars'|'voiceSessions',amount:number) {
  const today=new Date().toISOString().slice(0,10),old=row.budget.date===today?row.budget:{};
  const budget={date:today,turns:Number(old.turns??0),uploads:Number(old.uploads??0),speechChars:Number(old.speechChars??0),voiceSessions:Number(old.voiceSessions??0)};
  const maxima={turns:LIMITS.dailyTurns,uploads:LIMITS.dailyUploads,speechChars:LIMITS.dailySpeechChars,voiceSessions:LIMITS.dailyVoiceSessions};
  budget[type]+=amount;if(conciergeConfig().dailyLimitsEnabled&&budget[type]>maxima[type])throw new HttpError(429,'concierge_daily_limit');return budget;
}
export async function finishConciergeStep(actor:User,revision:number){
 const context=await businessContext(actor);
 const result=await withSession(actor,async(tx,row,fresh)=>{
  consent(row);noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
  const state=stateOf(row),flow=setupWorkflow(state,row.language as Language);
  if(flow.step==='company'||flow.step==='review')return row;
  if(!canFinishStep(flow.step,state.draft,context))return row;
  const completedSteps=Array.from(new Set([...(state.completedSteps??[]),flow.step]));
  await audit(tx,fresh,'step_confirmed',{step:flow.step});
  return change(tx,row,{state:{...state,completedSteps} as unknown as Record<string,unknown>});
 });return publicSession(result);
}
export async function turnConcierge(actor:User,input:{revision:number;requestId:string;text:string},file?:ModelFile,stream?:{onService:(service:ServiceDraft)=>void;signal?:AbortSignal}) {
  if(!publicCapabilities().llm&&!file)return localTurnConcierge(actor,input,stream?.signal);
  const fingerprint=hash({text:input.text,file:file?{name:file.name,hash:hash(Buffer.from(file.bytes).toString('base64'))}:null});
  const claim=await withSession(actor,async(tx,row,fresh)=>{
    consent(row);const state=stateOf(row);
    if(!state.companyProfile)throw conflict('concierge_identity_required');
    if(state.lastTurnId===input.requestId){if(state.lastTurnHash!==fingerprint)throw conflict('concierge_stale');return {row,fresh,replay:true};}
    noBusy(row);checkRevision(row,input.revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
    let budget=reserveBudget(row,'turns',1);if(file)budget=reserveBudget({...row,budget},'uploads',1);
    const [updated]=await tx.update(onboarding).set({busyId:input.requestId,busyUntil:new Date(Date.now()+100000),budget,updatedAt:new Date()}).where(eq(onboarding.id,row.id)).returning();
    await audit(tx,fresh,file?'upload_started':'turn_started',{requestId:input.requestId,bytes:file?.bytes.length??0});return {row:updated!,fresh,replay:false};
  });
  if(claim.replay)return publicSession(claim.row);
  try {
    const state=stateOf(claim.row),context=await businessContext(claim.fresh);
    const {reply,usage}=await callDirector({language:claim.row.language as Language,preferredName:claim.row.preferredName,context:{...context,excludedServices:state.excludedServices??[],workspace:state.workspace?{...state.workspace.profile,logoDataUrl:null}:null,serviceWizard:state.serviceWizard??false,confirmedCompany:state.companyProfile?{name:state.companyProfile.name,summary:state.companyProfile.summary,...(!state.serviceWizard?{branches:state.companyProfile.details?.branches,services:state.companyProfile.details?.services}:{})}:null,workflow:setupWorkflow(state,claim.row.language as Language)},draft:state.draft,messages:state.messages,text:input.text},file,fetch,stream?{signal:stream.signal,onService:service=>{if(!filterRemovedServices({...emptyDraft(),services:[service]},state.draft,state.excludedServices).services.length)return;const preview=mergeDraft(state.draft,{...emptyDraft(),services:[service]}).services.find(s=>s.key===service.key)!;if(!preview.definition&&state.serviceWizard)return;stream.onService(preview);}}:undefined);
    stream?.signal?.throwIfAborted();
    const result=await withSession(actor,async(tx,row,fresh)=>{
      stream?.signal?.throwIfAborted();
      if(row.busyId!==input.requestId||row.revision!==input.revision)throw conflict('concierge_stale');
      if(authFingerprint(fresh)!==authFingerprint(claim.fresh))throw forbidden('concierge_access_changed');
      for(const kind of KINDS){const permission=({branches:'settings.manage',services:'services.manage',rooms:'rooms.manage',staff:'employees.manage'} as const)[kind];if(reply.patch[kind].length&&!hasPermission(fresh,permission))throw forbidden();}
      const draft=mergeDraft(state.draft,filterRemovedServices(reply.patch,state.draft,state.excludedServices)),basis={...state.branchBasis};
      let workspace=state.workspace;
      if(workspace&&reply.workspaceFacts?.length){
        const updates:Record<string,string>={};
        for(const fact of reply.workspaceFacts){
          if(fact.field==='logoDataUrl'||!fact.value||!fact.evidence||!input.text.includes(fact.evidence)||!fact.evidence.includes(fact.value))continue;
          updates[fact.field]=fact.value;
        }
        try{workspace=editWorkspaceDraft(workspace,{...workspace.profile,...updates});}catch{/* Invalid inferred contact/theme remains editable manually. */}
      }
      if(state.serviceWizard){assertServiceOnly(state.draft,draft);ensureWizardDefinitions(draft);}
      const serviceSources=changedServiceSources(state.draft,draft,state.serviceSources??{},{kind:'conversation',label:file?'مستند راجعه المدير':'معلومات المدير',url:null});
      for(const b of draft.branches)if(b.existingId!==null){
        const current=context.branches.find(x=>x.id===b.existingId);if(!current)throw forbidden('concierge_invalid_reference');
        if(!basis[String(b.existingId)])basis[String(b.existingId)]=branchFingerprint(current);
      }
      const messages=[...state.messages,{id:input.requestId,role:'user' as const,text:file?`[uploaded document]`:input.text},{id:randomUUID(),role:'assistant' as const,text:state.serviceWizard||reply.ui==='upload'?reply.reply:setupWorkflow({...state,draft},row.language as Language).prompt}].slice(-LIMITS.history);
      const uploads=file?[...state.uploads,{id:input.requestId,name:file.name,size:file.bytes.length,status:reply.fileRead?'read' as const:'unreadable' as const,summary:reply.fileSummary??''}].slice(-LIMITS.dailyUploads):state.uploads;
      const nav=reply.navigation==='none'?null:NAVIGATION[reply.navigation];
      const next:State={...state,workspace,serviceSources,accessFingerprint:authFingerprint(fresh),draft,messages,uploads,branchBasis:basis,lastTurnId:input.requestId,lastTurnHash:fingerprint,ui:file?'none':mentionsUpload(input.text)?'upload':reply.ui==='upload'?'upload':setupWorkflow({...state,draft},row.language as Language).step==='review'?reply.ui:'none',navigation:nav&&hasPermission(fresh,nav.permission as Permission)?nav.path:undefined};
      const updated=await change(tx,row,{busyId:null,busyUntil:null,state:next as unknown as Record<string,unknown>});
      await audit(tx,fresh,file?'upload_processed':'turn_completed',{requestId:input.requestId,...usage,fileRead:file?reply.fileRead:null,records:KINDS.reduce((n,k)=>n+draft[k].length,0)});return updated;
    });return publicSession(result);
  } catch(err) {
    // Release only our own lease. Do not overwrite a newer turn, and do not log content or secrets.
    await db.update(onboarding).set({busyId:null,busyUntil:null}).where(and(where(actor),eq(onboarding.busyId,input.requestId))).catch(()=>{});
    await recordAudit({clinicId:actor.clinicId,actorUserId:actor.id,action:'concierge.turn_failed',entityType:'manager_onboarding',details:{requestId:input.requestId}}).catch(()=>{});
    throw err;
  }
}

/** All three input methods edit this same revisioned identity draft. */
export async function saveConciergeWorkspace(actor:User,revision:number,profile:unknown) {
 const row=await withSession(actor,async(tx,row,fresh)=>{
  noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
  const state=stateOf(row),draft=state.workspace??beginWorkspaceDraft(await readWorkspace(fresh.clinicId!,tx));
  const workspace=editWorkspaceDraft(draft,profile);
  await audit(tx,fresh,'identity_draft_edited');
  return change(tx,row,{state:{...state,workspace} as unknown as Record<string,unknown>});
 });return publicSession(row);
}
export async function selectConciergeWorkspaceFact(actor:User,revision:number,id:string,accept:boolean) {
 const row=await withSession(actor,async(tx,row,fresh)=>{
  noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
  const state=stateOf(row);if(!state.workspace)throw conflict('concierge_session_required');
  if(!state.workspace.proposals.some(f=>f.id===id))throw notFound();
  const workspace=accept?acceptWorkspaceFact(state.workspace,id):{...state.workspace,proposals:state.workspace.proposals.filter(f=>f.id!==id)};
  await audit(tx,fresh,accept?'identity_fact_selected':'identity_fact_dismissed');
  return change(tx,row,{state:{...state,workspace} as unknown as Record<string,unknown>});
 });return publicSession(row);
}
/** Explicit recovery when another manager saved identity changes. Services are never discarded. */
export async function reloadConciergeWorkspace(actor:User,revision:number) {
 const row=await withSession(actor,async(tx,row,fresh)=>{
  noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
  const state=stateOf(row),workspace=beginWorkspaceDraft(await readWorkspace(fresh.clinicId!,tx));
  await audit(tx,fresh,'identity_draft_reloaded');
  return change(tx,row,{state:{...state,workspace} as unknown as Record<string,unknown>});
 });return publicSession(row);
}
async function localTurnConcierge(actor:User,input:{revision:number;requestId:string;text:string},signal?:AbortSignal) {
 const row=await withSession(actor,async(tx,row,fresh)=>{
  signal?.throwIfAborted();const state=stateOf(row),fingerprint=hash({text:input.text,file:null});
  if(state.lastTurnId===input.requestId){if(state.lastTurnHash!==fingerprint)throw conflict('concierge_stale');return row;}
  noBusy(row);checkRevision(row,input.revision);if(row.stage!=='conversation'||!state.serviceWizard)throw conflict('concierge_stale');
  const local=localConciergeTurn(state.draft,input.text,row.language as Language,`service_${input.requestId.replace(/-/g,'').slice(0,20)}`,state.workspace);
  if(JSON.stringify(state.draft)!==JSON.stringify(local.draft)&&!hasPermission(fresh,'services.manage'))throw forbidden();
  assertServiceOnly(state.draft,local.draft);ensureWizardDefinitions(local.draft);
  const serviceSources=changedServiceSources(state.draft,local.draft,state.serviceSources??{},{kind:'conversation',label:'Explicit local input',url:null});
  const messages=[...state.messages,{id:input.requestId,role:'user' as const,text:input.text},{id:randomUUID(),role:'assistant' as const,text:local.reply}].slice(-LIMITS.history);
  signal?.throwIfAborted();await audit(tx,fresh,'local_turn_completed',{requestId:input.requestId,handled:local.handled});
  return change(tx,row,{state:{...state,excludedServices:serviceExclusions(state.draft,local.draft,state.excludedServices),draft:local.draft,workspace:local.workspace,serviceSources,messages,lastTurnId:input.requestId,lastTurnHash:fingerprint} as unknown as Record<string,unknown>});
 });return publicSession(row);
}
export async function saveConciergeDraft(actor:User,revision:number,raw:unknown) {
  const draft=parseDraft(raw);
  const row=await withSession(actor,async(tx,row,fresh)=>{noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
    const state=stateOf(row),basis={...state.branchBasis};
    if(!hasPermission(fresh,'services.manage')&&JSON.stringify(state.draft.services)!==JSON.stringify(draft.services))throw forbidden();
    if(state.serviceWizard){assertServiceOnly(state.draft,draft);ensureWizardDefinitions(draft);}
    const serviceSources=changedServiceSources(state.draft,draft,state.serviceSources??{},{kind:'manual',label:'تعديل المدير',url:null});
    for(const b of draft.branches)if(b.existingId!==null&&!basis[String(b.existingId)]){
      const [existing]=await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,fresh.clinicId!),eq(branchesTable.id,b.existingId)));if(!existing)throw forbidden();basis[String(b.existingId)]=branchFingerprint(existing);
    }
    await audit(tx,fresh,'draft_edited');return change(tx,row,{state:{...state,draft,excludedServices:serviceExclusions(state.draft,draft,state.excludedServices),serviceSources,branchBasis:basis,ui:'review'} as unknown as Record<string,unknown>});});return publicSession(row);
}
export async function previewConcierge(actor:User) {
  const fresh=await freshManager(actor);const [row]=await db.select().from(onboarding).where(where(fresh));if(!row)throw notFound();
  checkAccess(row,fresh);const state=stateOf(row),context=await businessContext(fresh);
  const issues=draftIssues(state.draft,context.branches.map(b=>b.key),context.services.map(s=>s.key));
  const preview=previewConciergeSetup(fresh,state.draft);
  return {...preview,revision:row.revision,draft:state.draft,issues:[...issues.filter(i=>!(i.code==='empty'&&state.workspace?.dirty)),...preview.issues],options:{branches:context.branches,services:context.services}};
}
export async function applyConcierge(actor:User,revision:number,credentials:{key:string;initialPassword:string;permissions:string[]}[]) {
  const result=await withSession(actor,async(tx,row,fresh)=>{
    // The stored complete result makes a retried confirmation safe and prevents duplicate inserts.
    const state=stateOf(row);if(row.stage==='complete'&&state.applied&&row.revision===revision+1)return row;
    noBusy(row);checkRevision(row,revision);if(row.stage!=='conversation')throw conflict('concierge_stale');
    if(state.serviceWizard)ensureWizardDefinitions(state.draft);
    const hasRecords=KINDS.some(k=>state.draft[k].length);
    if(!hasRecords&&!state.workspace?.dirty)throw badRequest('concierge_missing_fields');
    if(!hasRecords&&credentials.length)throw badRequest('concierge_invalid_data');
    const applied=hasRecords?await applyConciergeSetup(tx,fresh,state.draft,state.branchBasis,credentials):{branches:[],services:[],rooms:[],staff:[]};
    const identity=state.workspace?await applyWorkspace(tx,fresh,state.workspace):await readWorkspace(fresh.clinicId!,tx);
    const updated=await change(tx,row,{stage:'complete',state:{...initialState(),serviceWizard:state.serviceWizard,workspace:beginWorkspaceDraft(identity),accessFingerprint:authFingerprint(fresh),applied} as unknown as Record<string,unknown>});
    await audit(tx,fresh,'setup_applied',{counts:Object.fromEntries(Object.entries(applied).map(([k,v])=>[k,v.length]))});return updated;
  });return publicSession(result);
}
export async function realtimeOffer(actor:User,sdp:string) {
  const fingerprint=authFingerprint(await freshManager(actor));
  const session=await withSession(actor,async(tx,row,fresh)=>{consent(row);if(row.stage!=='conversation')throw conflict('concierge_stale');const budget=reserveBudget(row,'voiceSessions',1);await tx.update(onboarding).set({budget}).where(eq(onboarding.id,row.id));await audit(tx,fresh,'voice_session_started');return {serviceWizard:stateOf(row).serviceWizard??false,language:row.language as Language,preferredName:row.preferredName,company:stateOf(row).companyProfile?{name:stateOf(row).companyProfile!.name,summary:stateOf(row).companyProfile!.summary}:null,workflow:setupWorkflow(stateOf(row),row.language as Language)};});
  const context=await businessContext(actor);
  const safetyId=createHash('sha256').update(`${process.env.SESSION_SECRET??''}:${actor.id}`).digest('hex');
  let answer:string;
  try{answer=await createRealtimeOffer(sdp,session.language,session.preferredName,{serviceWizard:session.serviceWizard,confirmedCompany:session.company,workflow:session.workflow,branches:context.branches.slice(0,15),services:context.services.slice(0,15),rooms:context.rooms.slice(0,15),staff:context.staff.slice(0,15),truncated:context.truncated},safetyId);}
  catch(err){await withSession(actor,async(tx,row)=>{const budget={...row.budget};if(budget.date===new Date().toISOString().slice(0,10)){budget.voiceSessions=Math.max(0,Number(budget.voiceSessions??0)-1);await tx.update(onboarding).set({budget}).where(eq(onboarding.id,row.id));}}).catch(()=>{});throw err;}
  if(authFingerprint(await freshManager(actor))!==fingerprint)throw forbidden('concierge_access_changed');return answer;
}
export async function sonioxAssistKey(actor:User){
  const fingerprint=authFingerprint(await freshManager(actor));
  await withSession(actor,async(_tx,row)=>{consent(row);if(row.stage!=='conversation')throw conflict('concierge_stale');});
  const result=await createSonioxAssistKey();
  if(authFingerprint(await freshManager(actor))!==fingerprint)throw forbidden('concierge_access_changed');
  return result;
}
export async function speechConcierge(actor:User,utteranceId:string,signal:AbortSignal) {
  const permissionFingerprint=authFingerprint(await freshManager(actor));
  const speech=await withSession(actor,async(tx,row,fresh)=>{
    let text:string;
    // Generic welcome contains no personal content and may be attempted on first login.
    if(utteranceId===`stage:${row.stage}`)text=fixedSpeech(row.stage as Stage,row.language as Language);
    else {consent(row);const msg=stateOf(row).messages.find(m=>m.id===utteranceId&&m.role==='assistant');if(!msg)throw notFound();text=msg.text;}
    const budget=reserveBudget(row,'speechChars',text.length);await tx.update(onboarding).set({budget}).where(eq(onboarding.id,row.id));await audit(tx,fresh,'speech_requested',{characters:text.length});return {text,language:row.language as Language};
  });
  const response=await createSpeech(speech.text,speech.language,signal);
  if(authFingerprint(await freshManager(actor))!==permissionFingerprint){await response.body?.cancel();throw forbidden('concierge_access_changed');}
  return response;
}
