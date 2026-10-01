import { useEffect, useRef } from 'react';
import { createStaffBranchSchedules, type BranchShift, type ShiftBranch } from './staff-branch-schedules';
export function StaffBranchField({branches,value,language,onChange,id='staff-branches'}:{branches:ShiftBranch[];value:BranchShift[];language:'ar'|'en';onChange:(value:BranchShift[])=>void;id?:string}){
 const host=useRef<HTMLDivElement>(null),widget=useRef<ReturnType<typeof createStaffBranchSchedules>|null>(null),callback=useRef(onChange),latest=useRef(value);callback.current=onChange;latest.current=value;
 useEffect(()=>{const editor=createStaffBranchSchedules(branches,latest.current,language,id,next=>callback.current(next));widget.current=editor;host.current?.replaceChildren(editor.node);return()=>{editor.node.remove();widget.current=null;};},[JSON.stringify(branches),language,id]);
 useEffect(()=>widget.current?.setValue(value),[value]);
 return <div ref={host}/>;
}
