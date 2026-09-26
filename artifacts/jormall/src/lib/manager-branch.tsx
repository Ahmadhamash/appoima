import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {useAuth} from './auth';

export type ManagerBranch={id:number;name:string;nameLang:'ar'|'en';timeZone:string};
type BranchContextValue={branches:ManagerBranch[];selectedBranchId:number|null;selectedBranch:ManagerBranch|null;loading:boolean;needsEntryChoice:boolean;selectBranch:(id:number)=>void;clearBranch:()=>void};
const BranchContext=createContext<BranchContextValue|null>(null);
const key=(userId:number)=>`jormall:working-branch:${userId}`;

export function ManagerBranchProvider({children}:{children:ReactNode}){
 const {user}=useAuth(),manager=user?.role==='manager',id=user?.id??null;
 const [stored,setStored]=useState<{userId:number;branchId:number}|null>(null);
 const [entry,setEntry]=useState<{userId:number;required:boolean}|null>(null);
 const previous=useRef<number|null>(null);
 const q=useQuery({queryKey:['setup','options','branches',id],enabled:manager,queryFn:()=>api<{branches:ManagerBranch[]}>('/clinic/options?for=branches'),staleTime:30000,retry:false});
 useEffect(()=>{
  if(previous.current!==null&&previous.current!==id)sessionStorage.removeItem(key(previous.current));
  previous.current=id;setEntry(null);
  if(id===null){setStored(null);return;}
  const value=Number(sessionStorage.getItem(key(id)));
  setStored(Number.isSafeInteger(value)&&value>0?{userId:id,branchId:value}:null);
 },[id]);
 const branches=manager?[...(q.data?.branches??[])].sort((a,b)=>a.id-b.id):[];
 const selectedBranchId=stored?.userId===id&&branches.some(b=>b.id===stored.branchId)?stored.branchId:branches.length===1?branches[0]!.id:null;
 const selectedBranch=branches.find(b=>b.id===selectedBranchId)??null;
 useEffect(()=>{if(!manager||id===null||q.isPending||q.isError||entry?.userId===id)return;setEntry({userId:id,required:branches.length>1&&selectedBranchId===null});},[manager,id,q.isPending,q.isError,entry,branches,selectedBranchId]);
 const selectBranch=(branchId:number)=>{if(id===null||!branches.some(b=>b.id===branchId))return;sessionStorage.setItem(key(id),String(branchId));setStored({userId:id,branchId});setEntry({userId:id,required:false});};
 const clearBranch=()=>{if(id!==null)sessionStorage.removeItem(key(id));setStored(null);setEntry({userId:id??-1,required:branches.length>1});};
 return <BranchContext.Provider value={{branches,selectedBranchId,selectedBranch,loading:!!manager&&(q.isPending||(!q.isError&&entry?.userId!==id)),needsEntryChoice:!!manager&&entry?.userId===id&&entry.required&&selectedBranchId===null,selectBranch,clearBranch}}>{children}</BranchContext.Provider>;
}
export function useManagerBranch(){const value=useContext(BranchContext);if(!value)throw new Error('ManagerBranchProvider missing');return value;}
