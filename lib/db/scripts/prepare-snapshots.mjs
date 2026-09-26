/** Generate metadata only. Reviewed SQL and the journal are NEVER overwritten. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const meta=path.join(root,'migrations/meta');
const phases=[['phase1','phase1_baseline'],['phase2','phase2_manager_setup'],['phase3','phase3_scheduling'],['phase4','phase4_waiting_inventory'],['concierge','manager_voice_concierge'],['service-wizard','clinic_service_wizard'],['internal-workspace','internal_clinic_workspace']];
const snapshots=phases.map((_,i)=>`${String(i).padStart(4,'0')}_snapshot.json`);
if(snapshots.every(f=>fs.existsSync(path.join(meta,f))))process.exit(0);
let prefix=0;while(prefix<snapshots.length&&fs.existsSync(path.join(meta,snapshots[prefix])))prefix++;
if(snapshots.slice(prefix).some(f=>fs.existsSync(path.join(meta,f))))throw new Error('Snapshot chain contains gaps; restore complete metadata from your backup before generating.');
const temporary=fs.mkdtempSync(path.join(root,'.snapshot-build-'));
try {
 const output=path.join(temporary,'out'),tempMeta=path.join(output,'meta');
 fs.mkdirSync(tempMeta,{recursive:true});
 if(prefix){
  // Retain the exact previous IDs. Extending existing metadata must not regenerate earlier IDs.
  const journal=JSON.parse(fs.readFileSync(path.join(meta,'_journal.json'),'utf8'));
  if(!Array.isArray(journal.entries)||journal.entries.length<prefix)throw new Error('Migration journal does not match snapshot prefix.');
  journal.entries=journal.entries.slice(0,prefix);
  fs.writeFileSync(path.join(tempMeta,'_journal.json'),JSON.stringify(journal,null,2));
  for(const file of snapshots.slice(0,prefix))fs.copyFileSync(path.join(meta,file),path.join(tempMeta,file));
  for(const e of journal.entries){const file=`${e.tag}.sql`;fs.copyFileSync(path.join(root,'migrations',file),path.join(output,file));}
 }
 for(const [phase,name] of phases.slice(prefix)){
  const config=path.join(temporary,`${phase}.config.ts`);
  fs.writeFileSync(config,`export default ${JSON.stringify({dialect:'postgresql',schema:path.join(root,`migration-baseline/${phase}/index.ts`),out:output})};\n`);
  const command=process.platform==='win32'?'pnpm.cmd':'pnpm';
  const result=spawnSync(command,['exec','drizzle-kit','generate','--config',config,'--name',name],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
  if(result.error||result.status!==0)throw result.error??new Error(`drizzle-kit failed for ${phase}.`);
 }
 // Check every output first; do not leave a half-copied metadata chain on a failed generation.
 for(const file of snapshots)if(!fs.existsSync(path.join(tempMeta,file)))throw new Error(`Missing generated snapshot ${file}; verify drizzle-kit version.`);
 fs.mkdirSync(meta,{recursive:true});
 for(const file of snapshots.slice(prefix))fs.copyFileSync(path.join(tempMeta,file),path.join(meta,file),fs.constants.COPYFILE_EXCL);
 console.log(`Prepared ${snapshots.length-prefix} snapshot(s) from frozen schemas. Existing IDs, SQL and journal were preserved.`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
