import { WORKSPACE_FIELDS, normalizePhone, type WorkspaceField } from '@workspace/service-definition';
/** Provider-independent onboarding contract. Model output is DATA, never an executable command. */
import { SERVICE_DEFINITION_SCHEMA, parseServiceDefinition, definitionIssues, normalizeServiceName, mainServiceName, type ServiceDefinition } from '@workspace/service-definition';
import { DAYS, validRanges, isTimeZone, normalizeWeek, type Week } from './setup-rules';
export type Language = 'ar' | 'en';
export type Stage = 'name' | 'choice' | 'conversation' | 'complete' | 'manual';
export type Kind = 'branches' | 'services' | 'rooms' | 'staff';
export const KINDS: Kind[] = ['branches', 'services', 'rooms', 'staff'];
export const CONSENT_VERSION = 'concierge-openai-soniox-2026-09-22';
export const LIMITS = { records: 50, patches: 20, messageChars: 6000, replyChars: 1400, history: 24, uploadBytes: 32 * 1024 * 1024, textFileChars: 60000, dailyTurns: 80, dailyUploads: 10, dailySpeechChars: 24000, dailyVoiceSessions: 4, voiceSeconds: 3300, retentionDays: 30 } as const;
export type BranchDraft = { address?: string | null; mapUrl?: string | null; key: string; existingId: number | null; name: string | null; nameLang: Language | null; timeZone: string | null; openingHours: Week | null };
export type ServiceDraft = { followUpEnabled?: boolean | null; definition?: ServiceDefinition | null; branchScope?: 'all' | 'branch' | null; employeeIds?: number[] | null; roomIds?: number[] | null; key: string; name: string | null; nameLang: Language | null; branchKey: string | null; durationMinutes: number | null; price: string | null; currency: string | null; category: string | null; requiresRoom: boolean | null };
export type RoomDraft = { key: string; name: string | null; nameLang: Language | null; branchKey: string | null; capacity: number | null; serviceKeys: string[] | null };
export type DraftBranchSchedule={branchKey:string;workingHours:Week;breaks:Week};
export type StaffDraft = { key: string; name: string | null; nameLang: Language | null; email: string | null; phone: string | null; jobTitle: string | null; branchSchedules?:DraftBranchSchedule[]|null; branchKey: string | null; role: 'secretary' | 'doctor' | 'service_provider' | 'other_staff' | null; serviceKeys: string[] | null; workingHours: Week | null; breaks: Week | null };
export type Draft = { branches: BranchDraft[]; services: ServiceDraft[]; rooms: RoomDraft[]; staff: StaffDraft[] };
export const emptyDraft = (): Draft => ({ branches: [], services: [], rooms: [], staff: [] });
export type ConversationMessage = { id: string; role: 'user' | 'assistant'; text: string };
export type UploadedDocument = { id: string; name: string; size: number; status: 'read' | 'unreadable'; summary: string };
export type Navigation = 'none' | 'branches' | 'services' | 'rooms' | 'employees' | 'appointments' | 'customers' | 'waiting' | 'inventory';
export const NAVIGATION: Record<Exclude<Navigation, 'none'>, { path: string; permission: string }> = {
  branches: { path: '/business/settings', permission: 'settings.read' }, services: { path: '/business/services', permission: 'services.read' }, rooms: { path: '/business/rooms', permission: 'rooms.read' }, employees: { path: '/people/employees', permission: 'employees.read' }, appointments: { path: '/appointments/view', permission: 'appointments.read' }, customers: { path: '/people/customers', permission: 'customers.read' }, waiting: { path: '/appointments/waiting-list', permission: 'appointments.read' }, inventory: { path: '/business/inventory', permission: 'inventory.read' },
};
export class ConciergeInputError extends Error { readonly code: string; constructor(code = 'concierge_invalid_data') { super(code); this.code = code; } }
function fail(): never { throw new ConciergeInputError(); }
type Shape = { type?: string | string[]; enum?: unknown[]; properties?: Record<string, Shape>; items?: Shape; required?: string[]; additionalProperties?: boolean; anyOf?: Shape[] };
const object = (properties: Record<string, Shape>): Shape => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string: Shape = { type: 'string' }, number: Shape = { type: 'integer' }, boolean: Shape = { type: 'boolean' };
const nullable = (s: Shape): Shape => ({ anyOf: [s, { type: 'null' }] });
const enumeration = (values: string[]): Shape => ({ type: 'string', enum: values });
const array = (items: Shape): Shape => ({ type: 'array', items });
const week = object(Object.fromEntries(DAYS.map(d => [d, array(object({ open: string, close: string }))])));
const base = { key: string, name: nullable(string), nameLang: nullable(enumeration(['ar', 'en'])) };
const branchShape = object({ ...base, address: nullable(string), mapUrl: nullable(string), existingId: nullable(number), timeZone: nullable(string), openingHours: nullable(week) });
export const serviceShape = object({ ...base, definition: nullable(SERVICE_DEFINITION_SCHEMA), branchScope: nullable(enumeration(['all','branch'])), employeeIds: nullable(array(number)), roomIds: nullable(array(number)), branchKey: nullable(string), durationMinutes: nullable(number), price: nullable(string), currency: nullable(string), category: nullable(string), requiresRoom: nullable(boolean), followUpEnabled: nullable(boolean) });
const roomShape = object({ ...base, branchKey: nullable(string), capacity: nullable(number), serviceKeys: nullable(array(string)) });
const staffShape = object({ ...base, branchSchedules:nullable(array(object({branchKey:string,workingHours:week,breaks:week}))), email: nullable(string), phone: nullable(string), jobTitle: nullable(string), branchKey: nullable(string), role: nullable(enumeration(['secretary','doctor','service_provider','other_staff'])), serviceKeys: nullable(array(string)), workingHours: nullable(week), breaks: nullable(week) });
export const DRAFT_SCHEMA = object({ branches: array(branchShape), services: array(serviceShape), rooms: array(roomShape), staff: array(staffShape) });
export const RESPONSE_SCHEMA = object({ workspaceFacts:array(object({field:enumeration([...WORKSPACE_FIELDS]),value:string,evidence:string})), reply: string, ui: enumeration(['none', 'upload', 'review']), navigation: enumeration(['none', ...Object.keys(NAVIGATION)]), patch: DRAFT_SCHEMA, fileRead: nullable(boolean), fileSummary: nullable(string) });
export type ModelReply = { workspaceFacts?:{field:WorkspaceField;value:string;evidence:string}[]; reply: string; ui: 'none' | 'upload' | 'review'; navigation: Navigation; patch: Draft; fileRead: boolean | null; fileSummary: string | null };
/** Small strict validator for this closed schema; not a general-purpose JSON Schema implementation. */
function check(value: unknown, shape: Shape, depth = 0): void {
  if (depth > 16) fail();
  if (shape.anyOf) { for (const s of shape.anyOf) { try { check(value, s, depth + 1); return; } catch {} } return fail(); }
  if (shape.type === 'null') { if (value !== null) fail(); return; }
  if (shape.type === 'string') { if (typeof value !== 'string' || value.length > 6000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail(); }
  if (shape.type === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value))) fail();
  if (shape.type === 'boolean' && typeof value !== 'boolean') fail();
  if (shape.enum && !shape.enum.includes(value)) fail();
  if (shape.type === 'array') { if (!Array.isArray(value) || value.length > 50) fail(); for (const v of value as unknown[]) check(v, shape.items!, depth + 1); }
  if (shape.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    const v = value as Record<string, unknown>, props = shape.properties!;
    if (Object.keys(v).length !== Object.keys(props).length || Object.keys(v).some(k => !Object.hasOwn(props, k))) fail();
    for (const k of Object.keys(props)) { if (!Object.hasOwn(v, k)) fail(); check(v[k], props[k]!, depth + 1); }
  }
}
const KEY = /^[a-z][a-z0-9_-]{0,39}$/;
export const nameLanguage = (name: string): Language => /[\u0600-\u06ff]/u.test(name) ? 'ar' : 'en';
export function parseDraft(raw: unknown): Draft {
  // Explicit v1 upgrade for already-stored drafts and old clients; all other unknown keys still fail.
  if (raw && typeof raw === 'object' && Array.isArray((raw as Draft).services)) {
    raw = {...raw,services:(raw as Draft).services.map(s=>({...s,
      definition:s.definition ?? null,followUpEnabled:s.followUpEnabled ?? null,
      branchScope:Object.hasOwn(s,'branchScope') ? s.branchScope : s.branchKey ? 'branch' : null,
      employeeIds:s.employeeIds ?? null,roomIds:s.roomIds ?? null,currency:'JOD',
    }))};
  }
  if(raw && typeof raw==='object' && Array.isArray((raw as Draft).branches))raw={...raw,branches:(raw as Draft).branches.map(b=>({...b,address:b.address??null,mapUrl:b.mapUrl??null}))};
  if(raw&&typeof raw==='object'&&Array.isArray((raw as Draft).staff))raw={...raw,staff:(raw as Draft).staff.map(p=>({...p,branchSchedules:p.branchSchedules??null}))};
  if(raw&&typeof raw==='object'&&Array.isArray((raw as Draft).rooms))raw={...raw,rooms:(raw as Draft).rooms.map(r=>({...r,capacity:r.capacity??1}))};
  check(raw, DRAFT_SCHEMA);
  const draft = structuredClone(raw) as Draft, keys = new Set<string>();
  if(draft.branches.length===1){
    const onlyBranch=draft.branches[0]!.key;
    for(const room of draft.rooms)room.branchKey??=onlyBranch;
    for(const person of draft.staff)person.branchKey??=onlyBranch;
    for(const service of draft.services)if(!service.branchScope){service.branchScope='branch';service.branchKey??=onlyBranch;}
  }
  if (KINDS.reduce((n, k) => n + draft[k].length, 0) > LIMITS.records) fail();
  for (const kind of KINDS) for (const row of draft[kind]) {
    if (!KEY.test(row.key) || keys.has(row.key)) fail(); keys.add(row.key);
    if (row.name !== null && (!row.name.trim() || row.name.length > 120)) fail();
    if (row.name) row.name = row.name.trim();
    if ('branchKey' in row && row.branchKey !== null && !KEY.test(row.branchKey)) fail();
    if ('serviceKeys' in row && row.serviceKeys !== null && (row.serviceKeys.some(k => !KEY.test(k)) || new Set(row.serviceKeys).size !== row.serviceKeys.length)) fail();
  }
  for (const b of draft.branches) {
    if(b.address!==null&&b.address!==undefined&&(typeof b.address!=='string'||b.address.length>400))fail();
    if(b.mapUrl){try{const url=new URL(b.mapUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||b.mapUrl.length>500)fail();}catch{fail();}}
    if (b.existingId !== null && b.existingId <= 0) fail();
    if (b.timeZone !== null && !isTimeZone(b.timeZone)) fail();
    b.timeZone = 'Asia/Amman';
    if (b.openingHours !== null) for (const d of DAYS) if (b.openingHours[d].length > 8 || !validRanges(b.openingHours[d])) fail();
  }
  if (new Set(draft.branches.filter(b => b.existingId !== null).map(b => b.existingId)).size !== draft.branches.filter(b => b.existingId !== null).length) fail();
  const serviceNames = new Set<string>();
  for (const s of draft.services) {
    if(s.category!==null){if(!s.category.trim()||s.category.length>80||/[\u0000-\u001f\u007f]/u.test(s.category))fail();s.category=s.category.trim().replace(/\s+/g,' ');}
    if (s.definition) { try { s.definition = parseServiceDefinition(s.definition); } catch { fail(); } }
    s.category=mainServiceName(s.category);
    if(s.definition&&!mainServiceName(s.definition.section)){s.definition.section='Clinic services';s.category=null;}
    for (const selection of [s.employeeIds,s.roomIds]) if (selection && (selection.some(id=>!Number.isSafeInteger(id)||id<=0) || new Set(selection).size!==selection.length)) fail();
    if (s.branchScope === 'all' && s.branchKey !== null) fail();
    if (s.name) { const identity=normalizeServiceName(s.name)+'|'+(s.branchKey??'all'); if(serviceNames.has(identity)) throw new ConciergeInputError('concierge_duplicate'); serviceNames.add(identity); }

    if (s.durationMinutes !== null && (s.durationMinutes < 1 || s.durationMinutes > 1440)) fail();
    if (s.price !== null && !/^\d{1,9}(\.\d{1,3})?$/.test(s.price)) fail();
    if (s.currency !== null && !/^[A-Z]{3}$/.test(s.currency)) fail();
  }
  for (const r of draft.rooms) { if (r.capacity !== null && (r.capacity < 1 || r.capacity > 1000)) fail(); r.capacity=1; }
  for (const p of draft.staff) {
    if(p.branchSchedules){if(new Set(p.branchSchedules.map(s=>s.branchKey)).size!==p.branchSchedules.length)fail();for(const s of p.branchSchedules){if(!KEY.test(s.branchKey))fail();for(const w of [s.workingHours,s.breaks])for(const d of DAYS)if(w[d].length>8||!validRanges(w[d]))fail();}if(p.branchSchedules.length){p.branchKey=p.branchSchedules.length===1?p.branchSchedules[0]!.branchKey:null;p.workingHours=p.branchSchedules[0]!.workingHours;p.breaks=p.branchSchedules[0]!.breaks;}}
    if (p.email !== null && (p.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))) fail();
    if (p.phone !== null && p.phone.length > 50 || p.jobTitle !== null && p.jobTitle.length > 120) fail();
    for (const w of [p.workingHours, p.breaks]) if (w) for (const d of DAYS) if (w[d].length > 8 || !validRanges(w[d])) fail();
  }
  return draft;
}
export function parseModelReply(raw: unknown): ModelReply {
  if(raw&&typeof raw==='object'&&Object.hasOwn(raw,'patch'))raw={workspaceFacts:[],...raw,patch:parseDraft((raw as ModelReply).patch)};
  check(raw, RESPONSE_SCHEMA); const reply = raw as ModelReply;
  if (!reply.reply.trim() || reply.reply.length > LIMITS.replyChars || (reply.fileSummary?.length ?? 0) > 900) fail();
  const patch = parseDraft(reply.patch);
  if (KINDS.reduce((n,k) => n + patch[k].length, 0) > LIMITS.patches) fail();
  return { ...reply, reply: reply.reply.trim(), patch };
}
/** Null means not supplied; it MUST NOT erase already collected facts. Lists replace only when explicit. */
export function mergeDraft(current: Draft, patch: Draft): Draft {
  const out = parseDraft(current);
  for (const kind of KINDS) for (const item of patch[kind]) {
    for (const other of KINDS) if (kind !== other && out[other].some(r => r.key === item.key)) fail();
    const rows = out[kind] as unknown as Record<string, unknown>[];
    const previous = rows.find(r => r.key === item.key);
    if (previous) {
      if ('existingId' in item && previous.existingId !== null && item.existingId !== null && previous.existingId !== item.existingId) fail();
      for (const [key, value] of Object.entries(item)) if (value !== null) previous[key] = value;
      if(kind==='services' && 'branchScope' in item && item.branchScope==='all')previous.branchKey=null;
    } else rows.push(structuredClone(item) as unknown as Record<string, unknown>);
  }
  return parseDraft(out);
}
/** A manager can confirm one set of booking details for every listed service. */
export function applySharedServiceDetails(previous:Draft,updated:Draft,patch:Draft,utterance:string):Draft{
  if(updated.services.length<2||!/(?:كلهم|كلها|جميعهم|كل الخدمات|all (?:of them|services)|same for all)/iu.test(utterance)||!/(?:نفس|متشابه|متشابهين|موحد|متساوي|same|similar|identical)/iu.test(utterance)||/(?:ما عدا|باستثناء|إلا|except|apart from)/iu.test(utterance))return updated;
  const result=structuredClone(updated);
  for(const field of ['durationMinutes','price','requiresRoom'] as const){
    const stated=[...new Set(patch.services.map(service=>service[field]).filter(value=>value!==null))];
    const known=[...new Set(previous.services.map(service=>service[field]).filter(value=>value!==null))];
    const shared=stated.length===1?stated[0]:stated.length===0&&known.length===1?known[0]:undefined;
    if(shared===undefined)continue;
    for(const service of result.services)service[field]=shared as never;
  }
  return parseDraft(result);
}
/** Only missing staff hours inherit. Explicit schedules, including closed weeks, survive edits. */
export function withDefaultStaffHours(draft:Draft, existingBranches:{key:string;id?:number;openingHours:unknown}[]=[]):Draft {
  const result=parseDraft(draft);
  const branches=[...result.branches,...existingBranches.filter(b=>!result.branches.some(d=>d.key===b.key||d.existingId===b.id))];
  for(const person of result.staff){
    if(person.branchSchedules?.length)continue;
    if(person.branchKey===null&&branches.length===1)person.branchKey=branches[0]!.key;
    if(person.workingHours!==null)continue;
    const hours=branches.find(b=>b.key===person.branchKey)?.openingHours;
    if(hours)person.workingHours=structuredClone(normalizeWeek(hours));
  }
  return result;
}
export type Issue = { key: string; field: string; code: string };
export function draftIssues(draft: Draft, existingBranches: string[] = [], existingServices: string[] = []): Issue[] {
  const issues: Issue[] = []; const branches = new Set([...existingBranches, ...draft.branches.map(b => b.key)]), services = new Set([...existingServices, ...draft.services.map(s => s.key)]);
  const required = (row: {key: string}, fields: string[]) => { for (const field of fields) if ((row as unknown as Record<string, unknown>)[field] === null) issues.push({key:row.key,field,code:'required'}); };
  const reference = (row: {key: string; branchKey: string | null}) => { if (row.branchKey && !branches.has(row.branchKey)) issues.push({key:row.key,field:'branchKey',code:'invalid_reference'}); };
  for (const b of draft.branches) required(b, ['name','timeZone','openingHours']);
  for (const s of draft.services) {
    required(s, ['name','durationMinutes','price','currency','category','requiresRoom','branchScope']); reference(s);
    if(s.branchScope==='branch'&&!s.branchKey)issues.push({key:s.key,field:'branchKey',code:'required'});
    for(const issue of definitionIssues(s.definition))issues.push({key:s.key,...issue});
  }
  for (const r of draft.rooms) { required(r, ['name','branchKey','capacity','serviceKeys']); reference(r); for (const key of r.serviceKeys ?? []) if (!services.has(key)) issues.push({key:r.key,field:'serviceKeys',code:'invalid_reference'}); }
  for (const p of draft.staff) { required(p, ['name','email','role','workingHours','breaks','serviceKeys']); reference(p); if(p.branchSchedules){if(!p.branchSchedules.length)issues.push({key:p.key,field:'branchSchedules',code:'staff_branch_hours_required'});for(const s of p.branchSchedules){if(!branches.has(s.branchKey))issues.push({key:p.key,field:'branchSchedules',code:'invalid_reference'});if(!DAYS.some(d=>s.workingHours[d].length))issues.push({key:p.key,field:'branchSchedules',code:'staff_branch_hours_required'});}} if(p.phone&&!normalizePhone(p.phone))issues.push({key:p.key,field:'phone',code:'invalid_phone'}); for (const key of p.serviceKeys ?? []) if (!services.has(key)) issues.push({key:p.key,field:'serviceKeys',code:'invalid_reference'}); }
  if (!KINDS.some(k => draft[k].length)) issues.push({key:'draft',field:'draft',code:'empty'});
  return issues;
}
export function mentionsUpload(text: string): boolean { return /\b(pdf|file|document|excel|csv|upload)\b|ملف|ملفات|بي\s?دي\s?اف|أرفع|ارفع|مرفق|إكسل|اكسل/i.test(text); }
export function fixedSpeech(stage: Stage, lang: Language): string {
  const ar: Record<Stage,string> = { name:'أهلين! كيف حالك؟ أول إشي، خبرني باسمك.', choice:'أنا مساعدتك من جورمول. بنرتّب الفروع والموظفين والخدمات والمواعيد بمكان واحد. بتحب تعبّي البيانات بنفسك، ولا نحكي شوي وأنا أجهّزها معك؟', conversation:'خلّينا نبلّش بالفروع. شو أسماء فروعك، ووين موجودة؟ وإذا عندك ملف فيه التفاصيل، ابعته هون وبراجعه معك.', complete:'تم حفظ البيانات بالنظام. صار بإمكانك تراجعها وتكمّل تجهيز المواعيد.', manual:'أكيد، بتقدر تكمل الإعداد من صفحات البرنامج، وترجعلي بأي وقت.' };
  const en: Record<Stage,string> = { name:'Hi! How are you? First, what should I call you?', choice:'I am your JorMall assistant. We can organize branches, staff, services and appointments in one place. Would you like to enter the details yourself, or talk me through them?', conversation:'Let us start with your branches. What are their names and locations? You can also upload a document and I will review it with you.', complete:'Your setup has been saved. You can review the records and continue preparing appointments.', manual:'You can continue in the setup pages and return to me any time.' };
  return (lang === 'ar' ? ar : en)[stage];
}
