import { el } from './dom';
import { setupPager } from './paging';
import type { Language } from './contract';

export function infoPages(host:HTMLElement,content:HTMLElement,language:Language,id:string){
 const parts:HTMLElement[]=[];
 for(const node of Array.from(content.querySelectorAll<HTMLElement>('.jc-import-detail-line,.jc-import-detail-logo'))){
  const value=node.querySelector('p');
  if(value&&(value.textContent?.length??0)>350){const text=value.textContent!;for(let index=0;index<text.length;index+=350){const part=node.cloneNode(true) as HTMLElement;part.querySelector('p')!.textContent=text.slice(index,index+350);parts.push(part);}}
  else parts.push(node);
 }
 if(!parts.length)parts.push(content);
 host.replaceChildren(...parts);const nav=setupPager(host,parts,language,id);if(nav)host.prepend(nav);
}
