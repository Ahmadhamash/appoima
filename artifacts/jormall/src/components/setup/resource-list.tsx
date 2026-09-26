import { EnteredName } from '@/components/setup/controls';
import { useI18n } from '@/lib/i18n';
import type { Options, RecordItem, Resource } from '@/lib/setup-api';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function ResourceList({resource,items,options,onOpen,onSelect,selectedId}:{resource:Resource;items:RecordItem[];options:Options;onOpen:(id:number)=>void;onSelect?:(id:number)=>void;selectedId?:number}) {
  const {t,lang}=useI18n(),ar=lang==='ar';
  const columns:Record<Resource,string[]>={
    branches:[ar?'الفرع':'Branch',ar?'المنطقة الزمنية':'Time zone',ar?'مواعيد الدوام':'Working hours'],
    services:[ar?'الخدمة':'Service',ar?'الفرع':'Branch',ar?'المدة':'Duration',ar?'السعر':'Price',ar?'الحالة':'Status'],
    rooms:[ar?'الغرفة':'Room',ar?'الفرع':'Branch',ar?'السعة':'Capacity',ar?'الخدمات':'Services',ar?'الحالة':'Status'],
    employees:[ar?'الموظف':'Employee',ar?'الدور':'Role',ar?'التخصص':'Specialty',ar?'ساعات العمل اليوم':'Today’s hours',ar?'مواعيد اليوم':'Today’s appointments',ar?'الغرفة':'Room',ar?'الحالة':'Status'],
    customers:[ar?'العميل':'Customer',ar?'التواصل':'Contact',ar?'الفرع':'Branch',ar?'ملاحظات':'Notes'],
  };
  const serviceGroup=(item:RecordItem)=>item.definition?.section||(item.category?t('p2.categories.'+item.category):item.name);
  const groups=resource==='services'?Array.from(new Set(items.map(serviceGroup))):[''];
  const branchFor=(item:RecordItem)=>options.branches.find(branch=>branch.id===item.branchId);
  return <div className="space-y-4" data-testid={resource==='services'?'clinic-service-sections':undefined}>
    {groups.map(group=>{
      const rows=resource==='services'?items.filter(item=>serviceGroup(item)===group):items;
      return <section key={group} className="overflow-hidden rounded-2xl border border-[#e0e6ef] bg-white shadow-[0_12px_32px_#1b2d480a]">
        {resource!=='employees'&&<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ecf2] px-5 py-4">
          <h2 className="font-bold text-[#1b2d48]">{group||t('p2.titles.'+resource)}</h2>
          <span className="rounded-lg bg-[#f8f1e4] px-3 py-1 text-xs font-semibold text-[#80632d]">{rows.length}</span>
        </div>}
        <div className="overflow-x-auto">
          <table className={`w-full ${resource==='employees'?'min-w-[1050px]':'min-w-[700px]'} text-start text-sm`}>
            <thead className="bg-[#fbf7ef] text-xs text-[#64748b]"><tr>
              {columns[resource].map(label=><th key={label} scope="col" className="whitespace-nowrap px-5 py-3 text-start font-semibold">{label}</th>)}
              <th scope="col" className="px-5 py-3 text-start font-semibold">{ar?'إجراءات':'Actions'}</th>
            </tr></thead>
            <tbody className="divide-y divide-[#e9edf3]">
              {rows.map(item=>{
                const branch=branchFor(item);
                const status=resource==='rooms'?t('p2.'+item.status):item.isActive===undefined?'':t(item.isActive?'common.active':'common.inactive');
                const statusBadge=<span className={'inline-flex rounded-full px-3 py-1 text-xs font-semibold '+(item.status==='maintenance'||item.isActive===false?'bg-[#fff0ef] text-[#a44545]':'bg-[#e8f8ee] text-[#187647]')}>{status}</span>;
                const cells:Record<Resource,ReactNode[]>={
                  branches:[<span className="font-semibold"><EnteredName item={item}/></span>,<bdi dir="ltr">{item.timeZone}</bdi>,item.openingHours?(ar?'محددة':'Set'):'—'],
                  services:[<span className="font-semibold"><EnteredName item={item}/></span>,branch?<EnteredName item={branch}/>:t('p2.allBranches'),item.durationMinutes?t('p2.minutes',{count:item.durationMinutes}):'—',item.price?<bdi dir="ltr">{item.price} {item.currency}</bdi>:'—',statusBadge],
                  rooms:[<span className="font-semibold"><EnteredName item={item}/></span>,branch?<EnteredName item={branch}/>:t('p2.allBranches'),item.capacity??'—',<div className="flex min-w-48 flex-wrap gap-1.5">{(item.serviceIds??[]).length?item.serviceIds!.map(id=>{const service=options.services.find(choice=>choice.id===id);return <span key={id} className="rounded-lg border border-[#ecdfc8] bg-[#fffaf2] px-2 py-1 text-xs font-medium text-[#80632d]">{service?<EnteredName item={service}/>:id}</span>;}):<span className="text-xs text-[#9aa6b6]">{ar?'لم تُحدد خدمات بعد':'No services selected'}</span>}</div>,statusBadge],
                  employees:[<div className="flex min-w-36 items-center gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f4ebdc] font-bold text-[#80632d]">{item.name.slice(0,1)}</span><span><span className="block font-semibold"><EnteredName item={item}/></span><small className="text-[#8995a7]">{item.role?t('roles.'+item.role):''}</small></span></div>,item.role?<span className={'inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-semibold '+(item.role==='doctor'?'bg-[#eaf2ff] text-[#3765a4]':item.role==='secretary'?'bg-[#fff0d8] text-[#996b25]':item.role==='service_provider'?'bg-[#f2eaff] text-[#8655a2]':'bg-[#e8f8ee] text-[#276f50]')}>{t('roles.'+item.role)}</span>:'—',<span className="max-w-40 text-[#64748b]">{item.jobTitle||((item.role==='doctor'||item.role==='service_provider')&&item.serviceIds?.length?options.services.filter(service=>item.serviceIds?.includes(service.id)).slice(0,2).map(service=>service.name).join('، '):'—')}</span>,(()=>{const day=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:branch?.timeZone||'Asia/Amman'}).format(new Date()).toLowerCase() as keyof NonNullable<RecordItem['workingHours']>;const hours=item.workingHours?.[day]??[];return hours.length?<bdi dir="ltr" className="whitespace-nowrap text-[#64748b]">{hours.map(range=>`${range.open} – ${range.close}`).join(' / ')}</bdi>:<span className="text-[#9aa6b6]">—</span>;})(),<span className="text-[#9aa6b6]">—</span>,<span className="text-[#9aa6b6]">—</span>,statusBadge],
                  customers:[<button type="button" onClick={()=>onSelect?.(item.id)} className="focus-ring font-semibold hover:text-[#80632d]"><EnteredName item={item}/></button>,<bdi dir="ltr">{item.phone||item.email||'—'}</bdi>,branch?<EnteredName item={branch}/>:t('p2.allBranches'),<span className="block max-w-52 truncate">{item.notes||'—'}</span>],
                };
                return <tr key={item.id} data-testid={'record-'+resource+'-'+item.id} className={selectedId===item.id?'bg-[#fff9ee] hover:bg-[#fff7e8]':'hover:bg-[#fcfaf5]'}>
                  {cells[resource].map((cell,index)=><td key={index} className="px-5 py-4 text-[#344760]">{cell}</td>)}
                  <td className="px-5 py-4"><button type="button" onClick={()=>onOpen(item.id)} data-testid={'details-'+resource+'-'+item.id} className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#e3d6b9] px-3 py-2 text-xs font-semibold text-[#80632d] hover:bg-[#f7f0df]">{t('p2.details')}<ChevronLeft className="size-3.5 rtl:rotate-180"/></button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>;
    })}
  </div>;
}

