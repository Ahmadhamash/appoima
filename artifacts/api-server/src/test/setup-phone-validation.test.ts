import { describe, expect, it } from 'vitest';
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, defaultWorkspace, normalizePhone, phoneRules, nationalPhoneDigits, parseWorkspaceProfile, splitPhone } from '@workspace/service-definition';
import { customerSchema, newEmployeeSchema, branchPageSchema } from '../domain/setup-validation';
import { bookingCustomerSchema } from '../domain/scheduling-validation';
import { draftIssues, emptyDraft } from '../domain/concierge-core';
import { branchListPage } from '../domain/setup-rules';

const hours={mon:[{open:'09:00',close:'17:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
const closed={...hours,mon:[]};
const person={name:'Test person',nameLang:'en' as const,email:'person@example.test',role:'secretary' as const,permissions:[],initialPassword:'Test-pass-12345'};
describe('Phone validation for guided and manual setup',()=>{
  it('normalizes local, international and Arabic digits without extracting from text',()=>{
    for(const value of ['0791234567','+962791234567','00962791234567','٠٧٩١٢٣٤٥٦٧','+962 (79) 123-4567'])expect(normalizePhone(value)).toBe('+962791234567');
    expect(normalizePhone('2025550123','US')).toBe('+12025550123');
    for(const value of ['call +962791234567','+962791234567x123','123','+96279123456789','abc','+962abcdefghi'])expect(normalizePhone(value)).toBeNull();
  });
  it('provides bounded national lengths and preserves international country on edit',()=>{
    expect(DEFAULT_PHONE_COUNTRY).toBe('JO');
    expect(phoneRules('JO')).toMatchObject({callingCode:'962',lengths:[8,9],maxDigits:9});
    expect(phoneRules('US')).toMatchObject({callingCode:'1',lengths:[10],maxDigits:10});
    expect(nationalPhoneDigits('0791234567','JO')).toBe('791234567');
    expect(nationalPhoneDigits('٧٩١٢٣٤٥٦٧٨٩','JO')).toBe('791234567');
    expect(splitPhone('+12025550123')).toEqual({country:'US',digits:'2025550123'});
    expect(splitPhone('+12')).toEqual({country:'US',digits:'2'});
    expect(splitPhone('+120','CA')).toEqual({country:'CA',digits:'20'});
    for(const country of PHONE_COUNTRIES){const rules=phoneRules(country);expect(rules.maxDigits).toBeGreaterThan(0);expect(rules.maxDigits+rules.callingCode.length).toBeLessThanOrEqual(15);}
  });
  it('rejects invalid phone writes in employee, customer, booking and identity schemas',()=>{
    const customer={name:'Test customer',nameLang:'en' as const,email:'customer@example.test'};
    for(const phone of ['letters','+96279','+120255501234','123abc4567']){
      expect(newEmployeeSchema.safeParse({...person,phone}).success).toBe(false);
      expect(customerSchema.safeParse({...customer,phone}).success).toBe(false);
      expect(bookingCustomerSchema.safeParse({...customer,phone,idempotencyKey:'00000000-0000-4000-8000-000000000001'}).success).toBe(false);
      expect(()=>parseWorkspaceProfile({...defaultWorkspace('Example','en').profile,phone})).toThrow();
    }
    expect(newEmployeeSchema.parse({...person,phone:'0791234567'}).phone).toBe('+962791234567');
    expect(customerSchema.parse({...customer,phone:'+12025550123'}).phone).toBe('+12025550123');
    expect(customerSchema.safeParse({...customer,phone:null}).success).toBe(true);
    expect(customerSchema.safeParse({...customer,email:'',phone:null}).success).toBe(false);
    expect(newEmployeeSchema.safeParse({...person,phone:null}).success).toBe(true);
    expect(parseWorkspaceProfile({...defaultWorkspace('Example','en').profile,phone:'0791234567'}).phone).toBe('+962791234567');
  });
  it('allows partial guided drafts but prevents completing them with an invalid phone',()=>{
    const staff={key:'staff_1',name:'Member',nameLang:'en' as const,email:'member@example.test',phone:'+96279',jobTitle:null,branchKey:null,role:'secretary' as const,serviceKeys:[],workingHours:hours,breaks:closed};
    expect(draftIssues({...emptyDraft(),staff:[staff]})).toContainEqual({key:'staff_1',field:'phone',code:'invalid_phone'});
    expect(draftIssues({...emptyDraft(),staff:[{...staff,phone:'+962791234567'}]})).toEqual([]);
  });
});
describe('Branch summary filters',()=>{
  const rows=Array.from({length:27},(_,i)=>({name:`Branch ${String(i).padStart(2,'0')}`,timeZone:i<21?'Asia/Amman':'UTC',openingHours:i%2?closed:hours}));
  it('filters the full clinic before pagination and keeps summary counts',()=>{
    const all=branchListPage(rows,branchPageSchema.parse({page:2}));
    expect(all.items).toHaveLength(7);expect(all.total).toBe(27);
    const filtered=branchListPage(rows,branchPageSchema.parse({openingHours:'configured',timeZone:'UTC'}));
    expect(filtered.total).toBe(3);expect(filtered.items.map(row=>row.name)).toEqual(['Branch 22','Branch 24','Branch 26']);
    expect(filtered.branchSummary).toEqual({total:27,withOpeningHours:14,timeZones:[{timeZone:'Asia/Amman',count:21},{timeZone:'UTC',count:6}]});
    expect(branchListPage(rows,branchPageSchema.parse({search:'branch 26'})).items).toHaveLength(1);
  });
  it('rejects unsupported filter values',()=>{
    expect(branchPageSchema.safeParse({openingHours:'false'}).success).toBe(false);
    expect(branchPageSchema.safeParse({timeZone:'not/a-zone'}).success).toBe(false);
  });
});
