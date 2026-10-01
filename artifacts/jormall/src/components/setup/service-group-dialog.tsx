import {useState,type FormEvent} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {FormError} from '@/components/form-field';
import {api,ApiError} from '@/lib/api';
import {useI18n,useErrorMessage} from '@/lib/i18n';
import type {Options,RecordItem,ServiceGroup} from '@/lib/setup-api';
import {CheckField,MultiPicker,SelectField,controlClass} from './controls';
import {EquipmentPicker} from './equipment-picker';

export type ServiceGroupAction={kind:'edit'|'delete';id:number};
type Row={record:RecordItem;duration:string;price:string};
function GroupEditForm({group,options,onSaved,onCancel,onBusy}:{group:ServiceGroup;options:Options;onSaved:(message:string)=>void;onCancel:()=>void;onBusy:(busy:boolean)=>void}){
  const {lang,t}=useI18n(),errorMessage=useErrorMessage(),ar=lang==='ar';
  const [name,setName]=useState(group.name),[rows,setRows]=useState<Row[]>(()=>group.items.map(record=>({record:structuredClone(record),duration:String(record.durationMinutes),price:record.price??'0'}))),[validation,setValidation]=useState('');
  const mutation=useMutation({mutationFn:(services:unknown[])=>api(`/clinic/services/${group.id}/group`,{method:'PUT',body:{name:name.trim(),revision:group.revision,services}}),onMutate:()=>onBusy(true),onSettled:()=>onBusy(false),onSuccess:()=>onSaved(ar?'تم حفظ الخدمة الرئيسية وكل خدماتها الفرعية.':'Main service and subservices saved.')});
  const change=(id:number,fields:Partial<RecordItem>)=>{setRows(old=>old.map(row=>row.record.id===id?{...row,record:{...row.record,...fields}}:row));setValidation('');};
  const error=mutation.error instanceof ApiError&&mutation.error.code==='operation_changed'?(ar?'تغيّرت هذه الخدمة. أغلق النموذج وافتحه مجددًا لمراجعة أحدث البيانات.':'This service has changed. Close and reopen the form to review the latest details.'):mutation.error?errorMessage(mutation.error):undefined;
  function submit(event:FormEvent){
    event.preventDefault();
    if(!name.trim()||name.trim().length>80){setValidation(ar?'اكتب اسم الخدمة الرئيسية (حتى 80 حرفًا).':'Enter a main service name (up to 80 characters).');return;}
    if(rows.some(({record,duration,price})=>!record.name.trim()||record.name.trim().length>120||!/^\d+$/.test(duration)||Number(duration)<1||Number(duration)>1440||!/^\d{1,9}(\.\d{1,3})?$/.test(price.trim()))){setValidation(ar?'راجع اسم ومدة وسعر كل خدمة فرعية.':'Check the name, duration and price of every subservice.');return;}
    const names=rows.map(({record})=>`${record.branchId??'all'}:${record.name.trim().toLocaleLowerCase()}`);
    if(new Set(names).size!==names.length){setValidation(ar?'أسماء الخدمات الفرعية في الفرع نفسه يجب أن تكون مختلفة.':'Subservice names in the same branch must be unique.');return;}
    setValidation('');
    mutation.mutate(rows.map(({record,duration,price})=>({id:record.id,service:{name:record.name.trim(),nameLang:record.nameLang,branchId:record.branchId??null,durationMinutes:Number(duration),price:price.trim(),currency:record.currency??'JOD',category:name.trim(),definition:record.definition??null,isActive:record.isActive??true,requiresRoom:record.requiresRoom??false,followUpEnabled:record.followUpEnabled??false,requiredEquipment:record.requiredEquipment??[],employeeIds:record.employeeIds??[]}})));
  }
  return <form onSubmit={submit} noValidate className="space-y-5" data-testid="form-main-service">
    <FormError message={validation||error}/>
    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
      <label className="block space-y-2 text-sm font-semibold">{ar?'اسم الخدمة الرئيسية':'Main service name'} *<input value={name} onChange={event=>{setName(event.target.value);setValidation('');}} maxLength={80} className={controlClass} dir="auto" data-testid="edit-main-service-name"/></label>
      <h3 className="text-sm font-semibold">{ar?'الخدمات الفرعية':'Subservices'} ({rows.length})</h3>
      {rows.map(({record,duration,price},index)=><section key={record.id} className="min-w-0 space-y-4 rounded-xl border bg-card p-4" data-testid={`edit-subservice-${record.id}`}>
        <h4 className="text-sm font-semibold">{ar?'خدمة فرعية':'Subservice'} {index+1}</h4>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block min-w-0 space-y-1 text-sm">{ar?'الاسم':'Name'} *<input value={record.name} onChange={event=>change(record.id,{name:event.target.value})} maxLength={120} className={controlClass} dir="auto" data-testid={`edit-subservice-name-${record.id}`}/></label>
          <label className="block min-w-0 space-y-1 text-sm">{ar?'المدة (دقيقة)':'Duration (minutes)'} *<input type="number" min={1} max={1440} step={1} value={duration} onChange={event=>{setRows(old=>old.map(row=>row.record.id===record.id?{...row,duration:event.target.value}:row));setValidation('');}} className={controlClass} dir="ltr" data-testid={`edit-subservice-duration-${record.id}`}/></label>
          <label className="block min-w-0 space-y-1 text-sm">{ar?'السعر (JOD)':'Price (JOD)'} *<input inputMode="decimal" value={price} onChange={event=>{setRows(old=>old.map(row=>row.record.id===record.id?{...row,price:event.target.value}:row));setValidation('');}} className={controlClass} dir="ltr" data-testid={`edit-subservice-price-${record.id}`}/></label>
        </div>
        <details><summary className="focus-ring cursor-pointer rounded text-sm font-medium" data-testid={`edit-subservice-settings-${record.id}`}>{ar?'الفرع والتصنيف والموظفون وإعدادات الخدمة':'Branch, category, staff and service settings'}</summary><div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label={ar?'الفرع':'Branch'} value={record.branchId??''} onChange={value=>change(record.id,{branchId:value?Number(value):null})} testId={`edit-subservice-branch-${record.id}`}><option value="">{ar?'كل الفروع':'All branches'}</option>{options.branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField></div>
          <div className="flex flex-wrap gap-x-5"><CheckField label={t('p2.fields.isActive')} checked={record.isActive??true} onChange={value=>change(record.id,{isActive:value})} testId={`edit-subservice-active-${record.id}`}/><CheckField label={t('p2.fields.requiresRoom')} checked={record.requiresRoom??false} onChange={value=>change(record.id,{requiresRoom:value})} testId={`edit-subservice-room-${record.id}`}/><CheckField label={ar?'السماح بموعد متابعة':'Allow follow-up appointments'} checked={record.followUpEnabled??false} onChange={value=>change(record.id,{followUpEnabled:value})} testId={`edit-subservice-follow-up-${record.id}`}/></div>
          <MultiPicker label={t('p2.fields.employeeIds')} options={options.employees.filter(employee=>record.branchId==null||employee.branchSchedules?.some(shift=>shift.branchId===record.branchId)||employee.branchId==null||employee.branchId===record.branchId)} selected={record.employeeIds??[]} onChange={value=>change(record.id,{employeeIds:value})} testId={`edit-subservice-staff-${record.id}`}/>
          <div className="space-y-2"><p className="text-sm font-medium">{ar?'المعدات المطلوبة':'Required equipment'}</p><EquipmentPicker value={record.requiredEquipment??[]} onChange={value=>change(record.id,{requiredEquipment:value})} lang={lang} suggestions={record.requiredEquipment}/></div>
        </div></details>
      </section>)}
    </fieldset>
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3"><Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="cancel-main-service-edit">{t('common.cancel')}</Button><Button type="submit" disabled={mutation.isPending} data-testid="save-main-service">{mutation.isPending?t('common.loading'):ar?'حفظ':'Save'}</Button></div>
  </form>;
}
export function ServiceGroupDialog({action,options,onClose,onSaved}:{action:ServiceGroupAction|null;options:Options;onClose:()=>void;onSaved:(message:string)=>void}){
  const {lang,dir,t}=useI18n(),errorMessage=useErrorMessage(),ar=lang==='ar';
  const [saving,setSaving]=useState(false);
  const q=useQuery({queryKey:['setup','services','group',action?.id],queryFn:()=>api<ServiceGroup>(`/clinic/services/${action!.id}/group`),enabled:!!action,staleTime:0,retry:false,refetchOnWindowFocus:false});
  const mutation=useMutation({mutationFn:()=>api(`/clinic/services/${action!.id}/group`,{method:'DELETE',body:{confirmed:true,revision:q.data!.revision}}),onSuccess:()=>onSaved(ar?'تم حذف الخدمة الرئيسية وكل خدماتها الفرعية.':'Main service and all subservices deleted.')});
  const load=q.isPending||q.isFetching?<p role="status">{t('common.loading')}</p>:q.isError?<><FormError message={errorMessage(q.error)}/><Button type="button" variant="outline" onClick={()=>void q.refetch()}>{t('common.retry')}</Button></>:null;
  if(!action)return null;
  if(action.kind==='edit')return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}><DialogContent dir={dir} className="w-[calc(100%_-_1rem)] max-w-3xl max-h-[90dvh] overflow-y-auto" onInteractOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>{if(saving)event.preventDefault();}}><DialogHeader className="text-start"><DialogTitle>{ar?'تعديل الخدمة الرئيسية':'Edit main service'}</DialogTitle><DialogDescription>{ar?'عدّل الخدمة الرئيسية وكل خدماتها الفرعية، ثم احفظ التغييرات معًا.':'Edit the main service and all its subservices, then save the changes together.'}</DialogDescription></DialogHeader>{load??(q.data&&<GroupEditForm key={q.data.revision} group={q.data} options={options} onSaved={onSaved} onCancel={onClose} onBusy={setSaving}/>)}</DialogContent></Dialog>;
  const changed=mutation.error instanceof ApiError&&mutation.error.code==='operation_changed';
  return <AlertDialog open onOpenChange={open=>{if(!open&&!mutation.isPending)onClose();}}><AlertDialogContent dir={dir} className="w-[calc(100%_-_2rem)] rounded-xl" data-testid="delete-main-service-confirmation"><AlertDialogHeader className="text-start"><AlertDialogTitle>{ar?'حذف الخدمة الرئيسية':'Delete main service'}{q.data?`: ${q.data.name}`:''}</AlertDialogTitle><AlertDialogDescription>{q.data?(ar?`سيتم حذف الخدمة الرئيسية «${q.data.name}» وكل خدماتها الفرعية (${q.data.items.length}) من قائمة الخدمات. ستبقى المواعيد والسجلات السابقة محفوظة. هل تريد المتابعة؟`:`The main service "${q.data.name}" and all ${q.data.items.length} associated subservices will be deleted from the catalog. Existing appointments and historical records will be preserved. Do you want to continue?`):(ar?'جارٍ تحميل الخدمة الرئيسية وكل خدماتها الفرعية لتأكيد الحذف.':'Loading the main service and all its subservices for confirmation.')}</AlertDialogDescription></AlertDialogHeader>{load}
    {q.data&&!load&&<ul className="max-h-32 overflow-y-auto rounded-lg border p-3 text-sm" data-testid="main-service-delete-members">{q.data.items.map(item=><li key={item.id}>{item.name}</li>)}</ul>}
    <FormError message={changed?(ar?'تغيّرت هذه الخدمة. حدّث البيانات وراجع الخدمات قبل تأكيد الحذف.':'This service has changed. Reload and review the subservices before confirming deletion.'):mutation.error?errorMessage(mutation.error):undefined}/>
    {changed&&<Button variant="outline" onClick={()=>{mutation.reset();void q.refetch();}} data-testid="reload-main-service-delete">{ar?'تحديث البيانات':'Reload details'}</Button>}
    <AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending} data-testid="cancel-main-service-delete">{t('common.cancel')}</AlertDialogCancel><Button variant="destructive" disabled={!q.data||!!load||q.isFetching||mutation.isPending||changed} onClick={()=>mutation.mutate()} data-testid="confirm-main-service-delete">{mutation.isPending?t('common.loading'):ar?'تأكيد الحذف':'Confirm Delete'}</Button></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
