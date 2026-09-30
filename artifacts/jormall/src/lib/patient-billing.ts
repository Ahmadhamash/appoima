import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
export type ProductCharge={itemId:number;name:string;nameLang:'en'|'ar';unit:string;quantity:string;unitPrice:string;amount:string};
export type ProductOption={id:number;name:string;nameLang:'en'|'ar';unit:string;unitPrice:string|null};
export type Payment={currency:'JOD';serviceFee:string|null;productTotal:string;total:string|null;products:ProductCharge[];basis:'planned'|'actual'|'manual'};
export type PatientPricing=Payment&{options:ProductOption[];servicePrice:string};
const milli=(value:string)=>{if(!/^\d+(?:\.\d{1,3})?$/.test(value))throw Error('decimal');const [whole,fraction='']=value.split('.');return BigInt(whole!)*1000n+BigInt(fraction.padEnd(3,'0'));};
const decimal=(value:bigint)=>`${value/1000n}.${String(value%1000n).padStart(3,'0')}`;
export function productAmount(quantity:string,price:string){try{if(milli(quantity)<=0n)return '';return decimal((milli(quantity)*milli(price)+500n)/1000n);}catch{return '';}}
export function previewPayment(serviceFee:string|null,products:ProductCharge[],basis:Payment['basis']='planned'):Payment{
  try{const sum=products.reduce((value,line)=>value+milli(line.amount),0n);return {currency:'JOD',serviceFee,productTotal:decimal(sum),total:serviceFee===null?null:decimal(milli(serviceFee)+sum),products,basis};}
  catch{return {currency:'JOD',serviceFee,productTotal:'',total:null,products,basis};}
}
export const productSelections=(products:ProductCharge[])=>products.map(line=>({itemId:line.itemId,quantity:line.quantity,expectedUnitPrice:line.unitPrice}));
export function usePatientPricing(branchId:number|undefined,serviceId:number|undefined,followUp=false,enabled=true){
  return useQuery({queryKey:['scheduling','pricing',branchId,serviceId,followUp],queryFn:()=>api<PatientPricing>(`/clinic/scheduling/pricing?branchId=${branchId}&serviceId=${serviceId}&appointmentType=${followUp?'follow_up':'standard'}`),enabled:enabled&&!!branchId&&!!serviceId,staleTime:30000});
}
export function useBookingPayment(branchId:number|undefined,serviceId:number|undefined,followUp:boolean,customerId?:number){
  const pricing=usePatientPricing(branchId,serviceId,followUp),key=`${branchId}:${serviceId}:${followUp}:${customerId}`;
  const [choice,setChoice]=useState<{key:string;products:ProductCharge[]}|null>(null);
  const products=choice?.key===key?choice.products:pricing.data?.products??[];
  return {pricing,products,setProducts:(products:ProductCharge[])=>setChoice({key,products})};
}
