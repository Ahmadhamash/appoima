/** Test utilities only. This adapter is NOT a database, server or deployment dependency. */
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);export const ts=require(process.env.TYPESCRIPT_PATH||'typescript');
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function loader(overrides={}){
 const cache=new Map();
 const load=(file)=>{file=path.resolve(root,file);const key=path.relative(root,file);if(Object.hasOwn(overrides,key))return overrides[key];if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('Syntax error in '+key);
  new Function('module','exports','require',result.outputText)(m,m.exports,name=>{
   if(Object.hasOwn(overrides,name))return overrides[name];
   if(name==='@workspace/service-definition')return load('lib/service-definition/src/index.ts');
   if(name.startsWith('.')){const base=path.resolve(path.dirname(file),name),candidate=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(!candidate)throw Error(`Unresolved ${name} in ${file}`);return load(candidate);}
   return require(name);
  });return m.exports;
 };return load;
}
export function memoryStore(){
 const names=['clinicsTable','clinicWorkspacesTable','usersTable','servicesTable','branchesTable','roomsTable','appointmentsTable','customersTable','managerOnboardingTable','auditEventsTable'];
 let rows=Object.fromEntries(names.map(n=>[n,[]])),serial=1,queue=Promise.resolve();
 const tables=Object.fromEntries(names.map(table=>[table,new Proxy({$name:table},{get:(o,k)=>k in o?o[k]:{table,key:k}})]));
 const calls=[];
 const eq=(column,value)=>({kind:'eq',column,value});const and=(...expr)=>({kind:'and',expr:expr.filter(Boolean)});
 const sql=(strings,...values)=>({kind:'sql',text:strings.join('?'),values});
 function matches(row,e){if(!e)return true;if(e.kind==='and')return e.expr.every(x=>matches(row,x));if(e.kind==='eq')return row[e.column.key]===e.value;if(e.kind==='sql'&&e.text.includes('is null or'))return row[e.values[0].key]===null||row[e.values[1].key]===e.values[2];throw Error('Unsupported test predicate '+JSON.stringify(e));}
 function builder(kind,table,selection){let predicate,values,limit=Infinity,update,conflictMode,conflictSpec,executed;
  const run=()=>{if(executed)return executed;executed=Promise.resolve().then(()=>{
   const name=table?.$name;if(!name)throw Error('Missing test table');calls.push({kind,table:name,predicate});
   if(kind==='select'){const found=rows[name].filter(r=>matches(r,predicate)).slice(0,limit);if(selection&&Object.values(selection).some(v=>v.kind==='sql'&&v.text.includes('count(')))return [{count:found.length}];return structuredClone(selection?found.map(r=>Object.fromEntries(Object.entries(selection).map(([key,col])=>[key,r[col.key]]))):found);}
   if(kind==='insert'){const input=Array.isArray(values)?values:[values],result=[];for(const value of input){const existing=rows[name].find(r=>name==='managerOnboardingTable'?r.clinicId===value.clinicId&&r.userId===value.userId:name==='clinicWorkspacesTable'?r.clinicId===value.clinicId:value.id!==undefined&&r.id===value.id);
    if(existing){if(conflictMode==='nothing')continue;if(conflictMode==='update'){Object.assign(existing,conflictSpec.set);result.push(existing);continue;}throw Error('Test unique constraint');}
    const inserted={id:serial++,revision:0,stage:'name',language:'ar',preferredName:null,consentVersion:null,consentAt:null,createdAt:new Date(),updatedAt:new Date(),busyId:null,busyUntil:null,state:{},budget:{},...structuredClone(value)};rows[name].push(inserted);result.push(inserted);
   }return structuredClone(result);}
   if(kind==='update'){const found=rows[name].filter(r=>matches(r,predicate));for(const row of found)Object.assign(row,structuredClone(update));return structuredClone(found);}
   throw Error('Unsupported test query');});return executed;
  };
  const q={from:t=>(table=t,q),where:e=>(predicate=e,q),orderBy:()=>q,limit:n=>(limit=n,q),for:()=>q,values:v=>(values=v,q),set:v=>(update=v,q),onConflictDoNothing:()=>(conflictMode='nothing',q),onConflictDoUpdate:s=>(conflictMode='update',conflictSpec=s,q),returning:()=>q,then:(yes,no)=>run().then(yes,no),catch:no=>run().catch(no)};return q;
 }
 const db={select:s=>builder('select',null,s),insert:t=>builder('insert',t),update:t=>builder('update',t),execute:async e=>{calls.push({kind:'execute',sql:e});return [];},transaction:work=>{
  const run=queue.then(async()=>{const snapshot=structuredClone(rows),oldSerial=serial;try{return await work(db);}catch(error){rows=snapshot;serial=oldSerial;throw error;}});queue=run.catch(()=>{});return run;
 }};
 return {get rows(){return rows;},calls,db,exports:{...tables,db},orm:{and,eq,sql,asc:c=>c}};
}
