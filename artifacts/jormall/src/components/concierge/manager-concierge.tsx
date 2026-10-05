import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { clinicSetupKey, SETUP_PATH } from '@/lib/clinic-setup';
import type { Bootstrap } from './contract';
import { ConciergeView } from './view';
import './concierge.css';
import './review-overview.css';
/** Kept separate from the old read-only Staff help; scoped to authorized managers in AppShell. */
export default function ManagerConcierge({onSignOut,onStaffHelp,onReady}:{onSignOut:()=>Promise<void>;onStaffHelp:()=>void;onReady?:()=>void}){
 const [location,navigate]=useLocation(),queryClient=useQueryClient(),{user}=useAuth(),{lang,setLang}=useI18n(),callbacks=useRef({navigate,onSignOut,onStaffHelp,location,lang,setLang}),viewRef=useRef<ConciergeView|null>(null);callbacks.current={navigate,onSignOut,onStaffHelp,location,lang,setLang};
 useEffect(()=>{if(!user)return;const view=new ConciergeView({userId:user.id,getLanguage:()=>callbacks.current.lang,onLanguageChanged:language=>callbacks.current.setLang(language),getLocation:()=>callbacks.current.location,getBootstrap:()=>queryClient.getQueryData<Bootstrap>(clinicSetupKey(user.id)),isSetupRequired:()=>callbacks.current.location===SETUP_PATH,onNavigate:path=>callbacks.current.navigate(path),onSignOut:()=>callbacks.current.onSignOut(),onPaused:()=>{window.dispatchEvent(new Event('jormall:setup-pause-changed'));callbacks.current.navigate('/home');void queryClient.invalidateQueries({queryKey:clinicSetupKey(user.id)});},onApplied:async session=>{sessionStorage.setItem(`jormall:manager-setup-offered:${user.id}`,'1');if(session)queryClient.setQueryData<Bootstrap>(clinicSetupKey(user.id),current=>current?{...current,session}:current);await queryClient.invalidateQueries();},onIdentityApplied:()=>{void queryClient.invalidateQueries({queryKey:['clinic-workspace']});},onStaffHelp:()=>callbacks.current.onStaffHelp()});viewRef.current=view;window.dispatchEvent(new Event('jormall:concierge-ready'));onReady?.();return()=>{viewRef.current=null;view.dispose();};},[queryClient,user?.id]);
 useEffect(()=>{if(!user||!viewRef.current)return;if(location===SETUP_PATH){void viewRef.current.open(true);return;}},[location,user?.id]);
 return null;
}
