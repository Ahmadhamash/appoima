import type { ServiceDefinition, IntakeSnapshot } from '@workspace/service-definition';
import type {Payment} from './patient-billing';
import { formatInstantTime } from './time-format';
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useI18n } from './i18n';
import { useToast } from '@/hooks/use-toast';
import type { Option, Week } from './setup-api';
export const STATUSES = ['pending','confirmed','checked_in','in_service','completed','cancelled','no_show'] as const;
export type Status = typeof STATUSES[number];
export type Slot = {startsAt: string; endsAt: string; roomId: number|null};
export type CustomerChoice = Option & {phone?: string|null; email?: string|null};
export type Catalog = {
  branches: (Option & {timeZone: string; openingHours: Week})[];
  services: (Option & {durationMinutes: number; followUpEnabled: boolean; price: string; currency: string; requiresRoom: boolean; requiredEquipment: string[]; definition?: ServiceDefinition|null})[];
  employees: Option[]; canBook: boolean; canReadAll: boolean; canSearchCustomers: boolean; canAddCustomer: boolean;
};
export type AppointmentSummary = {
  clinicalNotes?:string;notesLang?:'ar'|'en';id: number; clinicId: number; branchId: number; customerId: number; serviceId: number; employeeId: number; roomId: number|null;
  startsAt: string; endsAt: string; status: Status; version: number; durationMinutes: number;
  customer: Option; service: Option; employee: Option; branch: Option & {timeZone: string};
  nextActions?: Status[]; canReschedule?: boolean;
  billing?:Payment;
};
export type Reservation = {startsAt: string; endsAt: string; employeeId: number; roomId: number|null};
export type AppointmentDetail = AppointmentSummary & {
  packageSummary?:{id:number;name:string;remaining:number;totalSessions:number;usageRules:string;expiresAt:string|null}|null;
  packageId?:number|null;packagePayment?:{warning:boolean;blocking:boolean;missing:string;sessionNumber:number}|null;
  serviceIntake?: IntakeSnapshot|null; appointmentType:'standard'|'follow_up';followUpOfId:number|null;chargePrice:string|null;chargeCurrency:string|null;canEditCharge:boolean;
  notes?: string; notesLang?: 'en'|'ar'; requiresRoom: boolean; room: Option|null; nextActions: Status[]; canReschedule: boolean; canEditNotes: boolean;
  customerDetails?: {phone: string|null; email: string|null; notes: string; sensitiveNotes?: string};
  history: {id: number; event: 'created'|'status_changed'|'rescheduled'|'notes_updated'; fromStatus: Status|null; toStatus: Status;
    at: string; reason: string; before: Reservation|null; after: Reservation; actor: Option}[];
};
export type AppointmentList = {items: AppointmentSummary[]; total: number; page: number; pageSize: number; ownOnly: boolean};
export function queryString(params: Record<string, string|number|boolean|undefined|null>): string {
  const q = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k,String(v));
  return q.toString();
}
export function useCatalog(branchId?: number, serviceId?: number, enabled = true) {
  return useQuery({queryKey:['scheduling','catalog',branchId,serviceId], queryFn:()=>api<Catalog>(`/clinic/scheduling/catalog?${queryString({branchId,serviceId})}`), enabled, staleTime:15000});
}
export function useAppointment(id: number) {
  return useQuery({queryKey:['scheduling','appointment',id],queryFn:()=>api<AppointmentDetail>(`/clinic/appointments/${id}`),enabled:Number.isInteger(id)&&id>0,refetchOnWindowFocus:false});
}
/** Preserve a command key across manual retries of an identical payload. No PHI in localStorage. */
export function useSchedulingCommand(onSuccess?: (id: number) => void) {
  const client = useQueryClient();
  const {t}=useI18n();
  const {toast}=useToast();
  const attempt = useRef<{signature: string; key: string}|null>(null);
  return useMutation({
    retry: false,
    mutationFn: async ({path, body}: {path: string; body: Record<string, unknown>}) => {
      const signature = JSON.stringify({path,body});
      if (!attempt.current || attempt.current.signature !== signature) attempt.current={signature,key:crypto.randomUUID()};
      return api<{id: number; replayed: boolean}>(path,{method:'POST',body:{...body,idempotencyKey:attempt.current.key}});
    },
    onSuccess: async (result) => {
      attempt.current=null;
      await Promise.all([client.invalidateQueries({queryKey:['billing']}),client.invalidateQueries({queryKey:['operations']}),client.invalidateQueries({queryKey:['scheduling']}),client.invalidateQueries({queryKey:['me','clinic']}),client.invalidateQueries({queryKey:['setup']})]);
      toast({title:t('p3.saved')});
      onSuccess?.(result.id);
    },
  });
}
export function localDate(zone: string, instant: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  return `${parts.find((p)=>p.type==='year')!.value}-${parts.find((p)=>p.type==='month')!.value}-${parts.find((p)=>p.type==='day')!.value}`;
}
export function formatAppointmentTime(value: string, zone: string, lang: string, full = false): string {
  return formatInstantTime(value, zone, lang, full);
}
export function shiftLocalDate(value: string, days: number): string {
  const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
