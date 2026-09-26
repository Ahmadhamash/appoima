/** Real Express/PostgreSQL release gate. NOT executed in the editing container.
 * Use only a migrated disposable DB. No provider or network stubs replace database logic.
 * Synthetic audit records are retained; accounts are disabled, not destructively cleaned.
 */
import {beforeAll, afterAll, describe, it, expect, vi} from 'vitest';
import {eq,inArray} from 'drizzle-orm';
import {db,usersTable,clinicWorkspacesTable,branchesTable} from '@workspace/db';
import {Fixture,agent,login} from './helpers';
import {ROLE_PRESETS} from '../domain/permissions';
import {randomUUID} from 'node:crypto';
const fixture=new Fixture();
type Agent=ReturnType<typeof agent>;
let first:Agent,second:Agent,other:Agent,staff:Agent,clinicId:number;
const post=(a:Agent,path:string,body:object)=>a.post('/api/concierge'+path).set('X-JorMall-Intent','concierge').send(body);
const put=(a:Agent,path:string,body:object)=>a.put('/api/concierge'+path).set('X-JorMall-Intent','concierge').send(body);
async function start(a:Agent,reopen=false){
 const opened=await post(a,'/start',{language:'en',reopen});expect(opened.status).toBe(200);
 const selected=await post(a,'/mode',{revision:opened.body.session.revision,mode:'manual',consent:false});expect(selected.status).toBe(200);return selected.body;
}
async function save(a:Agent,session:any,name:string,color:string){
 const saved=await put(a,'/workspace-draft',{revision:session.revision,profile:{...session.workspace.profile,nameEn:name,primaryColor:color}});
 expect(saved.status).toBe(200);return saved.body;
}
describe('Internal clinic workspace: real HTTP and database acceptance',()=>{
 beforeAll(async()=>{
  if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw new Error('Requires a migrated disposable DB and TEST_DATABASE_DISPOSABLE=1.');
  vi.stubEnv('CONCIERGE_ENABLED','true');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('JORMALL_OPENAI_API_KEY','');
  clinicId=(await fixture.createClinic('Synthetic internal Alpha')).id;
  const otherId=(await fixture.createClinic('Synthetic internal Beta')).id;
  const hours={mon:[{open:'09:00',close:'17:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
  await db.insert(branchesTable).values([{clinicId,name:'Alpha existing branch',timeZone:'UTC',openingHours:hours},{clinicId:otherId,name:'Beta existing branch',timeZone:'UTC',openingHours:hours}]);
  async function account(c:number,role:'manager'|'other_staff'){
   const u=await fixture.createUser({clinicId:c,role,permissions:ROLE_PRESETS[role]});
   const a=agent();expect((await login(a,u.email,u.password)).status).toBe(200);return a;
  }
  first=await account(clinicId,'manager');second=await account(clinicId,'manager');other=await account(otherId,'manager');staff=await account(clinicId,'other_staff');
 });
 afterAll(async()=>{
  if(fixture.userIds.length)await db.update(usersTable).set({isActive:false}).where(inArray(usersTable.id,fixture.userIds));
  vi.unstubAllEnvs();
 });
 it('rejects anonymous reads, non-manager writes, missing intent and cross-site requests',async()=>{
  expect((await agent().get('/api/me/workspace')).status).toBe(401);
  expect((await post(staff,'/start',{language:'en'})).status).toBe(403);
  expect((await first.post('/api/concierge/start').send({language:'en'})).status).toBe(403);
  expect((await post(first,'/start',{language:'en'}).set('sec-fetch-site','cross-site')).status).toBe(403);
 });
 it('keeps preview private, atomically applies identity, and idempotently retries confirmation',async()=>{
  const initial=await first.get('/api/me/workspace');expect(initial.status).toBe(200);
  let session=await start(first);session=await save(first,session,'Synthetic Alpha personalized','#276758');
  expect((await first.get('/api/me/workspace')).body.profile.nameEn).toBe(initial.body.profile.nameEn);
  const body={revision:session.revision,confirmed:true,staff:[]};
  const results=await Promise.all([post(first,'/apply',body),post(first,'/apply',body)]);
  for(const result of results){expect(result.status).toBe(200);expect(result.body.stage).toBe('complete');}
  expect(results[0]!.body.revision).toBe(results[1]!.body.revision);
  expect((await first.get('/api/me/workspace')).body.profile.nameEn).toBe('Synthetic Alpha personalized');
  const rows=await db.select().from(clinicWorkspacesTable).where(eq(clinicWorkspacesTable.clinicId,clinicId));expect(rows).toHaveLength(1);
 });
 it('isolates two clinics; rejects tenant-selector injection on writes',async()=>{
  let b=await start(other);b=await save(other,b,'Synthetic Beta personalized','#7A3B50');
  expect((await post(other,'/apply',{revision:b.revision,confirmed:true,staff:[]})).status).toBe(200);
  const a=await first.get('/api/me/workspace'),result=await other.get('/api/me/workspace?clinicId='+clinicId);
  expect(result.body.profile.nameEn).toBe('Synthetic Beta personalized');expect(a.body.profile.nameEn).toBe('Synthetic Alpha personalized');
  const s=await start(first,true);
  expect((await put(first,'/workspace-draft',{revision:s.revision,profile:s.workspace.profile,clinicId:clinicId+1})).status).toBe(400);
 });
 it('rejects a second manager stale identity and allows explicit reload without losing services',async()=>{
  let a=await start(first),b=await start(second);
  a=await save(first,a,'Alpha latest','#224455');b=await save(second,b,'Alpha stale','#662244');
  expect((await post(first,'/apply',{revision:a.revision,confirmed:true,staff:[]})).status).toBe(200);
  const stale=await post(second,'/apply',{revision:b.revision,confirmed:true,staff:[]});expect(stale.status).toBe(409);expect(stale.body.error).toBe('workspace_stale');
  const reloaded=await post(second,'/workspace-reload',{revision:b.revision});expect(reloaded.status).toBe(200);expect(reloaded.body.workspace.profile.nameEn).toBe('Alpha latest');
 });
 it('provider-free text shares the saved draft with manual editing and rejects stale revisions',async()=>{
  const s=await start(second);
  const body={revision:s.revision,requestId:randomUUID(),text:'service: Exact custom medical assessment'};
  const created=await post(second,'/turn',body);expect(created.status).toBe(200);expect(created.body.draft.services).toHaveLength(1);
  const retry=await post(second,'/turn',body);expect(retry.status).toBe(200);expect(retry.body.revision).toBe(created.body.revision);
  expect((await put(second,'/workspace-draft',{revision:s.revision,profile:s.workspace.profile})).status).toBe(409);
  const resumed=await post(second,'/start',{language:'ar'});expect(resumed.body.session.draft.services[0].name).toBe('Exact custom medical assessment');
 });
});
