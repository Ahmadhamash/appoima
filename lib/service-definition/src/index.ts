/**
 * The shared, executable-code-free contract for clinic services.
 * Used by the model boundary, database writes, wizard, published cards and booking.
 * Deliberately has no dependency on React, a database, or an AI provider.
 */
export const TEMPLATE_IDS = ['consultation', 'laser', 'dental', 'physiotherapy', 'diagnostic', 'procedure', 'custom'] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];
export const FIELD_TYPES = ['short_text', 'long_text', 'select', 'number', 'boolean'] as const;
export type IntakeFieldType = typeof FIELD_TYPES[number];
export const AUDIENCES = ['unspecified', 'all', 'men', 'women', 'children'] as const;
export type Audience = typeof AUDIENCES[number];
export type DefinitionField = {
  id: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  help: string | null;
  options: string[];
};
export type ServiceDefinition = {
  version: 1;
  template: TemplateId;
  section: string;
  description: string | null;
  audience: Audience;
  bodyArea: string | null;
  medicalScope: 'medical' | 'needs_review' | 'out_of_scope';
  /** An unsupported integration or clinical workflow must NOT be advertised as implemented. */
  unsupportedCapabilities: string[];
  intakeFields: DefinitionField[];
};
export type IntakeAnswer = string | number | boolean | null;
export type IntakeAnswers = Record<string, IntakeAnswer>;
export type IntakeSnapshot = { version: 1; fields: { id: string; label: string; type: IntakeFieldType; value: IntakeAnswer }[] };
export type DefinitionIssue = { field: string; code: string };
export type Template = {
  id: TemplateId;
  label: { ar: string; en: string };
  section: { ar: string; en: string };
  hint: { ar: string; en: string };
  category: 'Laser' | 'Skin' | 'Other';
};
/** Templates are presentation presets, NOT a catalog to enable automatically. */
export const SERVICE_TEMPLATES: readonly Template[] = [
  {id:'consultation',label:{ar:'استشارة طبية',en:'Consultation'},section:{ar:'الاستشارات',en:'Consultations'},hint:{ar:'استشارة أو تقييم أولي، حسب وصف العيادة.',en:'A consultation or assessment described by the clinic.'},category:'Other'},
  {id:'laser',label:{ar:'ليزر طبي',en:'Medical laser'},section:{ar:'الليزر',en:'Laser'},hint:{ar:'خدمة محددة بالمنطقة والفئة، دون إضافة خدمات أخرى.',en:'Only the stated treatment area and audience.'},category:'Laser'},
  {id:'dental',label:{ar:'طب الأسنان',en:'Dental'},section:{ar:'الأسنان',en:'Dental'},hint:{ar:'الخدمة التي تسميها العيادة فقط، وليست خطة علاج.',en:'The named service, not a generated treatment plan.'},category:'Other'},
  {id:'physiotherapy',label:{ar:'علاج طبيعي',en:'Physiotherapy'},section:{ar:'العلاج الطبيعي',en:'Physiotherapy'},hint:{ar:'جلسة واحدة أو تقييم بحسب معلومات المدير.',en:'A session or assessment specified by the manager.'},category:'Other'},
  {id:'diagnostic',label:{ar:'فحص أو تشخيص',en:'Diagnostic visit'},section:{ar:'الفحوصات',en:'Diagnostics'},hint:{ar:'إعداد إداري للموعد؛ لا تفسير للنتائج.',en:'Administrative scheduling only, no result interpretation.'},category:'Other'},
  {id:'procedure',label:{ar:'إجراء طبي',en:'Medical procedure'},section:{ar:'الإجراءات الطبية',en:'Medical procedures'},hint:{ar:'اسم وبيانات حجز معتمدة من العيادة.',en:'Clinic-approved service name and booking details.'},category:'Other'},
  {id:'custom',label:{ar:'خدمة طبية مخصّصة',en:'Custom medical service'},section:{ar:'خدمات العيادة',en:'Clinic services'},hint:{ar:'اسم وقسم وحقول جديدة ضمن مكوّنات آمنة.',en:'A new name, section and fields using safe components.'},category:'Other'},
];
export function createDefinition(template: TemplateId = 'custom', language: 'ar' | 'en' = 'ar'): ServiceDefinition {
  const preset = SERVICE_TEMPLATES.find(t => t.id === template) ?? SERVICE_TEMPLATES[6]!;
  return {version:1,template:preset.id,section:preset.section[language],description:null,audience:'unspecified',bodyArea:null,medicalScope:'needs_review',unsupportedCapabilities:[],intakeFields:[]};
}
export class ServiceDefinitionError extends Error {
  constructor(public readonly issues: DefinitionIssue[]) { super('service_definition_invalid'); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const safeText = (v: unknown, max: number, allowEmpty = false): v is string =>
  typeof v === 'string' && v.length <= max && (allowEmpty || v.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const keysAre = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const DEFINITION_KEYS = ['version','template','section','description','audience','bodyArea','medicalScope','unsupportedCapabilities','intakeFields'];
const FIELD_KEYS = ['id','label','type','required','help','options'];
const FIELD_ID = /^[a-z][a-z0-9_]{0,39}$/;
const RESERVED_IDS = new Set(['constructor','prototype','__proto__','password','api_key','token','clinic_id','sql','code','html']);
/** Strict and bounded. Unknown renderer props, scripts, URLs and arbitrary validations are not accepted. */
export function parseServiceDefinition(raw: unknown): ServiceDefinition {
  const issues: DefinitionIssue[] = [];
  const add = (field: string, code = 'invalid') => issues.push({field,code});
  if (!record(raw) || !keysAre(raw, DEFINITION_KEYS)) throw new ServiceDefinitionError([{field:'definition',code:'invalid_shape'}]);
  if (raw.version !== 1) add('version');
  if (!TEMPLATE_IDS.includes(raw.template as TemplateId)) add('template');
  if (!safeText(raw.section, 80)) add('section');
  if (raw.description !== null && !safeText(raw.description, 500)) add('description');
  if (!AUDIENCES.includes(raw.audience as Audience)) add('audience');
  if (raw.bodyArea !== null && !safeText(raw.bodyArea, 100)) add('bodyArea');
  if (!['medical','needs_review','out_of_scope'].includes(String(raw.medicalScope))) add('medicalScope');
  if (!Array.isArray(raw.unsupportedCapabilities) || raw.unsupportedCapabilities.length > 8 || raw.unsupportedCapabilities.some(v => !safeText(v, 160))) add('unsupportedCapabilities');
  if (!Array.isArray(raw.intakeFields) || raw.intakeFields.length > 12) add('intakeFields');
  else {
    const seen = new Set<string>();
    raw.intakeFields.forEach((value, index) => {
      const at = `intakeFields.${index}`;
      if (!record(value) || !keysAre(value, FIELD_KEYS)) { add(at, 'invalid_shape'); return; }
      if (typeof value.id !== 'string' || !FIELD_ID.test(value.id) || RESERVED_IDS.has(value.id) || seen.has(value.id)) add(`${at}.id`);
      seen.add(String(value.id));
      if (!safeText(value.label, 100)) add(`${at}.label`);
      if (!FIELD_TYPES.includes(value.type as IntakeFieldType)) add(`${at}.type`);
      if (typeof value.required !== 'boolean') add(`${at}.required`);
      if (value.help !== null && !safeText(value.help, 240)) add(`${at}.help`);
      if (!Array.isArray(value.options) || value.options.length > 20 || value.options.some(v => !safeText(v, 100))) add(`${at}.options`);
      else if (new Set(value.options.map(v => String(v).trim())).size !== value.options.length || (value.type === 'select' ? value.options.length < 2 : value.options.length !== 0)) add(`${at}.options`);
    });
  }
  if (issues.length) throw new ServiceDefinitionError(issues);
  const definition = structuredClone(raw) as ServiceDefinition;
  definition.section = definition.section.trim();
  definition.description = definition.description?.trim() ?? null;
  definition.bodyArea = definition.bodyArea?.trim() ?? null;
  definition.intakeFields = definition.intakeFields.map(f => ({...f,label:f.label.trim(),help:f.help?.trim() ?? null,options:f.options.map(v=>v.trim())}));
  return definition;
}
export function definitionIssues(definition: ServiceDefinition | null | undefined): DefinitionIssue[] {
  if (!definition) return [];
  const issues: DefinitionIssue[] = [];
  if (definition.medicalScope !== 'medical') issues.push({field:'definition.medicalScope',code:definition.medicalScope === 'out_of_scope' ? 'medical_only' : 'medical_review_required'});
  if (definition.unsupportedCapabilities.length) issues.push({field:'definition.unsupportedCapabilities',code:'unsupported_capability'});
  return issues;
}
export function intakeIssues(definition: ServiceDefinition | null | undefined, answers: unknown): DefinitionIssue[] {
  if (!record(answers) || Object.keys(answers).length > 12) return [{field:'intakeAnswers',code:'invalid'}];
  const fields = definition?.intakeFields ?? [], issues: DefinitionIssue[] = [];
  for (const key of Object.keys(answers)) if (!fields.some(f => f.id === key)) issues.push({field:key,code:'unknown_field'});
  for (const field of fields) {
    const value = Object.hasOwn(answers, field.id) ? answers[field.id] : null;
    const absent = value === null || value === undefined || (typeof value === 'string' && !value.trim());
    if (absent) { if (field.required) issues.push({field:field.id,code:'required'}); continue; }
    const valid = field.type === 'number' ? typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9
      : field.type === 'boolean' ? typeof value === 'boolean'
      : field.type === 'select' ? typeof value === 'string' && field.options.includes(value)
      : safeText(value, field.type === 'short_text' ? 240 : 2000);
    if (!valid) issues.push({field:field.id,code:'invalid'});
  }
  return issues;
}
/** Snapshot labels + values. Later service edits never rewrite an existing appointment's answers. */
export function intakeSnapshot(definition: ServiceDefinition | null | undefined, answers: IntakeAnswers = {}): IntakeSnapshot {
  const issues = intakeIssues(definition, answers);
  if (issues.length) throw new ServiceDefinitionError(issues);
  return {version:1,fields:(definition?.intakeFields ?? []).map(f => ({id:f.id,label:f.label,type:f.type,value:Object.hasOwn(answers,f.id) ? answers[f.id]! : null}))};
}
export function normalizeServiceName(value: string) {
  return value.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').trim().toLocaleLowerCase().replace(/\s+/g,' ');
}
export function missingServiceFields(service: {
  name?: string | null; durationMinutes?: number | null; price?: string | number | null; currency?: string | null;
  category?: string | null; requiresRoom?: boolean | null; branchScope?: string | null; branchKey?:string|null; definition?: ServiceDefinition | null;
}) {
  const issues: DefinitionIssue[] = [];
  for (const field of ['name','durationMinutes','price','currency','category','requiresRoom','branchScope'] as const) {
    if (service[field] === null || service[field] === undefined || service[field] === '') issues.push({field,code:'required'});
  }
  if(service.branchScope==='branch'&&!service.branchKey)issues.push({field:'branchKey',code:'required'});
  if(!service.definition)issues.push({field:'definition',code:'required'});
  return [...issues,...definitionIssues(service.definition)];
}
export type JsonShape = {
  type?: string; enum?: (string|number)[]; properties?: Record<string,JsonShape>; items?: JsonShape;
  required?: string[]; additionalProperties?: boolean; anyOf?: JsonShape[];
};
const object = (properties: Record<string,JsonShape>): JsonShape => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text: JsonShape = {type:'string'};
const nullableText: JsonShape = {anyOf:[text,{type:'null'}]};
export const SERVICE_DEFINITION_SCHEMA: JsonShape = object({
  version:{type:'integer',enum:[1]},template:{type:'string',enum:[...TEMPLATE_IDS]},section:text,description:nullableText,
  audience:{type:'string',enum:[...AUDIENCES]},bodyArea:nullableText,
  medicalScope:{type:'string',enum:['medical','needs_review','out_of_scope']},
  unsupportedCapabilities:{type:'array',items:text},
  intakeFields:{type:'array',items:object({id:text,label:text,type:{type:'string',enum:[...FIELD_TYPES]},required:{type:'boolean'},help:nullableText,options:{type:'array',items:text}})},
});

export * from './workspace-profile';
