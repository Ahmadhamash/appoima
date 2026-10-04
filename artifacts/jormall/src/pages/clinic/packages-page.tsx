import { useState } from 'react';
import { Link } from 'wouter';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form-field';
import { PackageEditor } from '@/components/operations/package-ledger';
import { OfferEditor } from '@/components/operations/offer-editor';
import { usePackageCatalog, useOfferCatalog, useBillingCommand, type PackageTemplate, type PromotionalOffer } from '@/lib/packages-api';
import { useI18n, useErrorMessage } from '@/lib/i18n';

export default function PackagesPage() {
  const {lang}=useI18n(),ar=lang==='ar',w=(a:string,e:string)=>ar?a:e,errorMessage=useErrorMessage();
  const packages=usePackageCatalog(),offers=useOfferCatalog(),command=useBillingCommand();
  const [tab,setTab]=useState<'packages'|'offers'>('packages'),[packageEdit,setPackageEdit]=useState<PackageTemplate|'new'|null>(null),[offerEdit,setOfferEdit]=useState<PromotionalOffer|'new'|null>(null);
  const status=(active:boolean)=>w(active?'نشط':'غير نشط',active?'Active':'Inactive');
  const activeButton=(item:PackageTemplate|PromotionalOffer,target:'packages'|'offers')=><Button type="button" size="sm" variant="outline" disabled={command.isPending} onClick={()=>command.mutate({path:`/clinic/billing/${target}/${item.id}/active`,body:{isActive:!item.isActive}})} data-testid={`${target}-active-${item.id}`}>{item.isActive?w('إيقاف','Deactivate'):w('تفعيل','Activate')}</Button>;
  const current=tab==='packages'?packages:offers;
  return <div className="space-y-5" data-testid="packages-offers-page">
    <Link href="/business" className="text-sm underline">{w('رجوع لإدارة العيادة','Back to clinic management')}</Link>
    <PageHeader title={w('الباقات والعروض','Packages & Offers')} description={w('أدر الباقات وأسعارها وصلاحية جلساتها والعروض وفترة شرائها.','Manage packages, session validity, offers and their purchase periods.')}/>
    <div className="flex flex-wrap items-center justify-between gap-3"><div role="tablist" className="flex gap-2" aria-label={w('الباقات والعروض','Packages and offers')}>{(['packages','offers'] as const).map(value=><Button key={value} role="tab" aria-selected={tab===value} variant={tab===value?'default':'outline'} onClick={()=>setTab(value)} data-testid={`catalog-tab-${value}`}>{value==='packages'?w('الباقات','Packages'):w('العروض','Offers')}</Button>)}</div>{current.data?.canManage&&<Button onClick={()=>tab==='packages'?setPackageEdit('new'):setOfferEdit('new')} data-testid={tab==='packages'?'new-package':'new-offer'}>{tab==='packages'?w('+ إنشاء باقة','+ Create package'):w('+ إنشاء عرض','+ Create offer')}</Button>}</div>
    <FormError message={command.error?errorMessage(command.error):undefined}/>
    {current.isPending?<p role="status">{w('تحميل…','Loading…')}</p>:current.isError?<FormError message={errorMessage(current.error)}/>:<div role="tabpanel" className="grid gap-4 md:grid-cols-2">
      {tab==='packages'?packages.data?.items.map(p=><article key={p.id} className="space-y-3 rounded-2xl border bg-card p-5" data-testid={`package-template-${p.id}`}>
        <div className="flex items-start justify-between gap-2"><h2 className="font-bold">{p.name}</h2><span className="rounded-full bg-muted px-3 py-1 text-xs">{status(p.isActive)}</span></div>
        {p.description&&<p className="whitespace-pre-wrap text-sm">{p.description}</p>}
        <ul className="text-sm space-y-1">{p.items.map(item=><li key={item.serviceId}>{item.name} × {item.quantity} {w('جلسة','sessions')}</li>)}</ul>
        <p className="font-semibold"><bdi>{(Number(p.originalPrice)-Number(p.discount)).toFixed(3)} JOD</bdi> · {p.items.reduce((n,i)=>n+i.quantity,0)} {w('جلسة','sessions')}</p>
        <p className="text-sm">{p.expiryDays?w(`صالحة ${p.expiryDays} يومًا من الشراء`,`Valid ${p.expiryDays} days from purchase`):w('بلا تاريخ انتهاء','No expiry')} · {w('تُحجز كل جلسة منفردة حسب التوفر','Each session is booked separately, subject to availability')}</p>
        <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{p.usageRules||w('الجلسات للخدمات المشمولة، ضمن الرصيد والصلاحية.','Sessions cover the included services within the balance and validity period.')}</p>
        {packages.data?.canManage&&<div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setPackageEdit(p)} data-testid={`package-edit-${p.id}`}>{w('تعديل','Edit')}</Button>{activeButton(p,'packages')}</div>}
      </article>):offers.data?.items.map(o=><article key={o.id} className="space-y-3 rounded-2xl border bg-card p-5" data-testid={`offer-${o.id}`}>
        <div className="flex justify-between gap-2"><h2 className="font-bold">{o.name}</h2><span className="rounded-full bg-muted px-3 py-1 text-xs">{status(o.isActive)}</span></div>
        <p className="font-semibold">{o.kind==='percent'?`${o.value}% ${w('خصم','off')}`:o.kind==='amount'?`${o.value} JOD ${w('خصم','off')}`:w(`السعر الترويجي ${o.value} JOD`,`Promotional price ${o.value} JOD`)}</p>
        <p className="text-sm">{w('فترة الشراء','Purchase period')}: <bdi>{o.startsOn} — {o.endsOn}</bdi></p>
        <p className="text-sm">{[...o.serviceIds.map(id=>packages.data?.services.find(s=>s.id===id)?.name??`#${id}`),...o.packageIds.map(id=>packages.data?.items.find(p=>p.id===id)?.name??`#${id}`)].join(' · ')}</p>
        <p className="text-sm">{o.eligibility.customerType==='all'?w('كل المرضى','All patients'):o.eligibility.customerType==='new'?w('بلا زيارات مكتملة','No completed visits'):w('لديه زيارات مكتملة','Has completed visits')} · {w('الحد الأدنى','Minimum price')} {o.eligibility.minimumSpend} JOD{o.eligibility.maxPerPatient&&` · ${w('أقصى عدد شراء لكل مريض','Purchases per patient')}: ${o.eligibility.maxPerPatient}`}</p>
        {o.eligibility.conditions&&<p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{o.eligibility.conditions}</p>}
        <p className="text-xs text-muted-foreground">{w('انتهاء العرض يوقف الشراء بالسعر الترويجي؛ جلسات الباقة المشتراة تبقى صالحة حسب مدة الباقة.','The offer end date stops promotional purchases. Purchased sessions keep the package validity period.')}</p>
        {offers.data?.canManage&&<div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setOfferEdit(o)} data-testid={`offer-edit-${o.id}`}>{w('تعديل','Edit')}</Button>{activeButton(o,'offers')}</div>}
      </article>)}
    </div>}
    {!current.isPending&&!current.isError&&!current.data?.items.length&&<p className="rounded-xl border border-dashed p-6 text-sm">{tab==='packages'?w('لا توجد باقات. أنشئ باقة وحدد خدماتها وجلساتها وسعرها.','No packages yet. Create a package with its services, sessions and price.'):w('لا توجد عروض. أنشئ عرضًا للخدمات أو الباقات.','No offers yet. Create an offer for services or packages.')}</p>}
    {packageEdit&&<PackageEditor template={packageEdit==='new'?undefined:packageEdit} onClose={()=>setPackageEdit(null)} onSaved={()=>{}}/>}
    {offerEdit&&<OfferEditor offer={offerEdit==='new'?undefined:offerEdit} onClose={()=>setOfferEdit(null)}/>}
  </div>;
}
