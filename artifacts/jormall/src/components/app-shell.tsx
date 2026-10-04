import { workspaceName } from '@workspace/service-definition';
import { useClinicWorkspace,workspaceTheme } from './workspace/workspace-home';
import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut, House, Building2, MessageCircle, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useManagerBranch } from '@/lib/manager-branch';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitcher } from './language-switcher';
import { PackageNotifications } from './operations/package-notifications';
import { canOpenSetupStep, SETUP_PATH, useClinicSetup } from '@/lib/clinic-setup';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

const AssistantPanel = lazy(() => import('./assistant/assistant-panel'));
const ManagerConcierge = lazy(() => import('./concierge/manager-concierge'));

const clinicTheme = {
  '--primary': '199 92% 38%',
  '--primary-foreground': '0 0% 100%',
  '--ring': '199 92% 38%',
  '--foreground': '219 40% 19%',
  '--background': '216 33% 98%',
  '--muted-foreground': '215 18% 45%',
  '--radius': '0.9rem',
} as CSSProperties;

function Brand({home}:{home:string}) {
  const {t,lang}=useI18n();
  const q=useClinicWorkspace(),profile=q.data?.profile,name=profile?workspaceName(profile,lang):t('app.name');
  return <Link href={home} className="focus-ring flex min-w-0 items-center gap-3 rounded-xl" data-testid="clinic-shell-brand">
    <span aria-hidden className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-lg font-bold text-primary-foreground">
      {profile?.logoDataUrl?<img src={profile.logoDataUrl} alt="" className="size-full object-contain bg-white"/>:name.slice(0,1)}
    </span>
    <span className="min-w-0"><strong className="block truncate text-sm font-bold text-[#1b2d48] sm:text-lg">{name}</strong><small className="hidden text-xs text-[#69778d] sm:block">{lang==='ar'?'إدارة عيادتك من مكان واحد':'Your clinic workspace'}</small></span>
  </Link>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const {user,signOut}=useAuth();
  const workspace=useClinicWorkspace();
  useEffect(()=>{const theme=workspaceTheme(workspace.data);if(!theme)return;const root=document.documentElement;const previous=Object.entries(theme).map(([key])=>[key,root.style.getPropertyValue(key)] as const);for(const [key,value] of Object.entries(theme))root.style.setProperty(key,String(value));return()=>{for(const [key,value] of previous){if(value)root.style.setProperty(key,value);else root.style.removeProperty(key);}};},[workspace.data]);
  const {branches,selectedBranchId,clearBranch,selectBranch}=useManagerBranch();
  const {t}=useI18n();
  const { lang } = useI18n();
  const setup = useClinicSetup();
  const [setupWarning, setSetupWarning] = useState(false);
  const [location,navigate]=useLocation();
  const [helpOpen,setHelpOpen]=useState(false);
  const [aiMenu,setAiMenu]=useState(false),[managerReady,setManagerReady]=useState(false);
  useEffect(()=>{setAiMenu(false);},[location]);
  const home=user?.role==='platform_owner'?'/clinics':'/home';
  const handleSignOut=async()=>{if(user?.role==='manager')sessionStorage.removeItem(`jormall:manager-setup-offered:${user.id}`);clearBranch();await signOut();navigate('/login');};
  const branchPicker=user?.role==='manager'&&branches.length>0&&<label className="flex items-center gap-2 text-xs font-medium text-[#596a83]">
    <Building2 className="hidden size-4 sm:block" aria-hidden/>
    <span className="sr-only">{t('p3.branch')}</span>
    <select value={selectedBranchId??''} onChange={e=>{selectBranch(Number(e.target.value));navigate('/home');}} data-testid="manager-working-branch" aria-label={t('p3.branch')} className="focus-ring max-w-36 rounded-xl border border-[#dce3ee] bg-white px-2 py-2 text-xs text-[#1b2d48] sm:max-w-48 sm:px-3 sm:text-sm">
      <option value="" disabled>{t('p3.selectBranch')}</option>
      {branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  </label>;
  const locked = setup.required && setup.paused && location !== SETUP_PATH && !canOpenSetupStep(location, setup.progress);
  const showSetupChoice = setup.required && setup.data?.session?.stage !== 'complete';
  const blockAction = (event: React.SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest('[data-setup-resume="true"],[data-setup-logout="true"],[data-setup-language="true"],[data-setup-step="true"]')) return;
    if (!locked || !(event.target instanceof Element) || !event.target.closest('button,a,input,select,textarea,[role="button"],form')) return;
    event.preventDefault(); event.stopPropagation(); setSetupWarning(true);
  };
  return <><div className="min-h-dvh bg-[#f7f9fc] text-[#1b2d48]" style={{...clinicTheme,...workspaceTheme(workspace.data)}} onClickCapture={blockAction} onChangeCapture={blockAction} onSubmitCapture={blockAction}>
    {user?.role==='manager'&&user.permissions.includes('settings.manage')&&<Suspense fallback={null}><ManagerConcierge key={user.id} onSignOut={handleSignOut} onStaffHelp={()=>setHelpOpen(true)} onReady={()=>setManagerReady(true)}/></Suspense>}
    <header className="sticky top-0 z-20 border-b border-[#e6ebf2] bg-white/95 shadow-[0_4px_25px_#1b2d4808] backdrop-blur">
      <div className="mx-auto flex min-h-20 w-full max-w-[1540px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Brand home={home}/>
        <div className="flex items-center gap-2 sm:gap-3">
          {location!==home&&<Link href={home} data-testid="nav-home" className="focus-ring inline-flex size-10 items-center justify-center rounded-xl border border-[#e1e6ef] text-primary hover:bg-primary/10" aria-label={t('nav.home')}><House className="size-5"/></Link>}
          {branchPicker}
          <LanguageSwitcher/>
          <PackageNotifications/>
          <div className="hidden border-s border-[#e4e9f1] ps-3 text-end md:block">
            <p className="max-w-32 truncate text-sm font-semibold" data-testid="text-user-name" lang={user?.nameLang} dir={user?.nameLang==='ar'?'rtl':'ltr'}>{user?.name}</p>
            <p className="text-xs text-[#68778b]">{user&&t(`roles.${user.role}`)}</p>
          </div>
          <button type="button" onClick={handleSignOut} data-testid="button-signout" data-setup-logout="true" aria-label={t('common.signOut')} title={t('common.signOut')} className="focus-ring inline-flex size-10 items-center justify-center rounded-xl border border-[#e1e6ef] text-[#65758c] hover:bg-primary/10 hover:text-primary"><LogOut className="size-5 rtl:-scale-x-100"/></button>
        </div>
      </div>
    </header>
    <main id="main" className="mx-auto w-full max-w-[1540px] px-4 pb-12 pt-6 md:px-8 md:pt-8">
      {locked && <div className="jc-setup-lock-banner" data-testid="clinic-setup-locked" dir={lang==='ar'?'rtl':'ltr'}>
        <div><strong>{lang==='ar'?'عيادتك لسه مش جاهزة':'Your clinic setup is incomplete'}</strong><p>{lang==='ar'?'حفظنا مكانك. كمّل السيت أب عشان تقدر تستخدم النظام.':'Your progress is saved. Finish setup to use the clinic system.'}</p></div>
        <button type="button" data-testid="clinic-setup-resume" data-setup-resume="true" onClick={()=>navigate(SETUP_PATH)}>{lang==='ar'?'كمّل الإعداد':'Continue setup'}</button>
      </div>}
      {children}
    </main>
    {aiMenu&&user?.role==='manager'&&showSetupChoice&&<div className="fixed bottom-20 end-5 z-40 w-[min(340px,calc(100vw-2.5rem))] rounded-2xl border border-[#dce3ee] bg-white p-4 shadow-2xl" data-testid="ai-manager-menu" dir={t('nav.home')==='الرئيسية'?'rtl':'ltr'}>
      <div className="mb-3 flex items-center justify-between"><strong className="text-[#1b2d48]">{t('nav.home')==='الرئيسية'?'كيف بتحب أساعدك؟':'How can I help?'}</strong><button type="button" onClick={()=>setAiMenu(false)} aria-label={t('p5.close')} className="rounded-lg p-2 hover:bg-primary/10"><X className="size-4"/></button></div>
      <button type="button" onClick={()=>{setAiMenu(false);setHelpOpen(true);}} data-testid="ai-chat-choice" className="focus-ring mb-2 flex w-full items-center gap-3 rounded-xl border border-[#e2e8f0] p-4 text-start hover:border-primary/50 hover:bg-primary/5"><MessageCircle className="size-5 text-primary"/><span><strong className="block">{t('nav.home')==='الرئيسية'?'احكي مع المساعد':'Talk to the assistant'}</strong><small className="text-[#6a7890]">{t('nav.home')==='الرئيسية'?'مواعيد، عملاء وأسئلة الشغل اليومي':'Appointments, customers and daily work'}</small></span></button>
      <button type="button" disabled={!managerReady} onClick={()=>{setAiMenu(false);window.dispatchEvent(new Event('jormall:concierge-open'));}} data-testid="ai-setup-choice" className="focus-ring flex w-full items-center gap-3 rounded-xl border border-[#e2e8f0] p-4 text-start hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"><Sparkles className="size-5 text-primary"/><span><strong className="block">{t('nav.home')==='الرئيسية'?'تجهيز العيادة':'Set up the clinic'}</strong><small className="text-[#6a7890]">{t('nav.home')==='الرئيسية'?'صوت وكتابة في محادثة واحدة':'Voice and typing in one conversation'}</small></span></button>
    </div>}
    <button type="button" onClick={()=>user?.role==='manager'&&showSetupChoice?setAiMenu(value=>!value):setHelpOpen(true)} data-testid="ai-launcher" aria-haspopup="dialog" aria-expanded={aiMenu&&showSetupChoice||helpOpen} className="focus-ring fixed bottom-5 end-5 z-30 flex items-center gap-3 rounded-full border border-[#33445e] bg-[#14243b] px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-[#1d3454]"><span className="size-5 rounded-full bg-gradient-to-br from-white via-[#bde9ff] to-[#1767e2]" aria-hidden/>{t('nav.home')==='الرئيسية'?'مساعد العيادة':'Clinic assistant'}</button>
    {helpOpen&&<Suspense fallback={<div role="status" className="fixed bottom-5 end-4 z-40 rounded-lg border bg-white p-3 text-sm">{t('common.loading')}</div>}><AssistantPanel key={user?.id} onClose={()=>setHelpOpen(false)}/></Suspense>}
  </div><Dialog open={locked && setupWarning} onOpenChange={setSetupWarning}><DialogContent className="jc-setup-lock-popup" data-testid="clinic-setup-warning" dir={lang==='ar'?'rtl':'ltr'}><DialogHeader><DialogTitle>{lang==='ar'?'كمّل الإعداد أولًا':'Complete setup first'}</DialogTitle><DialogDescription>{lang==='ar'?'لازم تخلص إعداد العيادة قبل استخدام أي جزء من النظام. رح نرجعك لنفس المكان اللي وقفت فيه.':'Finish clinic setup before using the system. You will return to the same place you stopped.'}</DialogDescription></DialogHeader><button type="button" data-testid="clinic-setup-warning-resume" onClick={()=>{setSetupWarning(false);navigate(SETUP_PATH);}}>{lang==='ar'?'ارجع وكمّل السيت أب':'Return to setup'}</button></DialogContent></Dialog></>;
}

export function PageHeader({title,description,action,eyebrow}:{title:string;description?:string;action?:ReactNode;eyebrow?:ReactNode}) {
  return <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow&&<div className="mb-1 text-xs font-medium text-primary">{eyebrow}</div>}
      <h1 className="text-2xl font-bold tracking-tight text-[#1b2d48] sm:text-3xl" data-testid="text-page-title">{title}</h1>
      {description&&<p className="mt-1 max-w-prose text-sm text-[#6a7890]">{description}</p>}
    </div>
    {action&&<div className="shrink-0">{action}</div>}
  </div>;
}

