import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {FormError,FormField} from '@/components/form-field';
import {SelectField} from '@/components/setup/controls';
import {useI18n,useErrorMessage} from '@/lib/i18n';
import {useSchedulingCommand,type AppointmentDetail} from '@/lib/scheduling-api';
import {previewPayment,productAmount,productSelections,type Payment,type ProductCharge,type ProductOption} from '@/lib/patient-billing';

export function PaymentSummary({payment,title}:{payment:Payment;title?:string}){
  const {lang}=useI18n(),L=(ar:string,en:string)=>lang==='ar'?ar:en;
  return <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4" data-testid="patient-payment-summary">
    <h3 className="font-semibold">{title??L('المبلغ المطلوب من المريض','Patient payment')}</h3>
    {payment.products.length>0&&<ul className="space-y-2 text-sm">{payment.products.map(line=><li key={line.itemId} className="flex flex-wrap justify-between gap-2"><span lang={line.nameLang}>{line.name} <bdi dir="ltr">({line.quantity} {line.unit} × {line.unitPrice} JOD)</bdi></span><bdi dir="ltr">{line.amount||'—'} JOD</bdi></li>)}</ul>}
    <dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>{L('أتعاب الطبيب / الخدمة','Doctor / service fee')}</dt><dd dir="ltr" data-testid="patient-service-fee">{payment.serviceFee??'—'} JOD</dd></div><div className="flex justify-between gap-3"><dt>{L('المنتجات المحتسبة على المريض','Products charged to patient')}</dt><dd dir="ltr" data-testid="patient-product-total">{payment.productTotal||'—'} JOD</dd></div><div className="flex justify-between gap-3 border-t border-primary/20 pt-2 text-lg font-bold"><dt>{L('الإجمالي','Total')}</dt><dd dir="ltr" data-testid="patient-payment-total">{payment.total??'—'} JOD</dd></div></dl>
    <p className="text-xs text-muted-foreground">{L('الإجمالي = سعر المنتجات × الكمية + أتعاب الطبيب. مستهلكات العيادة مثل القفازات لا تُضاف إلى فاتورة المريض.','Total = product prices × quantities + doctor’s fee. Clinic consumables such as gloves are kept in clinic costs.')}</p>
    {payment.basis==='planned'&&payment.products.length>0&&<p className="text-xs text-muted-foreground">{L('هذه الكميات المتوقعة. عند تسجيل الاستخدام الفعلي، يُحدّث المبلغ حسب الكمية المستخدمة.','These are planned quantities. Recording actual usage updates the amount to match the quantities used.')}</p>}
  </div>;
}
export function ProductChargeFields({products,options,onChange}:{products:ProductCharge[];options:ProductOption[];onChange:(products:ProductCharge[])=>void}){
  const {lang}=useI18n(),L=(ar:string,en:string)=>lang==='ar'?ar:en;
  const available=options.filter(item=>!products.some(line=>line.itemId===item.id)&&item.unitPrice!==null);
  return <fieldset className="space-y-3" data-testid="patient-product-fields"><legend className="mb-2 text-sm font-semibold">{L('المنتجات المحتسبة على المريض','Products charged to patient')}</legend>
    {products.map(line=><div key={line.itemId} className="flex flex-wrap items-end gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium" lang={line.nameLang}>{line.name}</p><p className="text-xs text-muted-foreground" dir="ltr">{line.unitPrice} JOD / {line.unit}</p></div><div className="w-28"><FormField label={L('الكمية','Quantity')} type="number" min="0.001" max="999999999.999" step="0.001" required value={line.quantity} onChange={e=>onChange(products.map(old=>old.itemId===line.itemId?{...old,quantity:e.target.value,amount:productAmount(e.target.value,old.unitPrice)}:old))} testId={`product-quantity-${line.itemId}`}/></div><Button type="button" size="sm" variant="outline" onClick={()=>onChange(products.filter(old=>old.itemId!==line.itemId))} data-testid={`remove-product-${line.itemId}`}>{L('إزالة','Remove')}</Button></div>)}
    {available.length>0&&<SelectField label={L('إضافة منتج للمريض','Add a product charge')} value="" onChange={value=>{const item=available.find(item=>item.id===Number(value));if(item&&item.unitPrice!==null)onChange([...products,{itemId:item.id,name:item.name,nameLang:item.nameLang,unit:item.unit,quantity:'1.000',unitPrice:item.unitPrice,amount:productAmount('1',item.unitPrice)}]);}} testId="add-patient-product"><option value="">{L('اختر المنتج','Choose product')}</option>{available.map(item=><option key={item.id} value={item.id}>{item.name} · {item.unitPrice} JOD / {item.unit}</option>)}</SelectField>}
    {!products.length&&<p className="text-xs text-muted-foreground">{L('لا يوجد سعر منتجات إضافي. سيُدفع سعر الخدمة فقط.','No additional product charges. The patient pays the service fee only.')}</p>}
  </fieldset>;
}
export function AppointmentPayment({appointment:a}:{appointment:AppointmentDetail}){
  const {lang}=useI18n(),errorText=useErrorMessage(),[editing,setEditing]=useState(false),[products,setProducts]=useState(a.billing?.products??[]),command=useSchedulingCommand(()=>setEditing(false));
  const pricing=useQuery({queryKey:['scheduling','product-options',a.id],queryFn:()=>api<{options:ProductOption[]}>(`/clinic/appointments/${a.id}/product-options`),enabled:a.canEditCharge&&editing});
  const payment=a.billing??previewPayment(a.chargePrice,[]);
  return <section className="space-y-3" data-testid="appointment-payment"><PaymentSummary payment={editing?previewPayment(a.chargePrice,products,'manual'):payment}/>
    {a.canEditCharge&&!editing&&<Button type="button" variant="outline" onClick={()=>setEditing(true)} data-testid="edit-appointment-products">{lang==='ar'?'تعديل المنتجات والكميات':'Edit products and quantities'}</Button>}
    {editing&&<form className="space-y-3 rounded-xl border p-4" onSubmit={e=>{e.preventDefault();command.mutate({path:`/clinic/appointments/${a.id}/products`,body:{items:productSelections(products),expectedVersion:a.version}});}}><fieldset disabled={command.isPending} className="space-y-3">{pricing.isPending?<p role="status">{lang==='ar'?'جارٍ تحميل المنتجات…':'Loading products…'}</p>:pricing.error?<FormError message={errorText(pricing.error)}/>:<ProductChargeFields products={products} options={pricing.data?.options??[]} onChange={setProducts}/>}<FormError message={command.error?errorText(command.error):undefined}/><div className="flex gap-2"><Button type="submit" disabled={!pricing.isSuccess||products.some(line=>!line.amount)} data-testid="save-appointment-products">{lang==='ar'?'حفظ المنتجات':'Save product charges'}</Button><Button type="button" variant="outline" onClick={()=>setEditing(false)}>{lang==='ar'?'إلغاء':'Cancel'}</Button></div></fieldset></form>}
  </section>;
}
