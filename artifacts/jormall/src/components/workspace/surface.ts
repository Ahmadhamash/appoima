import {workspaceName,workspaceSubtitle,colorForeground,validWorkspaceLogo,type WorkspaceProfile} from '@workspace/service-definition';
export type WorkspaceSection={name:string;serviceIds:number[];serviceNames:string[]};
export type WorkspaceAction={label:string;hint:string;glyph:string;path:string};
export type SurfaceOptions={preview?:boolean;onNavigate?:(path:string)=>void;canBook?:boolean;canReadServices?:boolean;compact?:boolean;actions?:WorkspaceAction[]};
function node<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,text?:string){const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;}
/** The same safe renderer is used by the owner's preview and the real signed-in home. */
export function workspaceSurface(profile:WorkspaceProfile,language:'ar'|'en',sections:WorkspaceSection[],options:SurfaceOptions={}):HTMLElement {
 const ar=language==='ar',w=(a:string,e:string)=>ar?a:e;
 const root=node('section','cw-surface');root.dir=ar?'rtl':'ltr';root.lang=language;root.dataset.testid='clinic-workspace-surface';
 root.style.setProperty('--cw-brand',profile.primaryColor!);root.style.setProperty('--cw-brand-fg',colorForeground(profile.primaryColor!));root.style.setProperty('--cw-accent',profile.accentColor!);
 const hero=node('div','cw-hero'),identity=node('div','cw-identity'),logo=node('div','cw-logo');
 if(validWorkspaceLogo(profile.logoDataUrl)){const img=node('img','');img.src=profile.logoDataUrl;img.alt=workspaceName(profile,language);logo.append(img);}else{logo.textContent=workspaceName(profile,language).slice(0,1);logo.setAttribute('aria-hidden','true');}
 const title=node('div','cw-identity-copy');title.append(node('p','cw-kicker',w('بوابة العيادة','CLINIC WORKSPACE')),node('h2','cw-title',workspaceName(profile,language)));
 const subtitle=workspaceSubtitle(profile,language);if(subtitle)title.append(node('p','cw-subtitle',subtitle));
 if(!subtitle)title.append(node('p','cw-subtitle',w('كل ما يحتاجه فريقك لإدارة الخدمات والمواعيد في مكان واحد.','Everything your team needs for services and appointments in one place.')));
 identity.append(logo,title);hero.append(identity);
 const status=node('span','cw-private',options.preview?w('معاينة داخلية','Internal preview'):w('نظام المواعيد','Appointment system'));hero.append(status);
 root.append(hero);
 const contact=[profile.phone,profile.address].filter(Boolean).join(' · ');
 if(contact)root.append(node('p','cw-contact',contact));
 const actions=options.actions??[
  {label:w('حجز موعد','Book appointment'),hint:w('موعد جديد بخطوات واضحة','A new appointment in clear steps'),glyph:'+',path:'/appointments/new'},
  {label:w('عرض المواعيد','Appointments'),hint:w('تابع جدول العيادة','View the clinic schedule'),glyph:'▦',path:'/appointments/view'},
  {label:w('الخدمات','Services'),hint:w('الخدمات والأسعار المعتمدة','Approved services and prices'),glyph:'≡',path:'/business/services'},
  {label:w('العملاء','Customers'),hint:w('بيانات العملاء المصرّح بها','Customer records you can access'),glyph:'◎',path:'/people/customers'},
  {label:w('الموظفون','Staff'),hint:w('الفريق وأوقات العمل','Team and working hours'),glyph:'♙',path:'/people/employees'},
  {label:w('الغرف','Rooms'),hint:w('الغرف وتجهيزاتها','Rooms and availability'),glyph:'◇',path:'/business/rooms'},
 ];
 if(actions.length){const grid=node('nav','cw-action-grid');grid.setAttribute('aria-label',w('اختصارات العيادة','Clinic shortcuts'));for(const action of actions){const a=node('a','cw-action-tile');a.href=action.path;if(options.preview){a.removeAttribute('href');a.setAttribute('aria-disabled','true');}else if(options.onNavigate)a.onclick=e=>{e.preventDefault();options.onNavigate!(action.path);};a.append(node('span','cw-action-glyph',action.glyph),node('strong','',action.label),node('small','',action.hint));grid.append(a);}root.append(grid);}
 if(!options.compact){
  const heading=node('div','cw-section-top');heading.append(node('h3','',w('أقسام خدمات عيادتك','Your clinic’s service sections')),node('span','cw-count',String(sections.length)));root.append(heading);
  if(!sections.length)root.append(node('p','cw-empty',w('أضف الخدمات التي تقدّمها عيادتك فقط؛ ستظهر أقسامها هنا.','Add only services your clinic offers. Their sections will appear here.')));
  else {const grid=node('div','cw-section-grid');
   for(const [index,group] of sections.entries()){
    const card=node('article','cw-section-card'),top=node('div','cw-section-card-top');top.append(node('span','cw-section-number',String(index+1).padStart(2,'0')),node('span','cw-card-count',w(`${group.serviceNames.length} خدمات`,`${group.serviceNames.length} services`)));
    card.append(top,node('h4','',group.name||w('خدمات العيادة','Clinic services')));
    const names=node('ul','cw-service-names');for(const name of group.serviceNames.slice(0,3))names.append(node('li','',name));card.append(names);
    if(group.serviceNames.length>3)card.append(node('p','cw-more',w(`و${group.serviceNames.length-3} خدمات أخرى`,`${group.serviceNames.length-3} more services`)));
    const footer=node('div','cw-card-actions');
    const link=(label:string,path:string)=>{const a=node('a','cw-action',label);a.href=path;if(options.preview){a.removeAttribute('href');a.setAttribute('aria-disabled','true');}else a.onclick=e=>{if(options.onNavigate){e.preventDefault();options.onNavigate(path);}};return a;};
    if(options.preview||options.canReadServices)footer.append(link(w('إدارة الخدمات ←','Manage services →'),'/business/services'));
    if(!options.preview&&options.canBook)footer.append(link(w('حجز موعد','Book appointment'),'/appointments/new'));
    card.append(footer);grid.append(card);
   }root.append(grid);
  }
 }
 if(options.preview)root.append(node('p','cw-preview-note',w('معاينة لداخل النظام فقط. لا موقع عام ولا خطوة نشر.','This previews the signed-in system only. No public site or publishing step.')));
 return root;
}
