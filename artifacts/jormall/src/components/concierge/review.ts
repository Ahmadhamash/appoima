import { DAYS,KINDS,type Draft,type Kind,type Language,type Review,type Week,type Provision } from './contract';
import { el,button } from './dom';
import { text } from './copy';
type Row=Draft[Kind][number];
const emptyWeek=()=>Object.fromEntries(DAYS.map(day=>[day,[]])) as unknown as Week;
export function buildReview(data:Review,language:Language,callbacks:{save:(draft:Draft)=>Promise<void>;apply:(staff:Provision[])=>Promise<void>;back:()=>void;error:(message:string)=>void}):HTMLElement{
 const tr=(k:string)=>text(language,k),draft=structuredClone(data.draft),root=el('section','jc-review');root.dataset.testid='concierge-review';let dirty=false,busy=false;
 const header=el('div');header.append(el('h2','',tr('review')),el('p','jc-muted',tr('draftNote')),el('p','jc-muted',tr('scopeNote')));root.append(header);
 if(data.issues.length){const warning=el('p','jc-error',tr('missing'));warning.setAttribute('role','status');root.append(warning);}
 const credentials=new Map<string,{password:HTMLInputElement;checks:Map<string,HTMLInputElement>}>();
 const savedRoles=new Map(draft.staff.map(p=>[p.key,p.role]));
 const total=KINDS.reduce((sum,k)=>sum+draft[k].length,0);if(!total)root.append(el('p','jc-notice',tr('noDraft')));
 const invalid=(key:string,field:string)=>data.issues.some(i=>i.key===key&&(i.field===field||i.field.startsWith(field+'.')));
 let save:HTMLButtonElement,apply:HTMLButtonElement,confirm:HTMLInputElement;
 function markDirty(){dirty=true;if(save)save.disabled=false;if(apply)apply.disabled=true;if(confirm){confirm.checked=false;confirm.disabled=true;}}
 function labelField(row:Row,key:string,input:HTMLInputElement|HTMLSelectElement){const id=`jc-${row.key}-${key}`;input.id=id;input.dataset.testid=`draft-${row.key}-${key}`;const wrap=el('div','jc-field'+(invalid(row.key,key)?' jc-invalid':'')),label=el('label','jc-label',tr(key==='name'?'recordName':key));label.htmlFor=id;wrap.append(label,input);if(invalid(row.key,key)){input.setAttribute('aria-invalid','true');wrap.append(el('small','jc-muted',tr('required')));}return wrap;}
 function field(row:Row,key:string,type='text'){
  const input=el('input');input.type=type;const record=row as unknown as Record<string,unknown>;input.value=record[key]===null?'':String(record[key]??'');if(type==='text')input.maxLength=key==='name'?120:key==='timeZone'?100:200;if(key==='email')input.maxLength=200;if(key==='phone')input.maxLength=50;if(key==='price'){input.type='number';input.min='0';input.step='.001';}if(type==='number'){input.min='1';input.step='1';}if(['email','phone','timeZone','price','currency'].includes(key))input.dir='ltr';
  input.addEventListener('input',()=>{record[key]=input.value===''?null:type==='number'?Number(input.value):input.value;if(key==='name')record.nameLang=/[\u0600-\u06ff]/u.test(input.value)?'ar':'en';markDirty();});return labelField(row,key,input);
 }
 function select(row:Row,key:string,options:{value:string;label:string}[],emptyLabel='choose'){
  const input=el('select'),record=row as unknown as Record<string,unknown>;const blank=el('option','',tr(emptyLabel));blank.value='';input.append(blank);for(const opt of options){const o=el('option','',opt.label);o.value=opt.value;input.append(o);}input.value=record[key]===null?'':String(record[key]);input.onchange=()=>{record[key]=input.value===''?null:key==='requiresRoom'?input.value==='true':input.value;markDirty();};return labelField(row,key,input);
 }
 function schedule(row:Row,key:'openingHours'|'workingHours'|'breaks'){
  const record=row as unknown as Record<string,unknown>,fieldset=el('fieldset','jc-week'),legend=el('legend','',tr(key));fieldset.append(legend);if(invalid(row.key,key))legend.append(el('span','',` · ${tr('required')}`));
  const body=el('div');fieldset.append(body);
  const render=()=>{body.replaceChildren();let week=record[key] as Week|null;
   if(!week){body.append(el('p','jc-muted',tr('scheduleUnknown')),button(tr(key==='breaks'?'noBreaks':'closedWeek'),()=>{record[key]=emptyWeek();markDirty();render();},'jc-link'));}
   for(const day of DAYS){const line=el('div','jc-day'),dayLabel=el('div','jc-day-name',tr(day)),ranges=el('div','jc-ranges');line.append(dayLabel,ranges);const current=week?.[day]??[];
    if(week&&current.length===0)ranges.append(el('span','jc-muted',tr('closed')));
    current.forEach((range,index)=>{const r=el('div','jc-range');for(const slot of ['open','close'] as const){const label=el('label','',tr(slot==='open'?'openTime':'closeTime')),input=el('input');input.type='time';input.value=range[slot];input.required=true;input.setAttribute('aria-label',`${tr(day)} ${tr(key)} ${tr(slot==='open'?'openTime':'closeTime')}`);input.oninput=()=>{range[slot]=input.value;markDirty();};label.append(input);r.append(label);}r.append(button('×',()=>{current.splice(index,1);markDirty();render();},'jc-link'));(r.lastElementChild as HTMLElement).setAttribute('aria-label',tr('removeRange'));ranges.append(r);});
    const add=button(`+ ${tr('addRange')}`,()=>{if(!record[key])record[key]=emptyWeek();const w=record[key] as Week;w[day].push({open:'',close:''});markDirty();render();},'jc-link');add.disabled=current.length>=8;ranges.append(add);body.append(line);
   }
  };render();return fieldset;
 }
 const branchOptions=[...data.options.branches.map(b=>({value:b.key,label:b.name})),...draft.branches.filter(b=>!data.options.branches.some(e=>e.key===b.key)).map(b=>({value:b.key,label:b.name??tr('newRecord')}))];
 const serviceOptions=[...data.options.services.map(s=>({value:s.key,label:s.name})),...draft.services.map(s=>({value:s.key,label:s.name??tr('newRecord')}))];
 function services(row:Row){const record=row as unknown as Record<string,unknown>,set=el('fieldset','jc-selection');set.append(el('legend','',tr('serviceKeys')));const choices=[{value:'',label:tr('noServices')},...serviceOptions];const inputs:HTMLInputElement[]=[];
  for(const opt of choices){const label=el('label','jc-check'),check=el('input');check.type='checkbox';check.value=opt.value;const selected=record.serviceKeys as string[]|null;check.checked=opt.value?!!selected?.includes(opt.value):selected?.length===0;inputs.push(check);label.append(check,el('span','',opt.label));check.onchange=()=>{if(opt.value===''){if(check.checked)for(const c of inputs)if(c!==check)c.checked=false;}else if(check.checked)inputs[0]!.checked=false;const v=inputs.filter(c=>c.value&&c.checked).map(c=>c.value);record.serviceKeys=v.length?v:inputs[0]!.checked?[]:null;markDirty();};set.append(label);}if(!serviceOptions.length)set.append(el('p','jc-muted',tr('noCompatible')));return set;
 }
 for(const kind of KINDS){if(!draft[kind].length)continue;root.append(el('h3','',tr(kind)));
  for(const row of draft[kind]){const card=el('details','jc-record');card.open=!!data.issues.find(i=>i.key===row.key)||kind==='staff';card.dataset.testid=`draft-${row.key}`;const summary=el('summary','',row.name??tr('newRecord'));summary.lang=row.nameLang??language;card.append(summary);
   card.append(el('p','jc-record-meta','existingId' in row&&row.existingId!==null?tr('existing'):tr('newRecord')));
   const grid=el('div','jc-grid');grid.append(field(row,'name'),select(row,'nameLang',[{value:'ar',label:tr('ar')},{value:'en',label:tr('en')}]));
   if(kind==='branches'){grid.append(field(row,'timeZone'));card.append(grid,schedule(row,'openingHours'));}
   else {
    grid.append(select(row,'branchKey',branchOptions,kind==='rooms'?'choose':'clinicWide'));
    if(kind==='services'){grid.append(field(row,'durationMinutes','number'),field(row,'price'),field(row,'currency'),select(row,'category',['Hair','Nails','Skin','Laser','Massage','Makeup','Other'].map(value=>({value,label:tr(value)}))),select(row,'requiresRoom',[{value:'true',label:tr('yes')},{value:'false',label:tr('no')} ]));card.append(grid);}
    if(kind==='rooms'){grid.append(field(row,'capacity','number'));card.append(grid,services(row));}
    if(kind==='staff'){
     grid.append(field(row,'email','email'),field(row,'phone','tel'),field(row,'jobTitle'),select(row,'role',['secretary','doctor','service_provider','other_staff'].map(value=>({value,label:tr(value)}))));card.append(grid,services(row),schedule(row,'workingHours'),schedule(row,'breaks'));
     const secure=el('fieldset','jc-selection');secure.append(el('legend','',tr('accountReview')),el('p','jc-muted',tr('passwordNote')));const password=el('input');password.type='password';password.minLength=10;password.maxLength=200;password.autocomplete='new-password';password.dir='ltr';password.dataset.testid=`password-${row.key}`;secure.append(labelField(row,'password',password));
     const pset=el('fieldset','jc-selection');pset.append(el('legend','',tr('permissions')));const permissions=el('div','jc-permissions'),checks=new Map<string,HTMLInputElement>();const defaults=data.staffAccess.find(s=>s.key===row.key)?.permissions??[];
     for(const permission of data.grantablePermissions){const [area,operation]=permission.split('.'),label=el('label','jc-check'),check=el('input');check.type='checkbox';check.checked=defaults.includes(permission);check.dataset.testid=`access-${row.key}-${permission}`;label.append(check,el('span','',`${tr(area!)} · ${tr(operation==='manage'?'managePermission':'readPermission')}`));checks.set(permission,check);permissions.append(label);}pset.append(permissions);secure.append(pset);card.append(secure);credentials.set(row.key,{password,checks});
    }
   }
   card.append(button(tr('remove'),()=>{if(!window.confirm(tr('deleteConfirm')))return;const list=draft[kind] as Row[],i=list.findIndex(r=>r.key===row.key);if(i>=0)list.splice(i,1);credentials.delete(row.key);card.remove();markDirty();},'jc-link jc-remove',`remove-${row.key}`));root.append(card);
  }
 }
 const confirmation=el('label','jc-check');confirm=el('input');confirm.type='checkbox';confirm.dataset.testid='concierge-confirm';confirmation.append(confirm,el('span','',tr('confirm')));root.append(confirmation);
 const actions=el('div','jc-review-actions');
 save=button(tr('saveDraft'),()=>{if(busy)return;busy=true;disable(true);void callbacks.save(draft).catch(()=>{}).finally(()=>{busy=false;disable(false);});},'jc-button','concierge-save-draft');
 apply=button(tr('apply'),()=>{if(busy||dirty||!confirm.checked)return;const provision:Provision[]=[];
  for(const person of draft.staff){if(savedRoles.get(person.key)!==person.role){callbacks.error(tr('missing'));return;}const c=credentials.get(person.key)!;if(c.password.value.length<10){callbacks.error(tr('passwordRequired'));c.password.focus();return;}provision.push({key:person.key,initialPassword:c.password.value,permissions:[...c.checks].filter(([,input])=>input.checked).map(([p])=>p)});}
  busy=true;disable(true);void callbacks.apply(provision).catch(()=>{}).finally(()=>{for(const p of provision)p.initialPassword='';busy=false;disable(false);});
 },'jc-button jc-primary','concierge-apply');
 function disable(value:boolean){for(const c of root.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select'))c.disabled=value;if(!value){save.disabled=!dirty;apply.disabled=dirty||!confirm.checked||data.issues.length>0||total===0;confirm.disabled=dirty;}}
 confirm.onchange=()=>{apply.disabled=!confirm.checked||dirty||data.issues.length>0||total===0;};
 actions.append(button(tr('back'),()=>{if(dirty&&!window.confirm(tr('leaveReview')))return;for(const c of credentials.values())c.password.value='';callbacks.back();},'jc-link','concierge-review-back'),save,apply);root.append(actions);disable(false);return root;
}
