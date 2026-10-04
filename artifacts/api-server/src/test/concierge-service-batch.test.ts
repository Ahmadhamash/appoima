import {describe,expect,it} from 'vitest';
import {applySharedServiceDetails,draftIssues,emptyDraft,mergeDraft,parseDraft} from '../domain/concierge-core';
import {importPublicDetails} from '../domain/concierge-public-import';
import {setupWorkflow,canFinishStep} from '../domain/concierge-workflow';
import {serviceSchema} from '../domain/setup-validation';

describe('Imported service setup',()=>{
 it('groups scraped subservices under the identified parent without creating a duplicate appointment service',()=>{
  const draft=importPublicDetails(emptyDraft(),{branches:[],services:[{name:'Laser hair removal',isSubservice:false},{name:'Full body laser',isSubservice:true,mainServiceName:'Laser hair removal',detail:'Published treatment'},{name:'Beard laser',isSubservice:true,mainServiceName:'Laser hair removal'}]},{branches:[],services:[]});
  expect(draft.services.map(s=>s.name)).toEqual(['Full body laser','Beard laser']);
  expect(draft.services.every(s=>s.category==='Laser hair removal'&&s.definition?.section==='Laser hair removal')).toBe(true);
  expect(draft.services[0]?.definition?.description).toBe('Published treatment');
 });
 it('requires the manager to name missing parents and never saves the placeholder as a service name',()=>{
  const draft=importPublicDetails(emptyDraft(),{branches:[],services:[{name:'Unclassified treatment',isSubservice:true,mainServiceName:null}]},{branches:[],services:[]});
  expect(draft.services[0]?.category).toBeNull();
  draft.services[0]!.category='Please enter the main service name.';
  const parsed=parseDraft(draft);expect(parsed.services[0]?.category).toBeNull();
  expect(draftIssues(parsed).some(i=>i.key===parsed.services[0]!.key&&i.field==='category'&&i.code==='required')).toBe(true);
  expect(canFinishStep('services',parsed,{branches:[],services:[],rooms:[]})).toBe(false);
  expect(JSON.stringify(parsed)).not.toContain('Please enter the main service name');
 });
 it('defaults old and new setup rooms to one client, regardless of an older capacity setting',()=>{
  const room={key:'room_one',name:'Treatment room',nameLang:'en' as const,branchKey:null,capacity:null,serviceKeys:[]};
  expect(parseDraft({...emptyDraft(),rooms:[room,{...room,key:'room_two',capacity:5}]}).rooms.map(r=>r.capacity)).toEqual([1,1]);
 });
 it('uses JOD for every imported service and never asks for a currency',()=>{
  const names=Array.from({length:15},(_,index)=>`Service ${index+1}`);
  const draft=importPublicDetails(emptyDraft(),{branches:[],services:names.map(name=>({name}))},{branches:[],services:[]});
  expect(draft.services).toHaveLength(15);
  expect(draft.services.every(service=>service.currency==='JOD')).toBe(true);
  const workflow=setupWorkflow({draft,companyProfile:{name:'Clinic'},completedSteps:['branches']},'en');
  expect(workflow.step).toBe('services');
  expect(workflow.focus?.field).not.toBe('currency');
  const older=parseDraft({...draft,services:draft.services.map(service=>({...service,currency:null}))});
  expect(older.services.every(service=>service.currency==='JOD')).toBe(true);
  const completed=parseDraft({...draft,services:draft.services.map(service=>({...service,durationMinutes:60,price:'35',category:'Skin',requiresRoom:false,currency:'USD',branchScope:'all'}))});
  expect(completed.services.every(service=>service.currency==='JOD')).toBe(true);
  expect(canFinishStep('services',completed,{branches:[{key:'existing_branch'}],services:[],rooms:[]})).toBe(true);
 });

 it('accepts Jordanian dinars for new services and rejects other currencies',()=>{
  const body={name:'Skin care',nameLang:'en',branchId:null,durationMinutes:45,price:'25',currency:'JOD',category:'Skin',requiresRoom:false,isActive:true,employeeIds:[],definition:null};
  expect(serviceSchema.safeParse(body).success).toBe(true);
  expect(serviceSchema.safeParse({...body,currency:'USD'}).success).toBe(false);
 });

 it('asks for individual service details and never asks which branch when there is only one',()=>{
  const imported=importPublicDetails(emptyDraft(),{branches:[{name:'Karmalite'}],services:['Laser','Skin care'].map(name=>({name}))},{branches:[],services:[]});
  const draft=parseDraft({...imported,branches:imported.branches.map(branch=>({...branch,timeZone:'Asia/Amman',openingHours:{mon:[{open:'09:00',close:'17:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]}}))});
  const services=setupWorkflow({draft,companyProfile:{name:'Karmalite'},completedSteps:['branches']},'ar');
  expect(services.step).toBe('services');
  expect(services.prompt).toContain('كل خدمة');expect(services.prompt).not.toContain('كلهم نفس الشي');
  expect(services.prompt).not.toContain('Laser');
  const complete=parseDraft({...draft,services:draft.services.map(service=>({...service,durationMinutes:45,price:'25',category:'Skin',requiresRoom:true}))});
  const roomStep=setupWorkflow({draft:complete,companyProfile:{name:'Karmalite'},completedSteps:['branches','services']},'ar');
  expect(roomStep.step).toBe('rooms');
  expect(roomStep.prompt).not.toContain('بأي فرع');
  expect(roomStep.prompt).not.toContain('خلصنا القسم');
  const room=parseDraft({...draft,rooms:[{key:'room_one',name:'Treatment room',nameLang:'en',branchKey:null,capacity:1,serviceKeys:[]}]});
  expect(room.rooms[0]?.branchKey).toBe(room.branches[0]?.key);
 });

 it('applies one confirmed answer to similar services without overwriting named exceptions',()=>{
  const previous=importPublicDetails(emptyDraft(),{branches:[],services:['Laser','Skin care','Massage'].map(name=>({name}))},{branches:[],services:[]});
  const answer={...emptyDraft(),services:[{...previous.services[0]!,durationMinutes:60,price:'35',requiresRoom:true}]};
  const updated=applySharedServiceDetails(previous,mergeDraft(previous,answer),answer,'كلهم متشابهين، الساعة بخمسة وثلاثين دينار وبدهم غرفة');
  expect(updated.services.map(service=>[service.durationMinutes,service.price,service.requiresRoom])).toEqual([[60,'35',true],[60,'35',true],[60,'35',true]]);
  const except=applySharedServiceDetails(previous,mergeDraft(previous,answer),answer,'كلهم متشابهين إلا المساج');
  expect(except.services[1]?.price).toBeNull();
 });
});
