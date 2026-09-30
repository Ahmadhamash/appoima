import {describe,expect,it} from 'vitest';
import {extractLinkedFacts,lookupLinkedClinic} from '../concierge/linked-clinic';

describe('owner supplied clinic pages',()=>{
 it('extracts explicit contact links and standalone structured service menus without mistaking the service title for the clinic name',()=>{
  const url='https://clinic.example/services/fillers/',html='<meta property="og:title" content="Fillers and Botox"><a href="tel:%20+96265868024">Call</a><a href="mailto:info@clinic.example">Email</a><script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'Service',name:'Lip filler',description:'Published consultation details'}]})+'</script>';
  const result=extractLinkedFacts(html,url,false);expect(result.name).toBe('');expect(result.facts.map(f=>[f.field,f.value])).toEqual(expect.arrayContaining([['phone','+96265868024'],['email','info@clinic.example']]));expect(result.services[0]?.name).toBe('Lip filler');
 });
 it('takes the clinic name from a social profile and does not use the platform theme color',async()=>{
  const url='https://www.instagram.com/clinic_example/';
  const html='<meta property="og:title" content="Clinic Example (@clinic_example) • Instagram photos and videos"><meta name="theme-color" content="#123456">';
  const result=await lookupLinkedClinic([url],async requested=>({url:requested,bytes:Buffer.from(html),mime:'text/html'}));
  expect(result).toMatchObject({found:true,name:'Clinic Example'});
  expect(result.details?.colors).toEqual([]);
  expect(result.workspaceFacts.some(fact=>fact.field==='primaryColor')).toBe(false);
 });
});
