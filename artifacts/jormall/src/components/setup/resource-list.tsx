import { formatClockTime } from '@/lib/time-format';
import { EnteredName } from '@/components/setup/controls';
import { useI18n } from '@/lib/i18n';
import type { Options, RecordItem, Resource, ServiceGroupSummary } from '@/lib/setup-api';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function ResourceList({resource,items,options,onOpen,onSelect,selectedId,onDelete,serviceGroups,onEditGroup,onDeleteGroup}:{resource:Resource;items:RecordItem[];options:Options;onOpen:(id:number)=>void;onSelect?:(id:number)=>void;selectedId?:number;onDelete?:(item:RecordItem)=>void;serviceGroups?:ServiceGroupSummary[];onEditGroup?:(id:number)=>void;onDeleteGroup?:(id:number)=>void}) {
  const {t,lang}=useI18n(),ar=lang==='ar';
  const columns:Record<Resource,string[]>={
    branches:[ar?'الفرع':'Branch',ar?'المنطقة الزمنية':'Time zone',ar?'مواعيد الدوام':'Working hours'],
    services:[ar?'الخدمة':'Service',ar?'الفرع':'Branch',ar?'المدة':'Duration',ar?'السعر':'Price',ar?'الحالة':'Status'],
    rooms:[ar?'الغرفة':'Room',ar?'الفرع':'Branch',ar?'السعة':'Capacity',ar?'الخدمات':'Services',ar?'الحالة':'Status'],
    employees:[ar?'الموظف':'Employee',ar?'الدور':'Role',ar?'التخصص':'Specialty',ar?'ساعات العمل اليوم':'Today’s hours',ar?'مواعيد اليوم':'Today’s appointments',ar?'الغرفة':'Room',ar?'الحالة':'Status'],
    customers:[ar?'العميل':'Customer',ar?'التواصل':'Contact',ar?'الفرع':'Branch',ar?'ملاحظات':'Notes'],
  };
  const serviceGroup=(item:RecordItem)=>item.definition?.section||(item.category?item.category:item.name);
  const groups=resource==='services'?(serviceGroups?.map(group=>group.name)??Array.from(new Set(items.map(serviceGroup)))):[''];
  const branchFor=(item:RecordItem)=>options.branches.find(branch=>branch.id===item.branchId);
  return <div className="space-y-4" data-testid={resource==='services'?'clinic-service-sections':undefined}>
    {groups.map((group,index)=>{
      const rows=resource==='services'?items.filter(item=>serviceGroup(item)===group):items;
      const main=serviceGroups?.find(item=>item.name===group);
      const groupId=main?.id??rows[0]?.id;
      return <section key={group} className="overflow-hidden rounded-2xl border border-[#e0e6ef] bg-white shadow-[0_12px_32px_#1b2d480a]">
        {resource!=='employees'&&<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ecf2] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">{resource==='services'&&<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary" data-testid={`main-service-number-${groupId}`}>{main?.number??index+1}</span>}<h2 className="break-words font-bold text-[#1b2d48]" data-testid={resource==='services'?`main-service-name-${groupId}`:undefined}>{group||t('p2.titles.'+resource)}</h2></div>
          {resource==='services'?<div className="flex flex-wrap items-center gap-2">{onEditGroup&&<button type="button" onClick={()=>groupId&&onEditGroup(groupId)} className="focus-ring rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10" data-testid={`edit-main-service-${groupId}`}>{ar?'تعديل':'Edit'}</button>}{onDeleteGroup&&<button type="button" onClick={()=>groupId&&onDeleteGroup(groupId)} className="focus-ring rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" data-testid={`delete-main-service-${groupId}`}>{ar?'حذف':'Delete'}</button>}</div>:<span className="rounded-lg bg-[#f8f1e4] px-3 py-1 text-xs font-semibold text-primary">{rows.length}</span>}
        </div>}
        <div className="overflow-x-auto">
          <table className={`w-full ${resource==='employees'?'min-w-[1050px]':'min-w-[700px]'} text-start text-sm`}>
            <thead className="bg-[#fbf7ef] text-xs text-[#64748b]"><tr>
              {columns[resource].map(label=><th key={label} scope="col" className="whitespace-nowrap px-5 py-3 text-start font-semibold">{label}</th>)}
              {resource!=='services'&&<th scope="col" className="px-5 py-3 text-start font-semibold">{ar?'إجراءات':'Actions'}</th>}
            </tr></thead>
            <tbody className="divide-y divide-[#e9edf3]">
              {rows.map(item=>{
                const branch=branchFor(item);
                const status=resource==='rooms'?t('p2.'+item.status):item.isActive===undefined?'':t(item.isActive?'common.active':'common.inactive');
                const statusBadge=<span className={'inline-flex rounded-full px-3 py-1 text-xs font-semibold '+(item.status==='maintenance'||item.isActive===false?'bg-[#fff0ef] text-[#a44545]':'bg-[#e8f8ee] text-[#187647]')}>{status}</span>;
                const cells:Record<Resource,ReactNode[]>={
                  branches:[<span className="font-semibold"><EnteredName item={item}/></span>,<bdi dir="ltr">{item.timeZone}</bdi>,item.openingHours?(ar?'محددة':'Set'):'—'],
                  services:[<button type="button" onClick={event=>{event.stopPropagation();onOpen(item.id);}} data-testid={`open-subservice-${item.id}`} className="focus-ring rounded text-start font-semibold hover:text-primary hover:underline"><EnteredName item={item}/></button>,branch?<EnteredName item={branch}/>:t('p2.allBranches'),item.durationMinutes?t('p2.minutes',{count:item.durationMinutes}):'—',item.price?<bdi dir="ltr">{item.price} {item.currency}</bdi>:'—',statusBadge],
                  rooms:[<span className="font-semibold"><EnteredName item={item}/></span>,branch?<EnteredName item={branch}/>:t('p2.allBranches'),item.capacity??'—',<div className="flex min-w-48 flex-wrap gap-1.5">{(item.serviceIds??[]).length?item.serviceIds!.map(id=>{const service=options.services.find(choice=>choice.id===id);return <span key={id} className="rounded-lg border border-[#ecdfc8] bg-[#fffaf2] px-2 py-1 text-xs font-medium text-primary">{service?<EnteredName item={service}/>:id}</span>;}):<span className="text-xs text-[#9aa6b6]">{ar?'لم تُحدد خدمات بعد':'No services selected'}</span>}</div>,statusBadge],
                  employees:[<div className="flex min-w-36 items-center gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f4ebdc] font-bold text-primary">{item.name.slice(0,1)}</span><span><span className="block font-semibold"><EnteredName item={item}/></span><small className="text-[#8995a7]">{item.role?t('roles.'+item.role):''}</small></span></div>,item.role?<span className={'inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-semibold '+(item.role==='doctor'?'bg-[#eaf2ff] text-[#3765a4]':item.role==='secretary'?'bg-[#fff0d8] text-[#996b25]':item.role==='service_provider'?'bg-[#f2eaff] text-[#8655a2]':'bg-[#e8f8ee] text-[#276f50]')}>{t('roles.'+item.role)}</span>:'—',<span className="max-w-40 text-[#64748b]">{item.jobTitle||((item.role==='doctor'||item.role==='service_provider')&&item.serviceIds?.length?options.services.filter(service=>item.serviceIds?.includes(service.id)).slice(0,2).map(service=>service.name).join('، '):'—')}</span>,(()=>{const schedules=item.branchSchedules?.length?item.branchSchedules:[{branchId:item.branchId,workingHours:item.workingHours}];return <div className="space-y-1">{schedules.map((shift,i)=>{const place=options.branches.find(b=>b.id===shift.branchId);const day=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:place?.timeZone??'Asia/Amman'}).format(new Date()).toLowerCase() as keyof NonNullable<RecordItem['workingHours']>;const hours=shift.workingHours?.[day]??[];return <div key={i} className="text-xs"><span>{place?.name??''} </span><bdi dir="ltr">{hours.length?hours.map(r=>`${formatClockTime(r.open)} – ${formatClockTime(r.close)}`).join(' / '):ar?'عطلة':'Off'}</bdi></div>;})}</div>;})(),<span className="text-[#9aa6b6]">—</span>,<span className="text-[#9aa6b6]">—</span>,statusBadge],
                  customers:[<button type="button" onClick={()=>onSelect?.(item.id)} className="focus-ring font-semibold hover:text-primary"><EnteredName item={item}/></button>,<bdi dir="ltr">{item.phone||item.email||'—'}</bdi>,branch?<EnteredName item={branch}/>:t('p2.allBranches'),<span className="block max-w-52 truncate">{item.notes||'—'}</span>],
                };
                return <tr key={item.id} data-testid={'record-'+resource+'-'+item.id} onClick={resource==='services'?()=>onOpen(item.id):undefined} className={(selectedId===item.id?'bg-primary/5 hover:bg-[#fff7e8]':'hover:bg-primary/5')+(resource==='services'?' cursor-pointer focus-within:bg-primary/5':'')}>
                  {cells[resource].map((cell,index)=><td key={index} className="px-5 py-4 text-[#344760]">{cell}</td>)}
                  {resource!=='services'&&<td className="px-5 py-4"><button type="button" onClick={()=>onOpen(item.id)} data-testid={'details-'+resource+'-'+item.id} className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#e3d6b9] px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10">{t('p2.details')}<ChevronLeft className="size-3.5 rtl:rotate-180"/></button>{resource==='branches'&&onDelete&&<button type="button" onClick={()=>onDelete(item)} data-testid={'delete-branch-'+item.id} className="focus-ring ms-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">{ar?'حذف الفرع':'Delete branch'}</button>}</td>}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>;
    })}
  </div>;
}

