import { BookingDateField } from './booking-date-field';
import { bookingDateAllowed, nextBookingDate } from '@/lib/booking-date';
import type { Week } from '@/lib/setup-api';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { formatAppointmentTime, queryString, type Slot } from '@/lib/scheduling-api';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
export function SlotPicker({branchId,serviceId,employeeId,timeZone,openingHours,date,onDate,selected,onSelect,excludeAppointmentId}: {
  branchId:number;serviceId:number;employeeId:number;timeZone:string;openingHours:Week|undefined;date:string;onDate:(date:string)=>void;
  selected:Slot|null;onSelect:(slot:Slot|null)=>void;excludeAppointmentId?:number;
}) {
  const {t,lang}=useI18n(), errorMessage=useErrorMessage();
  useEffect(()=>{if(openingHours&&!bookingDateAllowed(date,openingHours,timeZone)){onDate(nextBookingDate(openingHours,timeZone));onSelect(null);}},[openingHours,date,timeZone,onDate,onSelect]);
  const q=useQuery({queryKey:['scheduling','slots',branchId,serviceId,employeeId,date,excludeAppointmentId],
    queryFn:()=>api<{slots:Slot[];timeZone:string;durationMinutes:number}>(`/clinic/scheduling/availability?${queryString({branchId,serviceId,employeeId,date,excludeAppointmentId})}`),
    enabled:Boolean(branchId&&serviceId&&employeeId&&bookingDateAllowed(date,openingHours,timeZone)),refetchInterval:30000,refetchOnWindowFocus:true,staleTime:0});
  useEffect(()=>{if(selected&&q.data&&!q.data.slots.some((s)=>s.startsAt===selected.startsAt&&s.roomId===selected.roomId))onSelect(null);},[q.data,selected,onSelect]);
  return <section className="space-y-4" data-testid="slot-picker">
    <BookingDateField value={date} openingHours={openingHours} timeZone={timeZone} onChange={next=>{if(bookingDateAllowed(next,openingHours,timeZone)){onDate(next);onSelect(null);}}}/>
    <p className="text-sm text-muted-foreground">{t('p3.timeZone',{zone:timeZone})}</p>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{t('p3.availableTimes')}</h3><Button type="button" variant="outline" size="sm" onClick={()=>void q.refetch()} disabled={q.isFetching||!bookingDateAllowed(date,openingHours,timeZone)} data-testid="refresh-slots">{t('p3.refreshSlots')}</Button></div>
    {q.isPending&&bookingDateAllowed(date,openingHours,timeZone)?<p role="status">{t('common.loading')}</p>:q.isError?<FormError message={errorMessage(q.error)}/>:!q.data?.slots.length?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground" data-testid="slots-empty">{t('p3.noSlots')}</p>:
    <div role="group" aria-label={t('p3.availableTimes')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">{q.data.slots.map((slot)=><Button key={slot.startsAt} type="button" variant={selected?.startsAt===slot.startsAt?'default':'outline'} aria-pressed={selected?.startsAt===slot.startsAt} onClick={()=>onSelect(slot)} data-testid={`slot-${slot.startsAt}`}>{formatAppointmentTime(slot.startsAt,timeZone,lang)}</Button>)}</div>}
    <p className="text-xs text-muted-foreground">{t('p3.slotHint')}</p>
  </section>;
}
