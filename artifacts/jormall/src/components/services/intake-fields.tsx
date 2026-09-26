import { useId } from 'react';
import { intakeIssues, type ServiceDefinition, type IntakeAnswers } from '@workspace/service-definition';
import './services.css';
/** No HTML or expressions are interpreted. Values are normal React text and typed controls. */
export function IntakeFields({definition,answers,onChange,language='ar',preview=false,showErrors=false}:{definition:ServiceDefinition|null|undefined;answers:IntakeAnswers;onChange:(value:IntakeAnswers)=>void;language?:'ar'|'en';preview?:boolean;showErrors?:boolean}) {
 const prefix=useId(),fields=definition?.intakeFields??[],w=(a:string,e:string)=>language==='ar'?a:e;
 const issues=showErrors?intakeIssues(definition,answers):[];
 if(!fields.length)return null;
 return <section className="sv-intake" aria-label={w('استمارة الخدمة','Service intake')}>
   <h3>{preview?w('كما ستظهر أسئلة الحجز','Booking form preview'):w('معلومات الخدمة','Service information')}</h3>
   <p className="sv-help">{preview?w('للمعاينة فقط؛ لا تُحفظ هذه الإجابات.','Preview only; these answers are not saved.'):w('هذه البيانات للمخوّلين بمتابعة الموعد فقط. لا تُرسل إلى مساعد إعداد العيادة.','Visible to authorized appointment staff only. Not sent to the setup assistant.')}</p>
   {fields.map(field=>{const id=`${prefix}-${field.id}`,value=answers[field.id],error=issues.find(i=>i.field===field.id);const set=(v:IntakeAnswers[string])=>onChange({...answers,[field.id]:v});
    return <div className="sv-field" key={field.id}><label htmlFor={id}>{field.label||w('اسم الحقل','Field label')}{field.required&&<span aria-label={w('مطلوب','Required')}> *</span>}</label>
     {field.type==='long_text'?<textarea id={id} maxLength={2000} value={typeof value==='string'?value:''} onChange={e=>set(e.target.value)} aria-invalid={!!error}/>
      :field.type==='select'?<select id={id} value={typeof value==='string'?value:''} onChange={e=>set(e.target.value||null)} aria-invalid={!!error}><option value="">{w('اختر إجابة','Select an answer')}</option>{field.options.map((v,i)=><option key={i}>{v}</option>)}</select>
      :field.type==='boolean'?<select id={id} value={typeof value==='boolean'?String(value):''} onChange={e=>set(e.target.value===''?null:e.target.value==='true')} aria-invalid={!!error}><option value="">{w('اختر إجابة','Select an answer')}</option><option value="true">{w('نعم','Yes')}</option><option value="false">{w('لا','No')}</option></select>
      :<input id={id} type={field.type==='number'?'number':'text'} maxLength={240} value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>set(field.type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value)} aria-invalid={!!error}/>}
     {field.help&&<p className="sv-help">{field.help}</p>}{error&&<p className="sv-error">{w('أكمل هذا الحقل بقيمة صحيحة.','Complete this field with a valid value.')}</p>}
    </div>;
   })}
 </section>;
}
