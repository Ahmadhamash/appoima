import type { WorkspaceProfile } from '@workspace/service-definition';
import { DAYS, KINDS, type Draft, type Language, type Review, type Week, type Provision } from './contract';
import { el, button } from './dom';
import { text } from './copy';
import { normalizePhone, mainServiceName, SERVICE_TEMPLATES } from '@workspace/service-definition';
import { phoneValidationMessage } from '../phone-input';
import { formatClockTime } from '@/lib/time-format';
import { scheduleFromBranchHours } from '../weekly-schedule-rules';

type Cell = string | number | null | undefined | HTMLElement;
export function buildReview(data:Review,language:Language,callbacks:{save:(draft:Draft)=>Promise<Review|void>;apply:(staff:Provision[])=>Promise<void>;back:()=>void;archiveBranch?:(key:string,draft:Draft)=>Promise<void>;error:(message:string)=>void},profile?:WorkspaceProfile,accessCache=new Map<string,Provision>()):HTMLElement {
 const ar=language==='ar',w=(a:string,e:string)=>ar?a:e,tr=(key:string)=>text(language,key),draft=structuredClone(data.draft),root=el('section','jc-review');root.dataset.testid='concierge-review';
 let dirty=false,busy=false;
 for(const service of draft.services){if(!service.branchScope&&service.branchKey){service.branchScope='branch';dirty=true;}else if(!service.branchScope&&draft.branches.length===1){service.branchScope='branch';service.branchKey=draft.branches[0]!.key;dirty=true;}if(service.currency!=='JOD'){service.currency='JOD';dirty=true;}}
 for(const room of draft.rooms)if(room.capacity!==1){room.capacity=1;dirty=true;}
 const branchName=(key:string|null)=>[...draft.branches,...data.options.branches].find(b=>b.key===key)?.name??'—';
 const serviceNames=(keys:string[]|null)=>keys?.map(key=>[...draft.services,...data.options.services].find(s=>s.key===key)?.name??key).join('، ')||'—';
 const yes=(value:boolean|null|undefined)=>value===null||value===undefined?'—':tr(value?'yes':'no');
 function link(value:string|null|undefined){if(!value)return '—';try{if(!['http:','https:'].includes(new URL(value).protocol))return value;}catch{return value;}const a=el('a','',value);a.href=value;a.target='_blank';a.rel='noopener noreferrer';return a;}
 function table(title:string,headers:string[],rows:{key?:string;group?:string;cells:Cell[]}[]){
  root.append(el('h3','',title));const scroll=el('div','jc-review-table-scroll'),node=el('table','jc-review-table'),caption=el('caption','sr-only',title),head=el('thead'),heading=el('tr'),body=el('tbody');
  for(const label of headers){const th=el('th','',label);th.scope='col';heading.append(th);}head.append(heading);
  let group:string|undefined;for(const row of rows){if(row.group&&row.group!==group){group=row.group;const line=el('tr','jc-review-service-group'),heading=el('th','',group);heading.colSpan=headers.length;heading.scope='rowgroup';line.append(heading);body.append(line);}const line=el('tr');if(row.key)line.dataset.testid=`draft-${row.key}`;for(const [index,value] of row.cells.entries()){const cell=el('td',headers[0]==='#'&&index===0?'jc-review-number':'');if(value instanceof HTMLElement)cell.append(value);else{const content=el('bdi','',value===null||value===undefined||value===''?'—':String(value));if(typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value))content.dir='ltr';cell.append(content);}line.append(cell);}body.append(line);}
  if(!rows.length){const row=el('tr'),cell=el('td','',w('لم تتم إضافة عناصر','No records added'));cell.colSpan=headers.length;row.append(cell);body.append(row);}
  node.append(caption,head,body);scroll.append(node);root.append(scroll);
 }
 const dayLabels:Record<typeof DAYS[number],[string,string]>={mon:['الاثنين','Monday'],tue:['الثلاثاء','Tuesday'],wed:['الأربعاء','Wednesday'],thu:['الخميس','Thursday'],fri:['الجمعة','Friday'],sat:['السبت','Saturday'],sun:['الأحد','Sunday']};
 function hours(week:Week|null|undefined,breaks=false){const list=el('ul','jc-review-hours');for(const day of DAYS){const ranges=week?.[day]??[],line=el('li'),value=el('bdi','',ranges.length?ranges.map(r=>`${formatClockTime(r.open)} – ${formatClockTime(r.close)}`).join('، '):breaks?w('بدون استراحة','No breaks'):w('مغلق','Closed'));if(ranges.length)value.dir='ltr';line.append(el('b','',dayLabels[day][ar?0:1]+': '),value);list.append(line);}return list;}
 if(profile){const logo=profile.logoDataUrl?el('img'):null;if(logo){logo.src=profile.logoDataUrl!;logo.alt=w('شعار المركز','Clinic logo');logo.className='jc-review-logo';}
  table(w('هوية المركز','Clinic identity'),[w('المعلومة','Field'),w('البيانات','Details'),w('المعلومة','Field'),w('البيانات','Details')],[
   {cells:[w('الاسم بالعربية','Arabic name'),profile.nameAr,w('الاسم بالإنجليزية','English name'),profile.nameEn]},
   {cells:[w('الوصف بالعربية','Arabic subtitle'),profile.subtitleAr,w('الوصف بالإنجليزية','English subtitle'),profile.subtitleEn]},
   {cells:[tr('phone'),profile.phone,tr('email'),profile.email]},
   {cells:[w('العنوان','Address'),profile.address,w('الموقع الإلكتروني','Website'),link(profile.website)]},
   {cells:[w('اللون الرئيسي','Primary color'),profile.primaryColor,w('اللون الإضافي','Accent color'),profile.accentColor]},
   {cells:[w('الشعار','Logo'),logo,'','']},
  ]);
 }
 const branchRows=draft.branches.map((b,index)=>{const schedule=scheduleFromBranchHours(b.openingHours??Object.fromEntries(DAYS.map(day=>[day,[]])) as unknown as Week),box=el('div','jc-review-cell-stack');box.append(el('strong','',tr('openingHours')),hours(schedule.workingHours),el('strong','',tr('breaks')),hours(schedule.breaks,true));return{key:b.key,cells:[index+1,b.name,b.address,link(b.mapUrl),b.timeZone??'Asia/Amman',box]};});
 table(tr('branches'),['#',tr('recordName'),w('موقع الفرع','Branch address'),w('رابط الخريطة','Map link'),w('المنطقة الزمنية','Time zone'),w('الفتح والاستراحات','Opening hours and breaks')],branchRows);
 function serviceDetails(service:Draft['services'][number]){const box=el('div','jc-review-cell-stack'),add=(label:string,value:Cell)=>{const line=el('div');line.append(el('b','',label+': '),el('span','',value==null||value===''?'—':String(value)));box.append(line);};add(tr('requiresRoom'),yes(service.requiresRoom));add(w('متابعة / رتوش','Follow-up / Retouch'),yes(!!service.followUpEnabled));
  const definition=service.definition;if(definition){add(w('الوصف','Description'),definition.description);add(w('نوع الخدمة','Service type'),SERVICE_TEMPLATES.find(t=>t.id===definition.template)?.label[language]??definition.template);add(w('الفئة المستهدفة','Audience'),({unspecified:w('غير محدد','Unspecified'),all:w('الجميع','Everyone'),men:w('رجال','Men'),women:w('نساء','Women'),children:w('أطفال','Children')})[definition.audience]);add(w('منطقة الجسم','Body area'),definition.bodyArea);add(w('النطاق الطبي','Medical scope'),definition.medicalScope==='medical'?w('طبي','Medical'):definition.medicalScope==='needs_review'?w('بحاجة للمراجعة','Needs review'):w('خارج النطاق','Out of scope'));
   if(definition.unsupportedCapabilities.length)add(w('متطلبات غير متاحة','Unavailable requirements'),definition.unsupportedCapabilities.join('، '));
   for(const field of definition.intakeFields){const detail=el('div','jc-review-intake');detail.append(el('strong','',field.label),el('span','',`${field.type} · ${field.required?w('إلزامي','Required'):w('اختياري','Optional')}`));if(field.help)detail.append(el('span','',field.help));if(field.options.length)detail.append(el('span','',field.options.join('، ')));box.append(detail);}
  }
  if(service.employeeIds?.length)add(w('الموظفون المؤهلون','Eligible staff'),service.employeeIds.map(id=>data.options.staff?.find(p=>p.id===id)?.name??`#${id}`).join('، '));
  if(service.roomIds?.length)add(w('الغرف المؤهلة','Eligible rooms'),service.roomIds.map(id=>data.options.rooms?.find(r=>r.id===id)?.name??`#${id}`).join('، '));return box;
 }
 const serviceGroups=new Map<string,Draft['services']>();for(const service of draft.services){const name=mainServiceName(service.category)??w('اسم الخدمة الرئيسية مطلوب','Main service name required');serviceGroups.set(name,[...serviceGroups.get(name)??[],service]);}
 let serviceIndex=0;table(tr('services'),['#',w('الخدمة الفرعية','Subservice'),tr('branchKey'),tr('durationMinutes'),w('السعر (JOD)','Price (JOD)'),w('كل تفاصيل الخدمة','All service details')],[...serviceGroups].flatMap(([group,services])=>services.map(s=>({key:s.key,group,cells:[++serviceIndex,s.name,s.branchScope==='all'?tr('clinicWide'):branchName(s.branchKey),s.durationMinutes,s.price,serviceDetails(s)]}))));
 table(tr('rooms'),['#',tr('recordName'),tr('branchKey'),tr('capacity'),tr('serviceKeys')],draft.rooms.map((r,index)=>({key:r.key,cells:[index+1,r.name,branchName(r.branchKey),r.capacity,serviceNames(r.serviceKeys)]})));
 const credentials=new Map<string,{password:HTMLInputElement;checks:Map<string,HTMLInputElement>}>();
 function staffHours(person:Draft['staff'][number]){const box=el('div','jc-review-staff-hours');const shifts=person.branchSchedules?.length?person.branchSchedules:person.branchKey?[{branchKey:person.branchKey,workingHours:person.workingHours,breaks:person.breaks}]:[];
  if(!shifts.length)box.append(el('p','', '—'));
  for(const shift of shifts){const section=el('section');section.append(el('h4','',branchName(shift.branchKey)),hours(shift.workingHours),el('p','jc-label',tr('breaks')),hours(shift.breaks,true));box.append(section);}return box;
 }
 const staffRows=draft.staff.map((person,index)=>{
  const password=el('input');password.type='password';password.minLength=10;password.maxLength=200;password.autocomplete='new-password';password.dir='ltr';password.dataset.testid=`password-${person.key}`;password.id=`password-${person.key}`;password.value=accessCache.get(person.key)?.initialPassword??'';
  const account=el('div','jc-field'),label=el('label','',w('كلمة مرور أولية (10 أحرف على الأقل)','Initial password (at least 10 characters)'));label.htmlFor=password.id;account.append(label,password);
  const permissions=el('div','jc-permissions'),checks=new Map<string,HTMLInputElement>(),defaults=accessCache.get(person.key)?.permissions??data.staffAccess.find(s=>s.key===person.key)?.permissions??[];
  for(const permission of data.grantablePermissions){const [area,operation]=permission.split('.'),label=el('label','jc-check'),check=el('input');check.type='checkbox';check.checked=defaults.includes(permission);check.dataset.testid=`access-${person.key}-${permission}`;label.append(check,el('span','',`${tr(area!)} · ${tr(operation==='manage'?'managePermission':'readPermission')}`));checks.set(permission,check);permissions.append(label);}
  const identity=el('div','jc-review-cell-stack');identity.append(el('strong','',person.name||'—'),el('span','',person.jobTitle||'—'),el('span','',person.role?tr(person.role):'—'));
  const contact=el('div','jc-review-cell-stack');contact.append(el('bdi','',person.email||'—'),el('bdi','',person.phone||'—'));
  const access=el('div','jc-review-cell-stack');access.append(permissions,account);
  credentials.set(person.key,{password,checks});return {key:person.key,cells:[index+1,identity,contact,staffHours(person),serviceNames(person.serviceKeys),access]};
 });
 for(const [key,entry] of credentials){const cache=()=>accessCache.set(key,{key,initialPassword:entry.password.value,permissions:[...entry.checks].filter(([,input])=>input.checked).map(([permission])=>permission)});entry.password.oninput=()=>{cache();};for(const check of entry.checks.values())check.onchange=()=>{cache();};}
 table(tr('staff'),['#',w('الموظف والمسمى والدور','Staff, job title and role'),w('البريد والهاتف','Email and phone'),w('الفروع والدوام والاستراحات','Branches, working hours and breaks'),tr('serviceKeys'),w('الحساب والصلاحيات','Account and permissions')],staffRows);
 if(data.issues.length){const message=el('p','jc-error',w('راجع الحقول الناقصة في قسمها من شريط الخطوات قبل اعتماد الإعداد.','Review missing fields in their section using the step bar before confirming setup.'));message.setAttribute('role','alert');root.append(message);}
 const total=KINDS.reduce((n,k)=>n+draft[k].length,0),confirmation=el('label','jc-check'),confirm=el('input');confirm.type='checkbox';confirm.dataset.testid='concierge-confirm';confirmation.append(confirm,el('span','',w('راجعت البيانات وأوافق على حفظ الإعداد.','I reviewed the details and approve this setup.')));root.append(confirmation);
 const actions=el('div','jc-review-actions'),apply=button(w('اعتمد الإعداد','Confirm setup'),()=>{
  if(busy||!confirm.checked||data.issues.length)return;
  const badPhone=draft.staff.find(p=>p.phone&&!normalizePhone(p.phone));if(badPhone){callbacks.error(phoneValidationMessage(language));return;}
  const provision:Provision[]=[];for(const person of draft.staff){const entry=credentials.get(person.key)!;if(entry.password.value.length<10){callbacks.error(tr('passwordRequired'));entry.password.scrollIntoView({block:'center',inline:'center'});entry.password.focus();return;}provision.push({key:person.key,initialPassword:entry.password.value,permissions:[...entry.checks].filter(([,input])=>input.checked).map(([permission])=>permission)});}
  busy=true;disable(true);void(async()=>{if(dirty){const fresh=await callbacks.save(draft);if(!fresh||fresh.issues.length)return;}await callbacks.apply(provision);})().catch(()=>{}).finally(()=>{for(const p of provision)p.initialPassword='';busy=false;disable(false);});
 },'jc-button jc-primary','concierge-apply');
 function disable(value:boolean){for(const control of root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))control.disabled=value;if(!value)apply.disabled=!confirm.checked||data.issues.length>0||total===0;}
 confirm.onchange=()=>disable(false);actions.append(apply);root.append(actions);disable(false);return root;
}
