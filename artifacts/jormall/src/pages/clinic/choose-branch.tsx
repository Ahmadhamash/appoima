import {Link,useLocation} from 'wouter';
import {Building2} from 'lucide-react';
import {useManagerBranch} from '@/lib/manager-branch';
import {useI18n} from '@/lib/i18n';

export default function ChooseBranchPage(){
 const {branches,loading,selectBranch}=useManagerBranch(),{lang}=useI18n(),[,navigate]=useLocation(),ar=lang==='ar';
 return <main className="min-h-dvh bg-[#f7f9fd] px-4 py-12" data-testid="choose-manager-branch"><div className="mx-auto max-w-3xl">
  <div className="rounded-3xl bg-[#765e2d] px-7 py-10 text-white shadow-lg"><span className="text-sm text-[#f5e4ba]">{ar?'مساحة عيادتك':'Your clinic workspace'}</span><h1 className="mt-2 text-3xl font-bold">{ar?'أي فرع بدك تدخل عليه؟':'Which branch would you like to open?'}</h1><p className="mt-3 text-sm text-[#f8edcf]">{ar?'اختَر فرع العمل الآن. تقدر تغيّره لاحقًا من القائمة الجانبية.':'Choose your working branch. You can switch later from the sidebar.'}</p></div>
  {loading?<p className="mt-8" role="status">{ar?'جارٍ تحميل الفروع…':'Loading branches…'}</p>:branches.length?<div className="mt-6 grid gap-4 sm:grid-cols-2">{branches.map(branch=><button key={branch.id} type="button" onClick={()=>{selectBranch(branch.id);navigate('/home');}} data-testid={`choose-branch-${branch.id}`} className="focus-ring flex min-h-28 items-center gap-4 rounded-2xl border border-[#e4d7b8] bg-white p-5 text-start shadow-sm transition hover:border-[#a7853e] hover:shadow-md"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-6"/></span><span><strong className="block text-lg text-[#1b2d48]" lang={branch.nameLang} dir={branch.nameLang==='ar'?'rtl':'ltr'}>{branch.name}</strong><small className="mt-1 block text-[#66758a]" dir="ltr">{branch.timeZone}</small></span></button>)}</div>:<div className="mt-6 rounded-2xl border bg-white p-6"><p>{ar?'لسه ما في فروع محفوظة. أضف فرعًا أولًا وأكمل إعداده.':'No branches have been saved yet. Add and complete your first branch.'}</p><Link href="/business/settings" className="mt-4 inline-block rounded-lg bg-[#765e2d] px-4 py-2 text-white">{ar?'إضافة فرع':'Add a branch'}</Link></div>}
 </div></main>;
}
