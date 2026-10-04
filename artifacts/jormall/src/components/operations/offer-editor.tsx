import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FormField, FormError } from '@/components/form-field';
import { SelectField, TextareaField } from '@/components/setup/controls';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { usePackageCatalog, useBillingCommand, type PromotionalOffer, type OfferEligibility } from '@/lib/packages-api';
import { localDate } from '@/lib/scheduling-api';

export function OfferEditor({offer,onClose}:{offer?:PromotionalOffer;onClose:()=>void}) {
  const {lang,dir}=useI18n(),ar=lang==='ar',w=(a:string,e:string)=>ar?a:e,errorMessage=useErrorMessage(),catalog=usePackageCatalog();
  const [name,setName]=useState(offer?.name??''),[kind,setKind]=useState<PromotionalOffer['kind']>(offer?.kind??'percent'),[value,setValue]=useState(offer?.value??'10');
  const [serviceIds,setServiceIds]=useState(offer?.serviceIds??[]),[packageIds,setPackageIds]=useState(offer?.packageIds??[]);
  const [startsOn,setStartsOn]=useState(offer?.startsOn??localDate('Asia/Amman')),[endsOn,setEndsOn]=useState(offer?.endsOn??localDate('Asia/Amman'));
  const [eligibility,setEligibility]=useState<OfferEligibility>(offer?.eligibility??{customerType:'all',minimumSpend:'0',maxPerPatient:null,conditions:''});
  const command=useBillingCommand(onClose);
  const toggle=(ids:number[],id:number)=>ids.includes(id)?ids.filter(v=>v!==id):[...ids,id];
  return <Dialog open onOpenChange={open=>{if(!open&&!command.isPending)onClose();}}><DialogContent dir={dir} className="max-w-2xl max-h-[90dvh] overflow-y-auto" data-testid="offer-editor">
    <DialogTitle>{offer?w('تعديل العرض','Edit offer'):w('إنشاء عرض','Create offer')}</DialogTitle>
    <DialogDescription>{w('فترة شراء العرض مستقلة عن صلاحية جلسات الباقة؛ تنتهي صلاحية الجلسات حسب الباقة المشتراة.','The offer purchase period is separate from session validity. Purchased sessions retain their package validity.')}</DialogDescription>
    <form onSubmit={e=>{e.preventDefault();command.mutate({path:offer?`/clinic/billing/offers/${offer.id}/edit`:'/clinic/billing/offers',body:{name,kind,value,serviceIds,packageIds,startsOn,endsOn,eligibility}});}}><fieldset disabled={command.isPending} className="space-y-4">
      <FormField label={w('اسم العرض','Offer name')} value={name} onChange={e=>setName(e.target.value)} required maxLength={160} testId="offer-name"/>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={w('نوع العرض','Offer type')} value={kind} onChange={v=>setKind(v as typeof kind)} testId="offer-kind"><option value="percent">{w('خصم بالنسبة المئوية','Percentage discount')}</option><option value="amount">{w('خصم بمبلغ','Discount amount')}</option><option value="price">{w('سعر ترويجي','Promotional price')}</option></SelectField>
        <FormField label={kind==='percent'?w('الخصم (%)','Discount (%)'):w('المبلغ (JOD)','Amount (JOD)')} type="number" min="0" max={kind==='percent'?'100':'999999999.999'} step="0.001" value={value} onChange={e=>setValue(e.target.value)} required testId="offer-value"/>
        <FormField label={w('بداية فترة الشراء','Purchase period starts')} type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)} required testId="offer-start"/>
        <FormField label={w('نهاية فترة الشراء','Purchase period ends')} type="date" min={startsOn} value={endsOn} onChange={e=>setEndsOn(e.target.value)} required testId="offer-end"/>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{(['service','package'] as const).map(target=><fieldset key={target} className="min-w-0 rounded-xl border p-3"><legend className="px-1 text-sm font-semibold">{target==='service'?w('الخدمات / الخدمات الفرعية','Services / subservices'):w('الباقات','Packages')}</legend><div className="max-h-48 overflow-y-auto space-y-2">{(target==='service'?catalog.data?.services:catalog.data?.items)?.map(item=><label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" checked={(target==='service'?serviceIds:packageIds).includes(item.id)} onChange={()=>target==='service'?setServiceIds(toggle(serviceIds,item.id)):setPackageIds(toggle(packageIds,item.id))} data-testid={`offer-${target}-${item.id}`}/><span>{item.name}</span></label>)}</div></fieldset>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={w('من يستفيد من العرض؟','Patient eligibility')} value={eligibility.customerType} onChange={v=>setEligibility({...eligibility,customerType:v as OfferEligibility['customerType']})} testId="offer-customer-type"><option value="all">{w('كل المرضى','All patients')}</option><option value="new">{w('مرضى بلا زيارات مكتملة','No completed visits')}</option><option value="existing">{w('مرضى لديهم زيارات مكتملة','Has completed visits')}</option></SelectField>
        <FormField label={w('الحد الأدنى للسعر قبل العرض (JOD)','Minimum price before offer (JOD)')} type="number" min="0" step="0.001" value={eligibility.minimumSpend} onChange={e=>setEligibility({...eligibility,minimumSpend:e.target.value})} required testId="offer-minimum"/>
        <FormField label={w('أقصى عدد شراء لكل مريض (اختياري)','Purchases per patient (optional)')} type="number" min="1" max="1000" step="1" value={eligibility.maxPerPatient??''} onChange={e=>setEligibility({...eligibility,maxPerPatient:e.target.value?Number(e.target.value):null})} testId="offer-limit"/>
      </div>
      <TextareaField label={w('شروط إضافية للأهلية','Additional eligibility conditions')} value={eligibility.conditions} onChange={conditions=>setEligibility({...eligibility,conditions})} maxLength={2000} hint={w('سيُطلب من الموظف تأكيد انطباق هذه الشروط قبل الشراء.','Staff must confirm these additional conditions before purchase.')} testId="offer-conditions"/>
      <FormError message={command.error?errorMessage(command.error):catalog.error?errorMessage(catalog.error):undefined}/>
      <div className="flex gap-2"><Button type="submit" disabled={!name.trim()||!value||!serviceIds.length&&!packageIds.length||endsOn<startsOn} data-testid="offer-save">{w('حفظ العرض','Save offer')}</Button><Button type="button" variant="outline" onClick={onClose}>{w('إلغاء','Cancel')}</Button></div>
    </fieldset></form>
  </DialogContent></Dialog>;
}
