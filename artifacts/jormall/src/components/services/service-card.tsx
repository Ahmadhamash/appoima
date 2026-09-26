import type { ReactNode } from 'react';
import { missingServiceFields, type ServiceDefinition, type TemplateId } from '@workspace/service-definition';
import './services.css';
type Language = 'ar'|'en';
export type PresentableService = {name?:string|null;definition?:ServiceDefinition|null;durationMinutes?:number|null;price?:string|number|null;currency?:string|null;requiresRoom?:boolean|null;category?:string|null;isActive?:boolean;branchScope?:'all'|'branch'|null;branchKey?:string|null};
export const serviceWords = (language:Language,ar:string,en:string) => language==='ar'?ar:en;
export function ServiceGlyph({template='custom'}:{template?:TemplateId}) {
 const paths:Record<TemplateId,string>={consultation:'M8 3v6a4 4 0 0 0 8 0V3M6 3h4m4 0h4m-6 10v3a5 5 0 0 0 10 0v-3',laser:'M13 2 4 14h7l-1 8 10-13h-7l0-7',dental:'M7 3c-5 0-4 7-2 11 1 2 1 7 3 7s2-8 4-8 2 8 4 8 2-5 3-7c2-4 3-11-2-11-3 0-4 2-5 2S10 3 7 3',physiotherapy:'M3 12h4l3-8 4 16 3-8h4',diagnostic:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 12h8m-4-4v8',procedure:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',custom:'M12 3 3 8l9 5 9-5-9-5M3 12l9 5 9-5M3 16l9 5 9-5'};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[template]}/></svg>;
}
const missingLabels:Record<string,[string,string]>={definition:['تعريف الخدمة','Service definition'],name:['الاسم','Name'],durationMinutes:['مدة الموعد','Duration'],price:['السعر','Price'],currency:['العملة','Currency'],category:['التصنيف','Category'],requiresRoom:['متطلبات الغرفة','Room requirement'],branchScope:['نطاق الفروع','Branch scope'],branchKey:['الفرع','Branch'],'definition.medicalScope':['مراجعة النطاق الطبي','Medical scope review'],'definition.unsupportedCapabilities':['طلب غير مدعوم','Unsupported request']};
export const missingLabel=(field:string,lang:Language)=>missingLabels[field]?.[lang==='ar'?0:1]??field;
/** Identical component in the wizard preview, services page and booking service step. */
export function ServiceCard({service,language='ar',draft=false,pending=false,branch,footer}:{service:PresentableService;language?:Language;draft?:boolean;pending?:boolean;branch?:string;footer?:ReactNode}) {
 const w=(ar:string,en:string)=>serviceWords(language,ar,en),d=service.definition;
 const missing=draft?missingServiceFields(service):[];
 const audience={all:w('للجميع','All audiences'),men:w('رجال','Men'),women:w('نساء','Women'),children:w('أطفال','Children'),unspecified:''}[d?.audience??'unspecified'];
 return <article className={`sv-card${pending?' sv-pending':''}`} data-template={d?.template??'custom'} data-testid="service-design-card" dir={language==='ar'?'rtl':'ltr'}>
   <div className="sv-card-head"><span className="sv-glyph"><ServiceGlyph template={d?.template}/></span><span className={`sv-state${draft?' sv-state-draft':''}`}>{pending?w('معاينة قيد التوليد','Generating preview'):draft?w('مسودة إعداد','Setup draft'):service.isActive===false?w('غير نشطة','Inactive'):w('خدمة العيادة','Clinic service')}</span></div>
   <p className="sv-eyebrow">{d?.section??service.category??w('خدمات العيادة','Clinic services')}</p>
   <h3 className="sv-title">{service.name||w('خدمتك الجديدة','Your new service')}</h3>
   {d?.description&&<p className="sv-description">{d.description}</p>}
   <div className="sv-tags">{audience&&<span>{audience}</span>}{d?.bodyArea&&<span>{d.bodyArea}</span>}{branch&&<span>{branch}</span>}{service.requiresRoom===true&&<span>{w('تحتاج غرفة','Room required')}</span>}</div>
   <div className="sv-metrics"><div><span>{w('مدة الموعد','Appointment duration')}</span><strong>{service.durationMinutes==null?w('غير محددة','Not specified'):<>{service.durationMinutes} <small>{w('دقيقة','min')}</small></>}</strong></div><div><span>{w('السعر','Price')}</span><strong>{service.price==null||service.price===''?w('غير محدد','Not specified'):<bdi>{service.price} <small>{service.currency||'—'}</small></bdi>}</strong></div></div>
   {!!d?.intakeFields.length&&<p className="sv-intake-note">{w('استمارة الحجز','Booking form')} · {d.intakeFields.length} {w('حقول مخصّصة','custom fields')}</p>}
   {missing.length>0&&<p className="sv-missing">{w('لاستكمال الإعداد: ','Still needed: ')}{missing.map(i=>missingLabel(i.field,language)).join(' · ')}</p>}
   {footer&&<div className="sv-card-footer">{footer}</div>}
 </article>;
}
