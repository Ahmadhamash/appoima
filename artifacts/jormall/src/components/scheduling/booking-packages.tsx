import { useEffect, useState } from 'react';
import { FormField, FormError } from '@/components/form-field';
import { CheckField, SelectField } from '@/components/setup/controls';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { useBookingPackages, useCustomerBilling, paymentMethods, methodNames } from '@/lib/packages-api';

export function addMoney(...values:string[]) {
  const total=values.reduce((sum,value)=>{const [whole,fraction='']=value.split('.');return sum+BigInt(whole!)*1000n+BigInt(fraction.padEnd(3,'0'));},0n);
  return `${total/1000n}.${String(total%1000n).padStart(3,'0')}`;
}
export function usePackageBooking(customerId:number|undefined,serviceId:number|undefined,enabled:boolean,requestedId?:number) {
  const options=useBookingPackages(customerId,serviceId,enabled),billing=useCustomerBilling(customerId??0,enabled);
  const [mode,setMode]=useState<'single'|'package'>('single'),[choice,setChoice]=useState(''),[rulesAccepted,setRulesAccepted]=useState(false),[eligibilityConfirmed,setEligibilityConfirmed]=useState(false);
  const [amount,setAmount]=useState('0'),[method,setMethod]=useState('cash');
  const [prefilled,setPrefilled]=useState('');
  const owned=billing.data?.packages.filter(p=>p.status==='active'&&(!p.expiresAt||Date.parse(p.expiresAt)>Date.now())&&p.items.some(i=>i.serviceId===serviceId&&(i.available??i.quantity-(i.used??0)-(i.reserved??0))>0))??[];
  const packages=options.data?.packages??[],hasChoices=packages.length>0||owned.length>0;
  const selectedPackage=mode==='package'?owned.find(p=>choice===`owned:${p.id}`):undefined;
  const purchase=mode==='package'?packages.find(p=>choice===`buy:${p.id}`):undefined;
  const quote=mode==='single'?options.data?.single:purchase?.quote;
  const rules=selectedPackage?.usageRules??quote?.usageRules??'',conditions=quote?.promotion?.eligibility.conditions??'';
  useEffect(()=>{setMode('single');setChoice('');setAmount('0');setMethod('cash');},[customerId,serviceId]);
  useEffect(()=>{setRulesAccepted(false);setEligibilityConfirmed(false);},[choice,mode,customerId,serviceId,rules,conditions,quote?.price,quote?.promotion?.id]);
  useEffect(()=>{const key=`${customerId}:${serviceId}:${requestedId}`;if(requestedId&&prefilled!==key&&owned.some(p=>p.id===requestedId)){setMode('package');setChoice(`owned:${requestedId}`);setPrefilled(key);}},[requestedId,customerId,serviceId,billing.data,prefilled]);
  useEffect(()=>{if(options.isSuccess&&billing.isSuccess&&!hasChoices)setMode('single');},[options.isSuccess,billing.isSuccess,hasChoices]);
  const selectionReady=mode==='single'?!!quote:!!selectedPackage||!!purchase&&!!options.data?.canPurchase;
  const paymentValid=!!selectedPackage||!purchase||/^\d{1,9}(?:\.\d{1,3})?$/.test(amount)&&Number(amount)<=Number(purchase.quote.price);
  const body=(followUp=false):Record<string,unknown>=>followUp?{}:selectedPackage?{packageId:selectedPackage.id,packageRulesAccepted:rulesAccepted}:purchase?{purchasePackage:{templateId:purchase.id,...(purchase.quote.promotion?{offerId:purchase.quote.promotion.id}:{}),expectedPrice:purchase.quote.price,rulesAccepted,eligibilityConfirmed,...(Number(amount)>0?{payment:{amount,method,reference:''}}:{})}}:quote?.promotion?{offerId:quote.promotion.id,expectedOfferPrice:quote.price,offerEligibilityConfirmed:eligibilityConfirmed}:{};
  return {serviceId,options,billing,mode,setMode,choice,setChoice,owned,packages,hasChoices,selectedPackage,purchase,quote,rules,conditions,rulesAccepted,setRulesAccepted,eligibilityConfirmed,setEligibilityConfirmed,amount,setAmount,method,setMethod,body,
    loading:options.isPending||billing.isPending,error:options.error??billing.error,
    selectionReady:options.isSuccess&&billing.isSuccess&&selectionReady&&paymentValid,
    ready:options.isSuccess&&billing.isSuccess&&selectionReady&&paymentValid&&(!rules||rulesAccepted)&&(!conditions||eligibilityConfirmed),
    servicePrice:mode==='package'?'0.000':quote?.price};
}
type Model=ReturnType<typeof usePackageBooking>;
export function PackageBookingChoices({model:m}:{model:Model}) {
  const {lang}=useI18n(),ar=lang==='ar',w=(a:string,e:string)=>ar?a:e,errorMessage=useErrorMessage();
  const cardClass=(selected:boolean)=>'block w-full space-y-2 rounded-xl border p-4 text-start '+(selected?'border-primary bg-primary/5 ring-1 ring-primary':'bg-card hover:border-primary/50');
  return <div className="space-y-3" data-testid="booking-package-choices">
    {m.loading?<p role="status">{w('تحميل الباقات والأسعار…','Loading packages and prices…')}</p>:m.error?<FormError message={errorMessage(m.error)}/>:m.hasChoices&&<>
      <div className="grid grid-cols-2 gap-3" role="group" aria-label={w('طريقة الحجز','Booking option')} data-testid="booking-payment-choice">{(['single','package'] as const).map(mode=><button key={mode} type="button" aria-pressed={m.mode===mode} className={cardClass(m.mode===mode)} onClick={()=>m.setMode(mode)} data-testid={`booking-type-${mode}`}><strong>{mode==='single'?w('جلسة واحدة','Single Session'):w('باقة','Package')}</strong>{mode==='single'&&<span className="block text-sm"><bdi>{m.options.data?.single.price} JOD</bdi>{m.options.data?.single.promotion&&` · ${m.options.data.single.promotion.name}`}</span>}</button>)}</div>
      {m.mode==='package'&&<div className="space-y-3" data-testid="booking-package-cards">
        {m.owned.map(p=><button type="button" key={`owned:${p.id}`} aria-pressed={m.choice===`owned:${p.id}`} onClick={()=>m.setChoice(`owned:${p.id}`)} className={cardClass(m.choice===`owned:${p.id}`)} data-testid={`booking-owned-package-${p.id}`}>
          <strong className="block">{p.name} · {w('باقة المريض','Patient’s package')}</strong><span className="block text-sm">{p.description}</span>
          <span className="block text-sm">{p.items.map(i=>`${i.name} × ${i.quantity}`).join(' · ')}</span>
          <span className="block font-semibold">{w('المتبقي','Remaining')}: {p.remaining} · {w('المحجوز','Reserved')}: {p.reserved??0} · {w('المتاح لهذه الخدمة','Available for this service')}: {p.items.find(i=>i.serviceId===m.serviceId)?.available??0}</span>
          <span className="block text-sm">{w('الجلسة مشمولة — بدون دفع جديد','Covered session — no new package charge')} · 0.000 JOD</span>
          <span className="block text-xs">{p.expiresAt?w('صالحة حتى','Valid until')+': '+new Intl.DateTimeFormat(ar?'ar-JO':'en-GB',{timeZone:'Asia/Amman',dateStyle:'medium'}).format(new Date(p.expiresAt)):w('بلا تاريخ انتهاء','No expiry')}</span>
          {p.invoice.promotion&&<span className="block text-xs">{w('العرض عند الشراء','Offer at purchase')}: {p.invoice.promotion.name}</span>}
          {p.usageRules&&<span className="block whitespace-pre-wrap text-xs">{p.usageRules}</span>}
        </button>)}
        {m.packages.map(p=><button type="button" key={`buy:${p.id}`} disabled={!m.options.data?.canPurchase} aria-pressed={m.choice===`buy:${p.id}`} onClick={()=>m.setChoice(`buy:${p.id}`)} className={cardClass(m.choice===`buy:${p.id}`)} data-testid={`booking-buy-package-${p.id}`}>
          <strong className="block">{p.name} · {w('شراء باقة وحجز أول جلسة','Buy package and book first session')}</strong><span className="block text-sm">{p.description}</span>
          <span className="block text-sm">{p.items.map(i=>`${i.name} × ${i.quantity}`).join(' · ')}</span>
          <span className="block font-semibold">{p.quote.totalSessions} {w('جلسات','sessions')} · <bdi>{p.quote.price} JOD</bdi>{p.quote.promotion&&<span className="ms-2 text-sm line-through text-muted-foreground"><bdi>{p.quote.originalPrice} JOD</bdi></span>}</span>
          {p.quote.promotion&&<span className="block text-sm">{w('العرض','Offer')}: {p.quote.promotion.name} · {w('الشراء حتى','Purchase until')} {p.quote.promotion.endsOn}</span>}
          <span className="block text-xs">{p.expiryDays?w(`صالحة ${p.expiryDays} يومًا من الشراء`,`Valid ${p.expiryDays} days from purchase`):w('بلا تاريخ انتهاء','No expiry')}</span>
          <span className="block whitespace-pre-wrap text-xs">{p.usageRules||w('تُحجز كل جلسة منفردة حسب التوفر، ضمن الخدمات والرصيد والصلاحية.','Book each session separately, subject to availability, included services, balance and validity.')}</span>
          {p.quote.promotion?.eligibility.conditions&&<span className="block whitespace-pre-wrap text-xs">{p.quote.promotion.eligibility.conditions}</span>}
        </button>)}
        {!m.options.data?.canPurchase&&m.packages.length>0&&<p className="text-xs">{w('شراء الباقات يحتاج صلاحية إدارة المرضى.','Package purchases require patient management permission.')}</p>}
      </div>}
      {m.purchase&&<div className="grid gap-3 sm:grid-cols-2 rounded-xl border p-3"><FormField label={w('المبلغ المحصل الآن (JOD)','Payment collected now (JOD)')} hint={w('سجّل مبلغًا فقط إذا استلمته بالفعل. الباقي يبقى على فاتورة الباقة.','Record only money actually received. The remainder stays on the package invoice.')} type="number" min="0" max={m.purchase.quote.price} step="0.001" value={m.amount} onChange={e=>m.setAmount(e.target.value)} required testId="booking-package-payment"/><SelectField label={w('طريقة الدفع','Payment method')} value={m.method} onChange={m.setMethod} testId="booking-package-payment-method">{paymentMethods.map(method=><option key={method} value={method}>{methodNames[method]![ar?0:1]}</option>)}</SelectField></div>}
    </>}
  </div>;
}
export function PackageBookingReview({model:m,extras,followUp}:{model:Model;extras:string;followUp:boolean}) {
  const {lang}=useI18n(),ar=lang==='ar',w=(a:string,e:string)=>ar?a:e;
  if(followUp)return null;
  const price=m.purchase?addMoney(m.purchase.quote.price,extras):null;
  return <section className="space-y-3 rounded-xl border bg-primary/5 p-3 text-sm" data-testid="booking-package-review">
    <h3 className="font-semibold">{m.selectedPackage?w('استخدام باقة المريض','Use patient package')+': '+m.selectedPackage.name:m.purchase?w('شراء باقة وحجز أول جلسة','Buy package and book first session')+': '+m.purchase.name:w('جلسة واحدة','Single session')}</h3>
    {m.purchase&&<><p>{m.purchase.quote.totalSessions} {w('جلسات — نحجز الآن جلسة واحدة، والباقي لاحقًا بشكل منفرد.','sessions — book one now, the rest individually later.')}</p><p className="font-bold" data-testid="booking-final-price">{w('الإجمالي: الباقة وإضافات الموعد','Total: package and appointment extras')}: <bdi>{price} JOD</bdi></p><p>{w('المحصل الآن','Collected now')}: {m.amount} JOD · {w('الباقي على الباقة','Package amount due')}: {(Number(m.purchase.quote.price)-Number(m.amount)).toFixed(3)} JOD</p></>}
    {m.selectedPackage&&<p>{w('أتعاب الجلسة مشمولة بالباقة ولن تُحصّل مرة ثانية. الإضافات مستقلة.','The session fee is covered and will not be charged again. Extras are separate.')} {w('المتاح','Available')}: {m.selectedPackage.available} · {w('رصيد فاتورة الباقة','Package invoice balance')}: {m.selectedPackage.invoice.financial.balance} JOD</p>}
    {m.quote?.promotion&&<p>{w('العرض المطبق','Applied offer')}: {m.quote.promotion.name} · <bdi>{m.quote.price} JOD</bdi> · {w('فترة الشراء','Purchase period')} {m.quote.promotion.startsOn} — {m.quote.promotion.endsOn}</p>}
    {(m.purchase||m.selectedPackage)&&<p>{m.selectedPackage?.expiresAt?w('صالحة حتى','Valid until')+': '+new Intl.DateTimeFormat(ar?'ar-JO':'en-GB',{timeZone:'Asia/Amman',dateStyle:'medium'}).format(new Date(m.selectedPackage.expiresAt)):m.purchase?.expiryDays?w(`صلاحية الجلسات ${m.purchase.expiryDays} يومًا من الشراء، مستقلة عن نهاية العرض.`,`Sessions remain valid ${m.purchase.expiryDays} days from purchase, independently of the offer end date.`):w('بلا تاريخ انتهاء','No expiry')}</p>}
    {m.rules&&<><p className="whitespace-pre-wrap">{m.rules}</p><CheckField label={w('راجعت قواعد الاستخدام وأوافق عليها','I reviewed and accept the package usage rules')} checked={m.rulesAccepted} onChange={m.setRulesAccepted} testId="booking-package-rules-accepted"/></>}
    {m.conditions&&<><p className="whitespace-pre-wrap">{m.conditions}</p><CheckField label={w('أكدت انطباق شروط العرض على المريض','I confirm the patient meets the offer conditions')} checked={m.eligibilityConfirmed} onChange={m.setEligibilityConfirmed} testId="booking-offer-eligibility-confirmed"/></>}
  </section>;
}
