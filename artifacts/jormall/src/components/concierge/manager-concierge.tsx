import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import {useManagerBranch} from '@/lib/manager-branch';
import { ConciergeView } from './view';
import './concierge.css';
/** Kept separate from the old read-only Staff help; scoped to authorized managers in AppShell. */
export default function ManagerConcierge({onStaffHelp,onReady}:{onStaffHelp:()=>void;onReady?:()=>void}){
 const [location,navigate]=useLocation(),queryClient=useQueryClient(),{user}=useAuth(),{selectedBranchId}=useManagerBranch(),callbacks=useRef({navigate,onStaffHelp,selectedBranchId}),viewRef=useRef<ConciergeView|null>(null);callbacks.current={navigate,onStaffHelp,selectedBranchId};
 useEffect(()=>{if(!user)return;const view=new ConciergeView({userId:user.id,onNavigate:path=>callbacks.current.navigate(path),onApplied:()=>{void queryClient.invalidateQueries().then(()=>{if(!callbacks.current.selectedBranchId)callbacks.current.navigate('/choose-branch');});},onStaffHelp:()=>callbacks.current.onStaffHelp()});viewRef.current=view;onReady?.();return()=>{viewRef.current=null;view.dispose();};},[queryClient,user?.id]);
 useEffect(()=>{if(!user||location!=='/home'||!viewRef.current)return;const key=`jormall:manager-setup-offered:${user.id}`;if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');void viewRef.current.open();},[location,user?.id]);
 return null;
}
