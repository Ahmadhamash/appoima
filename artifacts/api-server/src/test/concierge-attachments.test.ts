import { describe, expect, it } from 'vitest';
import { uploadMime } from '../concierge/media';
import { emptyDraft, parseDraft, draftIssues, type ModelReply } from '../domain/concierge-core';
import { createDefinition } from '@workspace/service-definition';
import { importPublicDetails } from '../domain/concierge-public-import';
import { setupWorkflow, previousSetupStep } from '../domain/concierge-workflow';
import { uploadedIdentity } from '../domain/concierge-file-identity';
import { attachmentContent } from '../concierge/providers';

describe('Setup attachments and Jordan defaults',()=>{
 it('reopens the immediately previous step while retaining earlier confirmations',()=>{
  const completed=['branches','services','rooms','staff'] as const;
  expect(previousSetupStep('review',[...completed])).toEqual({previous:'staff',completed:['branches','services','rooms']});
  expect(previousSetupStep('staff',[...completed])).toEqual({previous:'rooms',completed:['branches','services']});
  expect(previousSetupStep('rooms',[...completed])).toEqual({previous:'services',completed:['branches']});
  expect(previousSetupStep('services',[...completed])).toEqual({previous:'branches',completed:[]});
  expect(previousSetupStep('branches',[...completed])).toEqual({previous:'company',completed:[]});
 });
 it('sets Amman automatically for old and new drafts and skips the timezone question',()=>{
  const draft=importPublicDetails(emptyDraft(),{branches:[{name:'Clinic'}],services:[]},{branches:[],services:[]});
  expect(draft.branches[0]?.timeZone).toBe('Asia/Amman');
  expect(parseDraft({...draft,branches:draft.branches.map(branch=>({...branch,timeZone:'UTC'}))}).branches[0]?.timeZone).toBe('Asia/Amman');
  const flow=setupWorkflow({draft,companyProfile:{name:'Clinic'}},'ar');
  expect(flow.focus?.field).toBe('openingHours');expect(flow.prompt).not.toContain('المنطقة الزمنية');
 });
 it('never assumes imported services are offered at all branches',()=>{
  const draft=importPublicDetails(emptyDraft(),{branches:[{name:'One'},{name:'Two'}],services:[{name:'Laser'}]},{branches:[],services:[]});
  expect(draft.services[0]?.branchScope).toBeNull();expect(draft.services[0]?.branchKey).toBeNull();
  const sole=importPublicDetails(emptyDraft(),{branches:[{name:'One'}],services:[{name:'Laser'}]},{branches:[],services:[]});
  expect(sole.services[0]?.branchScope).toBe('branch');expect(sole.services[0]?.branchKey).toBe(sole.branches[0]?.key);
 });
 it('preserves manager supplied labels through validation',()=>{
  const draft=importPublicDetails(emptyDraft(),{branches:[{name:'One'}],services:[{name:'Custom offering'}]},{branches:[],services:[]});
  draft.services[0]!.category='تصنيف المدير';expect(draftIssues(draft).some(issue=>issue.field==='category')).toBe(false);
  draft.services[0]!.definition={...createDefinition('custom','ar'),section:'تصنيف المدير',medicalScope:'medical'};
  expect(draftIssues(parseDraft(draft)).some(issue=>issue.field==='customCategory')).toBe(false);
  expect(parseDraft(draft).services[0]!.definition!.section).toBe('تصنيف المدير');
 });
 it('validates signatures and rejects renamed or binary text files',()=>{
  expect(uploadMime('info.pdf',Buffer.from('%PDF-1.4'))).toBe('application/pdf');
  expect(uploadMime('info.png',Buffer.from([137,80,78,71,13,10,26,10]))).toBe('image/png');
  expect(uploadMime('info.jpg',Buffer.from([255,216,255,224]))).toBe('image/jpeg');
  expect(uploadMime('info.webp',Buffer.from('RIFF0000WEBP'))).toBe('image/webp');
  expect(uploadMime('info.wav',Buffer.from('RIFF0000WAVE'))).toBe('audio/media');
  expect(uploadMime('info.mp3',Buffer.from('ID3'))).toBe('audio/media');
  expect(uploadMime('info.mp4',Buffer.from('0000ftypisom'))).toBe('video/media');
  expect(()=>uploadMime('fake.png',Buffer.from('a text file'))).toThrow('concierge_file_type');
  expect(()=>uploadMime('fake.txt',Buffer.from([0,1,2]))).toThrow('concierge_text_file');
 });
 it('sends images as vision inputs, PDFs as files and text as untrusted data',async()=>{
  const signal=AbortSignal.timeout(1000);
  const image=await attachmentContent({name:'info.png',mime:'image/png',bytes:Buffer.from('png')},signal);
  expect(image[0]?.type).toBe('input_image');expect(image[0]?.image_url).toBe('data:image/png;base64,cG5n');
  expect((await attachmentContent({name:'info.pdf',mime:'application/pdf',bytes:Buffer.from('%PDF-')},signal))[0]?.type).toBe('input_file');
  expect((await attachmentContent({name:'info.txt',mime:'text/plain',bytes:Buffer.from('Clinic')},signal))[0]?.text).toContain('UNTRUSTED');
 });
 it('requires a readable attachment and evidenced name before offering identity confirmation',()=>{
  const reply:ModelReply={reply:'',ui:'none',navigation:'none',patch:emptyDraft(),fileRead:true,fileSummary:'Synthetic clinic file',workspaceFacts:[{field:'nameEn',value:'Synthetic clinic',evidence:'Welcome to Synthetic clinic'}]};
  const candidate=uploadedIdentity(reply,emptyDraft());expect(candidate?.name).toBe('Synthetic clinic');expect(candidate?.uploaded).toBe(true);expect(candidate?.sources).toEqual([]);
  expect(uploadedIdentity({...reply,fileRead:false},emptyDraft())).toBeNull();
  expect(uploadedIdentity({...reply,workspaceFacts:[{field:'nameEn',value:'Invented',evidence:'Other'}]},emptyDraft())).toBeNull();
 });
});
