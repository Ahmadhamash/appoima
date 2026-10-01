import {describe,expect,it} from 'vitest';
import {serviceSchema} from '../domain/setup-validation';
import {emptyDraft,parseDraft,draftIssues} from '../domain/concierge-core';
import {importPublicDetails} from '../domain/concierge-public-import';

const body={name:'Service',nameLang:'en',durationMinutes:30,price:'25',currency:'JOD',requiresRoom:false};
describe('Manager supplied service categories',()=>{
  it('accepts and normalizes Arabic and English labels in manual setup',()=>{
    expect(serviceSchema.parse({...body,category:'  نحت   الجسم  '}).category).toBe('نحت الجسم');
    expect(serviceSchema.parse({...body,category:'Consultations'}).category).toBe('Consultations');
  });
  it.each(['','   ','a'.repeat(81),'Invalid\u0000label','Invalid\nlabel'])('rejects invalid category %j',category=>{
    expect(serviceSchema.safeParse({...body,category}).success).toBe(false);
    const draft=importPublicDetails(emptyDraft(),{branches:[],services:[{name:'Service'}]},{branches:[],services:[]});draft.services[0]!.category=category;
    expect(()=>parseDraft(draft)).toThrow();
  });
  it('preserves custom draft labels and requires a category without guessing one',()=>{
    const draft=importPublicDetails(emptyDraft(),{branches:[],services:[{name:'Laser session'}]},{branches:[],services:[]});
    expect(draft.services[0]!.category).toBeNull();expect(draftIssues(draft).some(issue=>issue.field==='category')).toBe(true);
    draft.services[0]!.category='  استشارات  تجميلية ';expect(parseDraft(draft).services[0]!.category).toBe('استشارات تجميلية');
    draft.services[0]!.category='Other';expect(draftIssues(draft).some(issue=>issue.field==='customCategory')).toBe(false);
  });
});
