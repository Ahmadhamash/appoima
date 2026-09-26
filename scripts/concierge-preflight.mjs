/** Read-only checks. Prints presence, never secret values. No external/provider requests. */
import {spawnSync} from 'node:child_process';
const entries=[];const add=(name,status,detail)=>entries.push({name,status,detail});
add('Node',Number(process.versions.node.split('.')[0])>=22?'OK':'NEEDS_ATTENTION',process.version);
const pnpm=spawnSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['--version'],{encoding:'utf8',shell:process.platform==='win32'});add('pnpm',pnpm.status===0?'OK':'NEEDS_ATTENTION',pnpm.status===0?pnpm.stdout.trim():'Install pnpm 10 in the supplied Node 24/Replit runtime; preserve pnpm-lock.yaml.');
for(const key of ['DATABASE_URL','SESSION_SECRET','OPENAI_API_KEY'])add(key,process.env[key]?.trim()?'PRESENT_NOT_VERIFIED':'MISSING','Value not displayed.');
console.table(entries);console.log('Presence is not a connection, migration or live voice test. Follow docs/concierge/SETUP.md.');
if(entries.some(e=>e.status==='NEEDS_ATTENTION'||e.status==='MISSING'))process.exitCode=1;
