import type {BranchStock} from './inventory-locations-api';
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useI18n } from './i18n';
import { useToast } from '@/hooks/use-toast';
import type { Option } from './setup-api';
export const UNITS=['piece','pair','box','ml','l','g','kg'] as const;
export type Unit=typeof UNITS[number];
export type Branch=Option & {timeZone:string};
export type InventoryExtra={category?:string;brand?:string;sku?:string;description?:string;minimumStock?:string;unitCost?:string;sellingPrice?:string|null;billingType?:'clinic_cost'|'patient_charge';expiryDate?:string|null;tracksExpiry?:boolean;storageConditions?:string;supplier?:string;supplierPhone?:string;supplierEmail?:string;supplierLocation?:string;supplierContactPerson?:string;supplierContactPhone?:string;supplierContactEmail?:string;supplierWebsite?:string;supplierNotes?:string;notes?:string;isActive?:boolean;requiresPrescription?:boolean;imageDataUrl?:string|null};
export type InventoryItem=Option & {productId?:number;branchId:number;unit:Unit;balance:string;branch:Branch;extra?:InventoryExtra};
export type Page<T>={items:T[];total:number;page:number;pageSize:number;canManage?:boolean};
export type Movement={id:number;roomId?:number|null;kind:'receipt'|'adjustment'|'consumption';quantity:string;unit:Unit;reason:string;reasonLang:'en'|'ar';createdAt:string;actor:Option;appointmentId:number|null;canOpenAppointment:boolean};
export type InventoryDetail=InventoryItem & {batches?:{id:number;expiryDate:string|null;roomId:number|null;roomName:string|null;quantity:string}[];serviceUsage?:{serviceId:number;name:string;nameLang:'ar'|'en';quantity:string}[];movements:Movement[];total:number;page:number;pageSize:number;canManage:boolean;productId?:number;availability?:'all'|'selected';movementMode?:'branch'|'room';branches?:BranchStock[];totalQuantity?:string};
export type WaitingEntry={id:number;branchId:number;customerId:number;serviceId:number;preferredEmployeeId:number|null;windowStart:string;windowEnd:string;note:string;noteLang:'en'|'ar';status:'waiting'|'offered'|'booked'|'declined'|'expired';version:number;createdAt:string;customer:Option;service:Option;employee:Option|null;branch:Branch;offerId:number|null;cancelledAppointmentId:number|null};
export type Replacement={suggestion:null|{offer:{id:number;status:'offered'|'booked';startsAt:string;endsAt:string;replacementAppointmentId:number|null};entry:Pick<WaitingEntry,'id'|'version'|'note'|'noteLang'>;customer:Option;service:Option;employee:Option;branch:Branch;contact?:{phone:string|null;email:string|null}};cancelledAppointmentId:number};
export type ActualLine=Option & {unit:Unit;quantity:string;branch?:Option};
export type ConsumptionView={defaults?:ActualLine[];recorded:boolean;recordedAt:string|null;lines:ActualLine[];canRecord:boolean};
export type ConsumptionDraft={items:(ActualLine & {itemId:number})[];confirmNoItems:boolean};
export const emptyConsumption=():ConsumptionDraft=>({items:[],confirmNoItems:false});
export const consumptionBody=(value:ConsumptionDraft)=>({items:value.items.map(v=>({itemId:v.itemId,quantity:v.quantity})),confirmNoItems:value.confirmNoItems});
export function useOperationsCommand(onSuccess?:(result:{id:number;replayed:boolean})=>void,silent=false) {
  const client=useQueryClient(),{t}=useI18n(),{toast}=useToast();
  const attempt=useRef<{signature:string;key:string}|null>(null);
  return useMutation({retry:false,mutationFn:async({path,body}:{path:string;body:Record<string,unknown>})=>{
    const signature=JSON.stringify({path,body});if(!attempt.current||attempt.current.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    return api<{id:number;replayed:boolean}>(path,{method:'POST',body:{...body,idempotencyKey:attempt.current.key}});
  },onSuccess:(result)=>{attempt.current=null;if(!silent)toast({title:t('p4.saved')});onSuccess?.(result);},
  onSettled:async()=>{await Promise.all([['operations'],['inventory'],['costing'],['scheduling'],['setup'],['me','clinic']].map(queryKey=>client.invalidateQueries({queryKey})));}});
}
