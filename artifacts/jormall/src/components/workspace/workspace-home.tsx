import {useEffect,useRef,type CSSProperties} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useLocation} from 'wouter';
import {parseWorkspaceProfile,colorHsl,colorForeground,JORMALL_PRIMARY,JORMALL_ACCENT,type WorkspaceRecord} from '@workspace/service-definition';
import {api} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {useI18n} from '@/lib/i18n';
import {can} from '@/lib/setup-api';
import {workspaceSurface,type WorkspaceSection,type WorkspaceAction} from './surface';
import './workspace.css';
export type MyWorkspace=WorkspaceRecord&{sections:WorkspaceSection[];truncated:boolean;pendingServices?:string[]};
export function useClinicWorkspace(){
 const {user}=useAuth();
 return useQuery({queryKey:['clinic-workspace',user?.clinicId,user?.id],enabled:!!user?.clinicId&&!user.mustChangePassword,staleTime:30_000,
  queryFn:async()=>{const data=await api<MyWorkspace>('/me/workspace');const profile=parseWorkspaceProfile(data.profile);if(!profile.logoDataUrl){if(data.sources.primaryColor?.kind==='suggestion')profile.primaryColor=JORMALL_PRIMARY;if(data.sources.accentColor?.kind==='suggestion')profile.accentColor=JORMALL_ACCENT;}return {...data,profile};}});
}
/** Values are scoped to this authenticated shell, never written to documentElement by a draft. */
export function workspaceTheme(record?:MyWorkspace):CSSProperties|undefined {
 if(!record)return undefined;
 const brand=record.profile.primaryColor!,foreground=colorForeground(brand),accent=record.profile.accentColor!;
 return {'--primary':colorHsl(brand),'--primary-foreground':colorHsl(foreground),'--ring':colorHsl(brand),'--sidebar-primary':colorHsl(brand),'--sidebar-primary-foreground':colorHsl(foreground),'--accent':colorHsl(accent),'--accent-foreground':colorHsl(colorForeground(accent))} as CSSProperties;
}
export function WorkspaceHome(){
 const q=useClinicWorkspace(),{user}=useAuth(),{lang:language}=useI18n(),[,navigate]=useLocation(),host=useRef<HTMLDivElement>(null);
 const ar=language==='ar',hasServices=!!user&&can(user,'services.read'),book=!!user&&can(user,'appointments.manage');
 useEffect(()=>{const target=host.current;if(!target||!q.data||!user)return;const w=(a:string,e:string)=>language==='ar'?a:e;
  const available:{permission:string;action:WorkspaceAction}[]=[
   {permission:'appointments.manage',action:{label:w('حجز موعد','Book appointment'),hint:w('موعد جديد بخطوات واضحة','A new appointment in clear steps'),glyph:'+',path:'/appointments/new'}},
   {permission:'appointments.read',action:{label:w('عرض المواعيد','Appointments'),hint:w('تابع جدول العيادة','View the clinic schedule'),glyph:'▦',path:'/appointments/view'}},
   {permission:'services.read',action:{label:w('الخدمات','Services'),hint:w('الخدمات والأسعار المعتمدة','Approved services and prices'),glyph:'≡',path:'/business/services'}},
   {permission:'customers.read',action:{label:w('العملاء','Customers'),hint:w('سجلات العملاء المصرّح بها','Customer records you can access'),glyph:'◎',path:'/people/customers'}},
   {permission:'employees.read',action:{label:w('الموظفون','Staff'),hint:w('الفريق وأوقات العمل','Team and working hours'),glyph:'♙',path:'/people/employees'}},
   {permission:'rooms.read',action:{label:w('الغرف','Rooms'),hint:w('الغرف وتجهيزاتها','Rooms and availability'),glyph:'◇',path:'/business/rooms'}},
   {permission:'appointments.read',action:{label:w('قائمة الانتظار','Waiting list'),hint:w('متابعة طلبات المواعيد','Follow appointment requests'),glyph:'◷',path:'/appointments/waiting-list'}},
   {permission:'settings.read',action:{label:w('الفروع','Branches'),hint:w('بيانات الفروع وأوقات الدوام','Branch details and hours'),glyph:'⌂',path:'/business/settings'}},
   {permission:'inventory.read',action:{label:w('المخزون','Inventory'),hint:w('المواد والمستلزمات','Supplies and materials'),glyph:'▤',path:'/business/inventory'}},
  ];
  if(user.role==='manager'&&['inventory','services','employees','rooms','settings'].every(area=>can(user,`${area}.read`)))available.push({permission:'inventory.read',action:{label:w('المعدات والماتيريال','Equipment & Materials'),hint:w('ربط الموارد وحساب تكلفة الجلسة','Connect resources and calculate session cost'),glyph:'⚙',path:'/business/equipment-materials'}});
  available.push({permission:'services.read',action:{label:w('الباقات والعروض','Packages & Offers'),hint:w('الباقات وصلاحية الجلسات والعروض الترويجية','Packages, session validity and promotional offers'),glyph:'▣',path:'/business/packages-offers'}});
  const actions=available.filter(a=>can(user,a.permission)).map(a=>a.action);
  target.replaceChildren(workspaceSurface(q.data.profile,language,q.data.sections,{onNavigate:navigate,canBook:book,canReadServices:hasServices,compact:!hasServices,actions}));return()=>target.replaceChildren();},[q.data,language,navigate,hasServices,book,user]);
 if(!user?.clinicId)return null;
 return <section className="cw-home" aria-label={ar?'مساحة عيادتك':'Your clinic workspace'}>
  {q.isPending?<p className="cw-loading" role="status">{ar?'جارٍ تحميل مساحة العيادة…':'Loading your clinic workspace…'}</p>:q.isError?<div className="cw-error" role="alert"><p>{ar?'تعذّر تحميل الهوية. أقسام النظام الحالية تبقى متاحة؛ تأكد من تطبيق ترحيل مساحة العمل.':'Could not load clinic identity. Existing system sections remain available; confirm the workspace migration has been applied.'}</p><button className="cw-button" type="button" onClick={()=>void q.refetch()}>{ar?'إعادة المحاولة':'Retry'}</button></div>:null}
  <div ref={host}/>
  {user.role==='manager'&&!!q.data?.pendingServices?.length&&<div className="cw-pending-services" data-testid="workspace-pending-services"><strong>{ar?'خدمات أضفناها إلى الإعداد':'Services added to setup'}</strong><p>{ar?'أكمل السعر والمدة قبل أن تصبح متاحة للحجز.':'Complete price and duration before they become bookable.'}</p><div>{q.data.pendingServices.map((name,index)=><span key={`${name}-${index}`}>{name}</span>)}</div></div>}
  {q.data?.truncated&&<p className="cw-help">{ar?'تظهر أول 200 خدمة نشطة. بقية الخدمات متاحة من قسم الخدمات.':'Showing the first 200 active services. Open Services for the complete catalog.'}</p>}
  {user.role==='manager'&&can(user,'settings.manage')&&<div className="cw-home-tools"><p>{ar?'مساحتك الخاصة، بهوية عيادتك وخدماتها.':'Your private workspace, with your clinic’s identity and services.'}</p><button className="cw-button" type="button" data-testid="workspace-open-setup" onClick={()=>window.dispatchEvent(new Event('jormall:concierge-open'))}>{ar?'تخصيص العيادة':'Customize clinic'}</button></div>}
 </section>;
}
