import { useEffect,useRef } from 'react';
import { createCategoryInput } from './category-input';
export function CategoryField({label,value,options,language,onChange,testId,error,required=true}:{label:string;value:string;options:string[];language:'ar'|'en';onChange:(value:string)=>void;testId:string;error?:string;required?:boolean}){
  const host=useRef<HTMLDivElement>(null),widget=useRef<ReturnType<typeof createCategoryInput>|null>(null),change=useRef(onChange),recent=useRef(new Set<string>()),latest=useRef({value,options});change.current=onChange;latest.current={value,options};
  useEffect(()=>{const input=createCategoryInput({id:testId,value:latest.current.value,language,required,options:()=>[...latest.current.options,...recent.current],onChange:value=>change.current(value),onCommit:value=>{recent.current.add(value);widget.current?.refresh();}});widget.current=input;host.current?.replaceChildren(input.node);return()=>{input.node.remove();widget.current=null;};},[testId,language,required]);
  useEffect(()=>{widget.current?.setValue(value);widget.current?.refresh();},[value,options]);
  return <div className="min-w-0 space-y-1.5"><label htmlFor={testId} className="block text-sm font-medium">{label}{required?' *':''}</label><div ref={host}/>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
