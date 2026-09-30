import { useEffect,useRef,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/setup-api';
import { useI18n,useErrorMessage } from '@/lib/i18n';
import { queryString,formatAppointmentTime,type AppointmentDetail } from '@/lib/scheduling-api';
import { useOperationsCommand,consumptionBody,emptyConsumption,type ConsumptionDraft,type ConsumptionView,type InventoryItem,type Page,type ActualLine } from '@/lib/operations-api';
import { SelectField,CheckField,EnteredName } from '@/components/setup/controls';
import { FormError,FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
export function ConsumptionFields({branchId,roomId,value,onChange,appointmentId,onDefaultsReady}:{appointmentId?:number;onDefaultsReady?:(ready:boolean)=>void;branchId:number;roomId?:number|null;value:ConsumptionDraft;onChange:(v:ConsumptionDraft)=>void}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage(),[search,setSearch]=useState(''),[debounced,setDebounced]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>{setDebounced(search);setPage(1);setSelected('');},250);return()=>clearTimeout(timer);},[search]);
  const initialized=useRef(false),defaults=useQuery({queryKey:['operations','consumption',appointmentId],queryFn:()=>api<ConsumptionView>(`/clinic/appointments/${appointmentId}/consumption`),enabled:Boolean(appointmentId)});
  useEffect(()=>{if(!appointmentId){onDefaultsReady?.(true);return;}onDefaultsReady?.(Boolean(defaults.data)&&!defaults.isError);if(defaults.data&&!initialized.current){initialized.current=true;if(!value.items.length&&!value.confirmNoItems)onChange({confirmNoItems:false,items:(defaults.data.defaults??[]).map(line=>({...line,itemId:line.id}))});}},[appointmentId,defaults.data,defaults.isError]);
  const catalog=useQuery({queryKey:['inventory','catalog'],queryFn:()=>api<{movementMode:'branch'|'room'}>('/clinic/inventory/catalog')});
  const locationId=catalog.data?.movementMode==='room'?roomId:null;
  const q=useQuery({queryKey:['operations','inventory','consumption-picker',branchId,catalog.data?.movementMode,locationId,debounced,page],enabled:Boolean(catalog.data),queryFn:()=>api<Page<InventoryItem>>(`/clinic/inventory/items?${queryString({branchId,...(locationId?{roomId:locationId}:catalog.data?.movementMode==='room'?{location:'store'}:{}),search:debounced,page,pageSize:20})}`)});
  const add=()=>{const item=q.data?.items.find(i=>String(i.id)===selected);if(!item||value.items.some(i=>i.itemId===item.id))return;
    onChange({confirmNoItems:false,items:[...value.items,{id:item.id,itemId:item.id,name:item.name,nameLang:item.nameLang,unit:item.unit,quantity:''}]});setSelected('');};
  return <div className="space-y-4 rounded-lg border p-3" data-testid="consumption-fields"><h3 className="font-semibold">{t('p4.actualMaterials')}</h3><p className="text-xs text-muted-foreground">{lang==='ar'?'الكميات الافتراضية من الخدمة ظاهرة أدناه. عدّلها حسب الاستخدام الفعلي لهذا المريض قبل الموافقة.':'Default service quantities appear below. Edit them to match the actual usage for this patient before approving.'}</p>{catalog.data?.movementMode==='room'&&<p className="text-xs text-muted-foreground">{lang==='ar'?'يُخصم الاستهلاك من موقع الموعد. انقل الكمية إلى الغرفة قبل تسجيل الاستهلاك.':'Consumption is deducted from the appointment location. Transfer stock into the room before recording usage.'}</p>}
    {appointmentId&&defaults.isPending&&<p role="status">{t('common.loading')}</p>}{defaults.error&&<FormError message={errorMessage(defaults.error)}/>}<CheckField label={t('p4.noMaterials')} checked={value.confirmNoItems} disabled={value.items.length>0} onChange={v=>onChange({...value,confirmNoItems:v})} testId="consumption-no-materials"/>
    {!value.confirmNoItems&&<><FormField label={t('p4.searchItems')} type="search" value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} testId="consumption-item-search"/>
      {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:<>
        <SelectField label={t('p4.selectItem')} value={selected} onChange={setSelected} testId="consumption-item"><option value="">{t('p4.choose')}</option>{q.data?.items.filter(i=>!value.items.some(v=>v.itemId===i.id)).map(i=><option key={i.id} value={i.id} lang={i.nameLang}>{i.name} · {t(`p4.units.${i.unit}`)} · {t('p4.balance')}: {i.balance}</option>)}</SelectField>
        {!q.data?.items.length&&<p className="text-sm text-muted-foreground">{t('p4.inventoryEmpty')}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!selected||value.items.length>=100} onClick={add} data-testid="consumption-add-item">{t('p4.addMaterial')}</Button>
          <Button type="button" variant="ghost" disabled={page<=1} onClick={()=>{setPage(page-1);setSelected('');}} data-testid="consumption-items-prev">{t('p2.previous')}</Button><Button type="button" variant="ghost" disabled={!q.data||page*20>=q.data.total} onClick={()=>{setPage(page+1);setSelected('');}} data-testid="consumption-items-next">{t('p2.next')}</Button></div>
      </>}
      <div className="space-y-3">{value.items.map(item=><div key={item.itemId} className="space-y-2 rounded-lg border p-3" data-testid={`consumption-line-${item.itemId}`}><p className="text-sm font-medium"><EnteredName item={item}/> · {t(`p4.units.${item.unit}`)}</p><FormField label={t('p4.quantity')} type="number" inputMode="decimal" min="0.001" max="9000000000" step="0.001" required value={item.quantity} onChange={e=>onChange({...value,items:value.items.map(i=>i.itemId===item.itemId?{...i,quantity:e.target.value}:i)})} testId={`consumption-quantity-${item.itemId}`}/><Button type="button" variant="ghost" size="sm" onClick={()=>onChange({...value,items:value.items.filter(i=>i.itemId!==item.itemId)})} data-testid={`consumption-remove-${item.itemId}`}>{t('p4.removeMaterial')}</Button></div>)}</div>
    </>}
  </div>;
}
export function AppointmentConsumption({appointment:a}:{appointment:AppointmentDetail}) {
  const {user}=useAuth(),{t,lang}=useI18n(),errorMessage=useErrorMessage(),allowed=can(user,'inventory.read'),[value,setValue]=useState(emptyConsumption),[approved,setApproved]=useState(false),[ready,setReady]=useState(false);
  const q=useQuery({queryKey:['operations','consumption',a.id],queryFn:()=>api<ConsumptionView>(`/clinic/appointments/${a.id}/consumption`),enabled:allowed&&a.status==='completed'});
  const command=useOperationsCommand();
  if(!allowed||a.status!=='completed')return null;
  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-testid="appointment-consumption"><h2 className="font-semibold">{t('p4.actualMaterials')}</h2>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:q.data?.recorded?<div className="space-y-3" data-testid="consumption-recorded"><p role="status" className="font-medium">{t('p4.consumptionRecorded')}</p><p className="text-xs text-muted-foreground">{t('p4.materialsLockedHint')}</p>{q.data.recordedAt&&<time className="text-xs" dateTime={q.data.recordedAt}>{formatAppointmentTime(q.data.recordedAt,a.branch.timeZone,lang,true)}</time>}
      {!q.data.lines.length?<p className="text-sm">{t('p4.noMaterialsRecorded')}</p>:<ul className="space-y-2 text-sm">{q.data.lines.map(line=><li key={line.id}><EnteredName item={line}/> · <bdi dir="ltr">{line.quantity}</bdi> {t(`p4.units.${line.unit}`)}</li>)}</ul>}
    </div>:<><p className="text-sm text-muted-foreground">{t('p4.consumptionPending')}</p>{q.data?.canRecord&&<form onSubmit={e=>{e.preventDefault();command.mutate({path:`/clinic/appointments/${a.id}/consumption`,body:{consumption:consumptionBody(value)}});}} className="space-y-4"><fieldset disabled={command.isPending} className="space-y-4"><ConsumptionFields appointmentId={a.id} onDefaultsReady={setReady} branchId={a.branchId} roomId={a.roomId} value={value} onChange={next=>{setValue(next);setApproved(false);}}/><CheckField label={lang==='ar'?'أوافق على الكميات الفعلية المستخدمة لهذا المريض':'I approve the actual quantities used for this patient'} checked={approved} onChange={setApproved} testId="actual-consumption-approval"/><FormError message={command.error?errorMessage(command.error):undefined}/><Button type="submit" disabled={!approved||!ready||(!value.items.length&&!value.confirmNoItems)} data-testid="save-actual-consumption">{command.isPending?t('common.loading'):t('p4.saveConsumption')}</Button></fieldset></form>}</>}
  </section>;
}
export function ServiceActualUse({serviceId}:{serviceId:number}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage(),[page,setPage]=useState(1);
  const q=useQuery({queryKey:['operations','service-use',serviceId,page],queryFn:()=>api<Page<ActualLine>>(`/clinic/services/${serviceId}/actual-use?page=${page}&pageSize=3`)});
  return <div className="space-y-2 text-xs" data-testid={`service-actual-use-${serviceId}`}><p className="font-medium">{t('p2.actualUse')}</p>
    {q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!q.data?.items.length?<p>{t('p4.actualEmpty')}</p>:<>
      <ul className="space-y-1">{q.data.items.map(item=><li key={item.id}><EnteredName item={item}/> · <bdi dir="ltr">{item.quantity}</bdi> {t(`p4.units.${item.unit}`)}{item.branch&&<> · <EnteredName item={item.branch}/></>}</li>)}</ul>
      {q.data.total>3&&<div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="ghost" disabled={page<=1} onClick={()=>setPage(page-1)} data-testid={`actual-use-prev-${serviceId}`}>{t('p2.previous')}</Button><span>{t('p2.page',{page,pages:Math.ceil(q.data.total/3)})}</span><Button type="button" size="sm" variant="ghost" disabled={page*3>=q.data.total} onClick={()=>setPage(page+1)} data-testid={`actual-use-next-${serviceId}`}>{t('p2.next')}</Button></div>}
    </>}<p className="text-muted-foreground">{t('p4.actualTotalsHint')}</p>
  </div>;
}
