import type { WorkspaceProfile } from '@workspace/service-definition';
import { DAYS, KINDS, type Draft, type Language, type Review, type Week, type Provision } from './contract';
import { el, button } from './dom';
import { text } from './copy';
import { normalizePhone, mainServiceName, SERVICE_TEMPLATES } from '@workspace/service-definition';
import { phoneValidationMessage } from '../phone-input';
import { formatClockTime } from '@/lib/time-format';
import { scheduleFromBranchHours } from '../weekly-schedule-rules';
import { buildIdentityCard, createReviewSections, reviewIcon } from './review-layout';

type Cell = string | number | null | undefined | HTMLElement;
export function buildReview(data:Review,language:Language,callbacks:{save:(draft:Draft)=>Promise<Review|void>;apply:(staff:Provision[])=>Promise<void>;back:()=>void;archiveBranch?:(key:string,draft:Draft)=>Promise<void>;error:(message:string)=>void},profile?:WorkspaceProfile,accessCache=new Map<string,Provision>()):HTMLElement {
 const ar=language==='ar',w=(a:string,e:string)=>ar?a:e,tr=(key:string)=>text(language,key),draft=structuredClone(data.draft),root=el('section','jc-review jc-review-overview');root.dataset.testid='concierge-review';
 let dirty=false,busy=false;
 for(const service of draft.services){if(!service.branchScope&&service.branchKey){service.branchScope='branch';dirty=true;}else if(!service.branchScope&&draft.branches.length===1){service.branchScope='branch';service.branchKey=draft.branches[0]!.key;dirty=true;}if(service.currency!=='JOD'){service.currency='JOD';dirty=true;}}
 for(const room of draft.rooms)if(room.capacity!==1){room.capacity=1;dirty=true;}
 const layout=createReviewSections(language,Object.fromEntries(KINDS.map(kind=>[kind,draft[kind].length])) as Record<keyof Draft,number>);
 if(profile)root.append(buildIdentityCard(profile,language));
 root.append(layout.card,layout.panels);
 const branchName=(key:string|null)=>[...draft.branches,...data.options.branches].find(b=>b.key===key)?.name??'—';
 const serviceNames=(keys:string[]|null)=>keys?.map(key=>[...draft.services,...data.options.services].find(s=>s.key===key)?.name??key).join('، ')||'—';
 const yes=(value:boolean|null|undefined)=>value===null||value===undefined?'—':tr(value?'yes':'no');
 function link(value:string|null|undefined){if(!value)return '—';try{if(!['http:','https:'].includes(new URL(value).protocol))return value;}catch{return value;}const a=el('a','',value);a.href=value;a.target='_blank';a.rel='noopener noreferrer';return a;}
 function table(kind:keyof Draft,title:string,headers:string[],rows:{key?:string;group?:string;cells:Cell[]}[]){
  const host=layout.sections.get(kind)!;const scroll=el('div','jc-review-table-scroll'),node=el('table','jc-review-table'),caption=el('caption','sr-only',title),head=el('thead'),heading=el('tr'),body=el('tbody');
  for(const label of headers){const th=el('th','',label);th.scope='col';heading.append(th);}head.append(heading);
  let group:string|undefined;for(const row of rows){if(row.group&&row.group!==group){group=row.group;const line=el('tr','jc-review-service-group'),heading=el('th','',group);heading.colSpan=headers.length;heading.scope='rowgroup';line.append(heading);body.append(line);}const line=el('tr');if(row.key)line.dataset.testid=`draft-${row.key}`;for(const [index,value] of row.cells.entries()){const cell=el('td',headers[0]==='#'&&index===0?'jc-review-number':'');if(value instanceof HTMLElement)cell.append(value);else{const content=el('bdi','',value===null||value===undefined||value===''?'—':String(value));if(typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value))content.dir='ltr';cell.append(content);}line.append(cell);}body.append(line);}
  if(!rows.length){const row=el('tr'),cell=el('td','',w('لم تتم إضافة عناصر','No records added'));cell.colSpan=headers.length;row.append(cell);body.append(row);}
  node.append(caption,head,body);scroll.append(node);host.append(scroll);
 }
 const dayLabels:Record<typeof DAYS[number],[string,string]>={mon:['الاثنين','Monday'],tue:['الثلاثاء','Tuesday'],wed:['الأربعاء','Wednesday'],thu:['الخميس','Thursday'],fri:['الجمعة','Friday'],sat:['السبت','Saturday'],sun:['الأحد','Sunday']};
 function hours(week:Week|null|undefined,breaks=false){const list=el('ul','jc-review-hours');for(const day of DAYS){const ranges=week?.[day]??[],line=el('li'),value=el('bdi','',ranges.length?ranges.map(r=>`${formatClockTime(r.open)} – ${formatClockTime(r.close)}`).join('، '):breaks?w('بدون استراحة','No breaks'):w('مغلق','Closed'));if(ranges.length)value.dir='ltr';line.append(el('b','',dayLabels[day][ar?0:1]+': '),value);list.append(line);}return list;}
 const branchRows=draft.branches.map((b,index)=>{const schedule=scheduleFromBranchHours(b.openingHours??Object.fromEntries(DAYS.map(day=>[day,[]])) as unknown as Week),box=el('div','jc-review-cell-stack');box.append(el('strong','',tr('openingHours')),hours(schedule.workingHours),el('strong','',tr('breaks')),hours(schedule.breaks,true));return{key:b.key,cells:[index+1,b.name,b.address,link(b.mapUrl),b.timeZone??'Asia/Amman',box]};});
 table('branches',tr('branches'),['#',tr('recordName'),w('موقع الفرع','Branch address'),w('رابط الخريطة','Map link'),w('المنطقة الزمنية','Time zone'),w('الفتح والاستراحات','Opening hours and breaks')],branchRows);
 function serviceDetails(service:Draft['services'][number]){const box=el('div','jc-review-cell-stack'),add=(label:string,value:Cell)=>{const line=el('div');line.append(el('b','',label+': '),el('span','',value==null||value===''?'—':String(value)));box.append(line);};add(tr('requiresRoom'),yes(service.requiresRoom));add(w('متابعة / رتوش','Follow-up / Retouch'),yes(!!service.followUpEnabled));
  const definition=service.definition;if(definition){add(w('الوصف','Description'),definition.description);add(w('نوع الخدمة','Service type'),SERVICE_TEMPLATES.find(t=>t.id===definition.template)?.label[language]??definition.template);add(w('الفئة المستهدفة','Audience'),({unspecified:w('غير محدد','Unspecified'),all:w('الجميع','Everyone'),men:w('رجال','Men'),women:w('نساء','Women'),children:w('أطفال','Children')})[definition.audience]);add(w('منطقة الجسم','Body area'),definition.bodyArea);add(w('النطاق الطبي','Medical scope'),definition.medicalScope==='medical'?w('طبي','Medical'):definition.medicalScope==='needs_review'?w('بحاجة للمراجعة','Needs review'):w('خارج النطاق','Out of scope'));
   if(definition.unsupportedCapabilities.length)add(w('متطلبات غير متاحة','Unavailable requirements'),definition.unsupportedCapabilities.join('، '));
   for(const field of definition.intakeFields){const detail=el('div','jc-review-intake');detail.append(el('strong','',field.label),el('span','',`${field.type} · ${field.required?w('إلزامي','Required'):w('اختياري','Optional')}`));if(field.help)detail.append(el('span','',field.help));if(field.options.length)detail.append(el('span','',field.options.join('، ')));box.append(detail);}
  }
  if(service.employeeIds?.length)add(w('الموظفون المؤهلون','Eligible staff'),service.employeeIds.map(id=>data.options.staff?.find(p=>p.id===id)?.name??`#${id}`).join('، '));
  if(service.roomIds?.length)add(w('الغرف المؤهلة','Eligible rooms'),service.roomIds.map(id=>data.options.rooms?.find(r=>r.id===id)?.name??`#${id}`).join('، '));return box;
 }
 const serviceGroups=new Map<string,Draft['services']>();for(const service of draft.services){const name=mainServiceName(service.category)??w('اسم الخدمة الرئيسية مطلوب','Main service name required');serviceGroups.set(name,[...serviceGroups.get(name)??[],service]);}
 let serviceIndex=0;table('services',tr('services'),['#',w('الخدمة الفرعية','Subservice'),tr('branchKey'),tr('durationMinutes'),w('السعر (JOD)','Price (JOD)'),w('كل تفاصيل الخدمة','All service details')],[...serviceGroups].flatMap(([group,services])=>services.map(s=>({key:s.key,group,cells:[++serviceIndex,s.name,s.branchScope==='all'?tr('clinicWide'):branchName(s.branchKey),s.durationMinutes,s.price,serviceDetails(s)]}))));
 table('rooms',tr('rooms'),['#',tr('recordName'),tr('branchKey'),tr('capacity'),tr('serviceKeys')],draft.rooms.map((r,index)=>({key:r.key,cells:[index+1,r.name,branchName(r.branchKey),r.capacity,serviceNames(r.serviceKeys)]})));
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
 for(const [key,entry] of credentials){const cache=()=>accessCache.set(key,{key,initialPassword:entry.password.value,permissions:[...entry.checks].filter(([,input])=>input.checked).map(([permission])=>permission)});entry.password.oninput=()=>{cache();refreshStatus();if([...credentials.values()].every(account=>account.password.value.length>=10))callbacks.error('');};for(const check of entry.checks.values())check.onchange=()=>{cache();};}
 table('staff',tr('staff'),['#',w('الموظف والمسمى والدور','Staff, job title and role'),w('البريد والهاتف','Email and phone'),w('الفروع والدوام والاستراحات','Branches, working hours and breaks'),tr('serviceKeys'),w('الحساب والصلاحيات','Account and permissions')],staffRows);
 if(data.issues.length){const message=el('p','jc-error',w('راجع الحقول الناقصة في قسمها من شريط الخطوات قبل اعتماد الإعداد.','Review missing fields in their section using the step bar before confirming setup.'));message.setAttribute('role','alert');root.append(message);}
 const total=KINDS.reduce((n,k)=>n+draft[k].length,0);
 const actions=el('div','jc-review-actions'),apply=button(w('اعتمد الإعداد','Confirm setup'),()=>{
  if(busy||data.issues.length||total===0)return;
  const badPhone=draft.staff.find(p=>p.phone&&!normalizePhone(p.phone));if(badPhone){layout.reveal('staff',true,true);callbacks.error(phoneValidationMessage(language));return;}
  const provision:Provision[]=[];for(const person of draft.staff){const entry=credentials.get(person.key)!;if(entry.password.value.length<10){layout.reveal('staff',true);callbacks.error(tr('passwordRequired'));entry.password.scrollIntoView({block:'center',inline:'center'});entry.password.focus();return;}provision.push({key:person.key,initialPassword:entry.password.value,permissions:[...entry.checks].filter(([,input])=>input.checked).map(([permission])=>permission)});}
  busy=true;apply.firstChild!.textContent=w('جارٍ حفظ الإعداد…','Saving setup…');disable(true);void(async()=>{if(dirty){const fresh=await callbacks.save(draft);if(!fresh||fresh.issues.length)return;}await callbacks.apply(provision);})().catch(()=>{}).finally(()=>{for(const p of provision)p.initialPassword='';busy=false;apply.firstChild!.textContent=w('اعتمد الإعداد','Confirm setup');disable(false);});
 },'jc-button jc-primary','concierge-apply');
 function refreshStatus(){
  const pendingAccess=[...credentials.values()].some(entry=>entry.password.value.length<10),valid=!data.issues.length&&!pendingAccess;
  layout.status.dataset.ready=String(valid);layout.status.replaceChildren(reviewIcon(valid?'check':'shield'),el('span','',data.issues.length?w('معلومات تحتاج مراجعة','Details need review'):pendingAccess?w('أكمل بيانات دخول الموظفين','Complete staff sign-in details'):w('كل الأقسام مكتملة','All sections completed')));
  for(const kind of KINDS){const keys=draft[kind].map(row=>row.key),needsReview=data.issues.some(issue=>issue.key===kind||keys.includes(issue.key))||kind==='staff'&&pendingAccess;layout.controls.get(kind)!.dataset.needsReview=String(needsReview);}
 }
 function disable(value:boolean){for(const control of root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))control.disabled=value;if(!value)apply.disabled=data.issues.length>0||total===0;}
 const note=el('div','jc-overview-confirm-note'),copy=el('div');copy.append(el('strong','',w('بقيت الخطوة الأخيرة!','Almost there!')),el('p','',w('راجع معلوماتك واعتمدها لإكمال إعداد العيادة.','Review your information and confirm to complete the clinic setup.')));note.append(reviewIcon('shield'),copy);
 apply.append(reviewIcon('arrow'));actions.append(note,apply);root.append(actions);refreshStatus();disable(false);return root;
}
