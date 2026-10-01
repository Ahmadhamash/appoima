import { el } from './dom';
import { setupPager } from './paging';
import type { Language } from './contract';

/** All editor fields stay mounted; only a small group is visible at a time. */
export function reviewRecordPages(card:HTMLDetailsElement,language:Language,key:string){
 const pages:HTMLElement[]=[];
 const page=(node:HTMLElement)=>{const part=el('div','jc-record-page');part.append(node);pages.push(part);};
 const choices=(fieldset:HTMLElement,nodes:HTMLElement[],columns=false)=>{
  for(let index=0;index<nodes.length;index+=6){const part=fieldset.cloneNode(false) as HTMLElement,legend=fieldset.querySelector(':scope>legend');if(legend)part.append(legend.cloneNode(true));const group=el('div',columns?'jc-permissions':'jc-review-choices');group.append(...nodes.slice(index,index+6));part.append(group);page(part);}
 };
 const children=Array.from(card.children) as HTMLElement[];
 for(let index=1;index<children.length;index++){
  const child=children[index]!;
  if(child.classList.contains('jc-record-meta')){child.remove();continue;}
  if(child.classList.contains('jc-remove')){
   const summary=card.querySelector<HTMLElement>(':scope>summary')!;
   const title=el('span','jc-record-title');title.append(...Array.from(summary.childNodes));title.title=title.textContent??'';
   const heading=el('span','jc-record-heading');child.lang=language;
   child.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
   heading.append(title,child);summary.replaceChildren(heading);
   continue;
  }
  if(child.classList.contains('jc-grid')){const fields=Array.from(child.children) as HTMLElement[];for(let offset=0;offset<fields.length;offset+=4){const group=el('div','jc-grid');group.append(...fields.slice(offset,offset+4));page(group);}child.remove();}
  else if(child.querySelector('.jc-permissions')){
   const permissions=child.querySelector<HTMLElement>('.jc-permissions')!,permissionSet=permissions.closest<HTMLElement>('fieldset')!,items=Array.from(permissions.children) as HTMLElement[];
   permissionSet.remove();page(child);choices(permissionSet,items,true);
  }else if(child.classList.contains('jc-selection')){const items=Array.from(child.querySelectorAll<HTMLElement>(':scope>.jc-check'));if(items.length)choices(child,items);else page(child);child.remove();}
  else if(child.tagName==='P'&&children[index+1]?.tagName==='BUTTON'&&!children[index+1]?.classList.contains('jc-remove')){const group=el('div');group.append(child,children[++index]!);page(group);}
  else page(child);
 }
 const body=el('div','jc-record-page-body');body.append(...pages);card.append(body);
 const nav=setupPager(card,pages,language,`concierge-record-${key}-pages`);if(nav){nav.classList.add('jc-record-page-nav');card.insertBefore(nav,body);}
 const invalid=pages.findIndex(part=>!!part.querySelector('.jc-invalid'));if(invalid>=0)card.dispatchEvent(new CustomEvent('jormall:setup-page',{detail:invalid}));
}

export function revealReviewField(card:HTMLDetailsElement,input:HTMLElement){
 const pages=Array.from(card.querySelectorAll<HTMLElement>(':scope>.jc-record-page-body>.jc-record-page'));
 const index=pages.findIndex(part=>part.contains(input));if(index>=0)card.dispatchEvent(new CustomEvent('jormall:setup-page',{detail:index}));
 input.closest('.weekly-schedule')?.dispatchEvent(new CustomEvent('jormall:schedule-reveal',{detail:input.dataset.testid}));
}
