import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { FormError } from '@/components/form-field';
import { AppointmentList, Pagination } from './appointment-list';
import type { AppointmentList as ListResult } from '@/lib/scheduling-api';
export function CustomerHistory({customerId,enabled}: {customerId:number;enabled:boolean}) {
  const {t,lang}=useI18n(),errorMessage=useErrorMessage(),[page,setPage]=useState(1);
  const q=useQuery({queryKey:['scheduling','customer-history',customerId,page],queryFn:()=>api<ListResult>(`/clinic/customers/${customerId}/appointments?page=${page}&pageSize=5`),enabled});
  return <section className="space-y-3 rounded-lg bg-muted/30 p-3" data-testid="customer-appointment-history"><h3 className="text-sm font-semibold">{t('p2.history')}</h3><p className="text-xs text-muted-foreground">{t('p3.readOnlyHistory')}</p>{!enabled?<p className="text-sm">{t('p3.accessDenied')}</p>:q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:q.data&&<><AppointmentList items={q.data.items}/>{q.data.items.filter(item=>item.status==='completed'&&item.clinicalNotes).map(item=><article key={item.id} className="space-y-2 rounded-lg border bg-card p-3" data-testid={`patient-treatment-notes-${item.id}`}><p className="text-xs text-muted-foreground">{item.service.name} · {item.employee.name} · {new Date(item.startsAt).toLocaleDateString(lang==='ar'?'ar-JO':'en-GB',{timeZone:item.branch.timeZone})}</p><h4 className="text-sm font-semibold">{lang==='ar'?'ملاحظات العلاج':'Treatment notes'}</h4><p className="whitespace-pre-wrap break-words text-sm" lang={item.notesLang} dir={item.notesLang==='ar'?'rtl':'ltr'}>{item.clinicalNotes}</p></article>)}<Pagination page={page} pageSize={5} total={q.data.total} onPage={setPage}/></>}</section>;
}
