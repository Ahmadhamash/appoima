import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/setup-api';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { usePackageNotifications, useBillingCommand } from '@/lib/packages-api';
import { useToast } from '@/hooks/use-toast';
import { FormError } from '@/components/form-field';
import { formatInstantTime } from '@/lib/time-format';

export function PackageNotifications() {
  const {user}=useAuth(),{lang,dir}=useI18n(),ar=lang==='ar',w=(a:string,e:string)=>ar?a:e,{toast}=useToast(),errorMessage=useErrorMessage();
  const enabled=!!user?.clinicId&&can(user,'customers.read')&&(can(user,'appointments.read')||['doctor','service_provider'].includes(user.role));
  const q=usePackageNotifications(enabled),command=useBillingCommand(),[open,setOpen]=useState(false),lastSeen=useRef<number|null>(null);
  useEffect(()=>{lastSeen.current=null;setOpen(false);},[user?.id]);
  useEffect(()=>{
    if(!q.data)return;
    if(lastSeen.current!==null)for(const notice of q.data.items.filter(n=>!n.read&&n.id>lastSeen.current!))toast({title:notice.event==='final_check_in'?w('المريض حضر لجلسة الباقة الأخيرة','Patient checked in for the final package session'):w('اكتملت الجلسة الأخيرة وانتهى رصيد الباقة','Final session completed — package exhausted'),description:`${notice.customer} · ${notice.package}`});
    lastSeen.current=Math.max(lastSeen.current??0,...q.data.items.map(n=>n.id));
  },[q.data,toast,lang]);
  if(!enabled)return null;
  return <div className="relative" dir={dir}>
    <button type="button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-label={w('تنبيهات الباقات','Package notifications')} className="focus-ring relative inline-flex size-10 items-center justify-center rounded-xl border hover:bg-primary/10" data-testid="package-notifications-open"><Bell className="size-5"/>{!!q.data?.unread&&<span className="absolute -top-1 -end-1 min-w-5 rounded-full bg-primary px-1 text-xs text-primary-foreground" data-testid="package-notifications-unread">{q.data.unread}</span>}</button>
    {open&&<section className="absolute top-12 end-0 z-30 w-[min(380px,calc(100vw-2rem))] max-h-[70dvh] overflow-y-auto rounded-xl border bg-white p-4 shadow-xl" data-testid="package-notifications-panel" aria-label={w('تنبيهات الباقات','Package notifications')}>
      <div className="flex justify-between items-center gap-2"><h2 className="font-semibold">{w('تنبيهات الباقات','Package notifications')}</h2><button type="button" onClick={()=>setOpen(false)} aria-label={w('إغلاق','Close')}><X className="size-4"/></button></div>
      <FormError message={q.error?errorMessage(q.error):command.error?errorMessage(command.error):undefined}/>
      {q.isPending?<p role="status">{w('تحميل…','Loading…')}</p>:!q.data?.items.length?<p className="mt-3 text-sm">{w('لا توجد تنبيهات بعد.','No notifications yet.')}</p>:<ul className="mt-3 space-y-3">{q.data.items.map(n=><li key={n.id} className={'rounded-lg border p-3 text-sm '+(n.read?'':'bg-primary/5')} data-testid={`package-notification-${n.id}`}>
        <p className="font-semibold">{n.event==='final_check_in'?w('حضور للجلسة الأخيرة','Final session check-in'):w('اكتملت الجلسة الأخيرة — انتهت الباقة','Final session completed — package exhausted')}</p>
        <p>{n.customer} · {n.package}</p><time className="text-xs text-muted-foreground">{formatInstantTime(n.createdAt,'Asia/Amman',lang,true)}</time>
        <div className="mt-2 flex justify-between gap-2"><Link href={`/appointments/${n.appointmentId}`} onClick={()=>setOpen(false)} className="underline">{w('عرض الموعد','View appointment')}</Link>{!n.read&&<button type="button" className="underline" disabled={command.isPending} onClick={()=>command.mutate({path:`/clinic/billing/notifications/${n.id}/read`,body:{}})} data-testid={`package-notification-read-${n.id}`}>{w('تمت القراءة','Mark as read')}</button>}</div>
      </li>)}</ul>}
    </section>}
  </div>;
}
