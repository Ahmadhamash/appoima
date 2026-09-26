import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { FormError } from '@/components/form-field';
import { AppointmentList, Pagination } from './appointment-list';
import type { AppointmentList as ListResult } from '@/lib/scheduling-api';
export function CustomerHistory({customerId,enabled}: {customerId:number;enabled:boolean}) {
  const {t}=useI18n(),errorMessage=useErrorMessage(),[page,setPage]=useState(1);
  const q=useQuery({queryKey:['scheduling','customer-history',customerId,page],queryFn:()=>api<ListResult>(`/clinic/customers/${customerId}/appointments?page=${page}&pageSize=5`),enabled});
  return <section className="space-y-3 rounded-lg bg-muted/30 p-3" data-testid="customer-appointment-history"><h3 className="text-sm font-semibold">{t('p2.history')}</h3><p className="text-xs text-muted-foreground">{t('p3.readOnlyHistory')}</p>{!enabled?<p className="text-sm">{t('p3.accessDenied')}</p>:q.isPending?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:q.data&&<><AppointmentList items={q.data.items}/><Pagination page={page} pageSize={5} total={q.data.total} onPage={setPage}/></>}</section>;
}
