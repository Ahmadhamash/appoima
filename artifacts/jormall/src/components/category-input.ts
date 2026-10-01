import { el, button } from './concierge/dom';
export const categoryNames = (names: (string | null | undefined)[]) => {
  const unique = new Map<string,string>();
  for (const value of names) { const name=value?.trim().replace(/\s+/g,' ');if(name&&name.length<=80&&!unique.has(name.normalize('NFKC').toLocaleLowerCase()))unique.set(name.normalize('NFKC').toLocaleLowerCase(),name); }
  return [...unique.values()];
};
export function createCategoryInput({id,value,language,options,onChange,onCommit,required=true}:{id:string;value:string;language:'ar'|'en';options:()=>string[];onChange:(value:string)=>void;onCommit?:(value:string)=>void;required?:boolean}) {
  const ar=language==='ar',w=(a:string,e:string)=>ar?a:e;
  const root=el('div','category-picker'),input=el('input'),menu=el('div','category-options');
  input.type='text';input.id=id;input.maxLength=80;input.required=required;input.value=value;input.dir='auto';input.autocomplete='off';input.dataset.testid=id;input.setAttribute('aria-label',w('التصنيف','Category'));
  input.placeholder=w('اكتب التصنيف أو اختر تصنيفًا أضفته','Type a category or choose one you added');
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',`${id}-options`);
  menu.id=`${id}-options`;menu.dataset.testid=menu.id;menu.setAttribute('role','listbox');menu.hidden=true;
  let opened=false,all=false,active=-1,visible:string[]=[];
  const close=()=>{opened=false;draw();};
  const commit=()=>{
    const name=input.value.trim().replace(/\s+/g,' ');
    const existing=categoryNames(options()).find(value=>value.normalize('NFKC').toLocaleLowerCase()===name.normalize('NFKC').toLocaleLowerCase());
    input.value=existing??name;onChange(input.value);if(input.value)onCommit?.(input.value);
  };
  const choose=(name:string)=>{input.value=name;onChange(name);onCommit?.(name);close();input.focus();};
  const trigger=button('⌄',()=>{const was=opened;input.focus();opened=!was;all=true;active=-1;draw();},'category-trigger',`${id}-open-options`);
  trigger.setAttribute('aria-label',w('خيارات التصنيف','Category options'));trigger.setAttribute('aria-haspopup','listbox');trigger.onmousedown=event=>event.preventDefault();
  function draw(){
    const query=input.value.trim().toLocaleLowerCase();visible=categoryNames(options()).filter(name=>all||name.toLocaleLowerCase().includes(query));
    menu.replaceChildren();input.setAttribute('aria-expanded',String(opened));trigger.setAttribute('aria-expanded',String(opened));menu.hidden=!opened;
    visible.forEach((name,index)=>{const option=button(name,()=>choose(name),'category-option');option.dataset.value=name;option.id=`${id}-choice-${index}`;option.setAttribute('role','option');option.setAttribute('aria-selected',String(index===active));option.tabIndex=-1;option.onmousedown=event=>event.preventDefault();menu.append(option);});
    if(!visible.length)menu.append(el('p','category-empty',w('اكتب اسم تصنيف جديد؛ سيظهر ضمن خياراتك.','Enter a new category name; it will appear in your choices.')));
    if(active>=0&&visible[active])input.setAttribute('aria-activedescendant',`${id}-choice-${active}`);else input.removeAttribute('aria-activedescendant');
  }
  input.onfocus=()=>{opened=true;all=false;active=-1;draw();};
  input.oninput=()=>{opened=true;all=false;active=-1;onChange(input.value);draw();};
  input.onblur=()=>{commit();close();};
  input.onkeydown=event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();opened=true;all=true;active=Math.max(0,Math.min(visible.length-1,active+(event.key==='ArrowDown'?1:-1)));draw();}
    if(event.key==='Enter'){event.preventDefault();if(opened&&active>=0&&visible[active])choose(visible[active]!);else{commit();close();}}
  };
  root.append(input,trigger,menu);draw();
  return {node:root,input,setValue(next:string){if(next!==input.value)input.value=next;draw();},refresh:draw};
}
