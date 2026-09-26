import type { ReactNode } from 'react';
import type { RecordItem, Options } from '@/lib/setup-api';
import { ServiceCard } from './service-card';
/** Groups the currently paginated services; server search/pagination remain authoritative. */
export function ServiceCatalog({items,options,language,onOpen,usage}:{items:RecordItem[];options:Options;language:'ar'|'en';onOpen:(id:number)=>void;usage:(id:number)=>ReactNode}) {
 const section=(item:RecordItem)=>item.definition?.section??(language==='ar'?'الخدمات الأخرى':'Other services');
 return <div className="space-y-7" data-testid="clinic-service-sections">{Array.from(new Set(items.map(section))).map(name=><section key={name}><div className="sv-section-heading"><h3>{name}</h3><span>{items.filter(i=>section(i)===name).length}</span></div><div className="grid min-w-0 gap-4 lg:grid-cols-2">{items.filter(i=>section(i)===name).map(item=><ServiceCard key={item.id} service={item} language={language} branch={options.branches.find(b=>b.id===item.branchId)?.name??(language==='ar'?'كل الفروع':'All branches')} footer={<div className="space-y-3"><button type="button" className="sv-button" onClick={()=>onOpen(item.id)} data-testid={`details-services-${item.id}`}>{language==='ar'?'التفاصيل وإدارة الخدمة':'Details and service management'}</button><div className="text-xs">{usage(item.id)}</div></div>}/>)}</div></section>)}</div>;
}
