/** Dependency-light checks. This is NOT a replacement for the API/DB/browser acceptance suite. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load(relative) {
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module = { exports:{} };
  new Function('exports','module','require',output)(module.exports,module,require);
  return module.exports;
}
let syntaxFiles=0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (['node_modules','.git','dist','migration-baseline'].includes(entry.name)) continue;
    const filename=path.join(dir,entry.name);
    if (entry.isDirectory()) scan(filename);
    else if (/\.tsx?$/.test(entry.name)&&!entry.name.endsWith('.d.ts')) {
      const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,entry.name.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      assert.equal(source.parseDiagnostics.length,0,`${filename}: ${source.parseDiagnostics.map((d)=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);
      syntaxFiles++;
    }
  }
}
scan(path.join(root,'artifacts'));scan(path.join(root,'lib/db/src'));
const rules=load('artifacts/api-server/src/domain/setup-rules.ts');
const time=load('artifacts/jormall/src/lib/branch-time.ts');
const en=load('artifacts/jormall/src/lib/i18n/en.ts').en;
const ar=load('artifacts/jormall/src/lib/i18n/ar.ts').ar;
let tests=0;
function test(name, fn){fn();tests++;console.log(`PASS ${name}`);}
const empty=()=>Object.fromEntries(rules.DAYS.map((d)=>[d,[]]));
const work=()=>({...empty(),mon:[{open:'09:00',close:'17:00'}]});
test('legacy branch single range normalized without data loss',()=>assert.deepEqual(rules.normalizeWeek({mon:{open:'09:00',close:'17:00'},tue:null}),work()));
test('empty week has no operational hours',()=>assert.equal(rules.hasOpenHours(empty()),false));
test('configured week has operational hours',()=>assert.equal(rules.hasOpenHours(work()),true));
test('split shifts accepted',()=>assert.equal(rules.validRanges([{open:'13:00',close:'17:00'},{open:'09:00',close:'12:00'}]),true));
test('overlapping shifts rejected',()=>assert.equal(rules.validRanges([{open:'09:00',close:'14:00'},{open:'13:00',close:'17:00'}]),false));
test('adjacent shifts accepted',()=>assert.equal(rules.validRanges([{open:'09:00',close:'12:00'},{open:'12:00',close:'17:00'}]),true));
test('overnight ranges rejected explicitly',()=>assert.equal(rules.validRanges([{open:'20:00',close:'09:00'}]),false));
test('malformed times rejected',()=>assert.equal(rules.validRanges([{open:'9:00',close:'17:00'}]),false));
test('out-of-range clock rejected',()=>assert.equal(rules.validRanges([{open:'26:00',close:'27:00'}]),false));
test('valid break accepted',()=>assert.equal(rules.validBreaks(work(),{...empty(),mon:[{open:'12:00',close:'13:00'}]}),true));
test('break outside work rejected',()=>assert.equal(rules.validBreaks(work(),{...empty(),mon:[{open:'08:00',close:'10:00'}]}),false));
test('break on closed day rejected',()=>assert.equal(rules.validBreaks(work(),{...empty(),tue:[{open:'12:00',close:'13:00'}]}),false));
test('valid leave accepted',()=>assert.equal(rules.validTimeOff([{startsAt:'2026-10-01T09:00:00Z',endsAt:'2026-10-01T10:00:00Z',note:''}]),true));
test('reversed leave rejected',()=>assert.equal(rules.validTimeOff([{startsAt:'2026-10-01T10:00:00Z',endsAt:'2026-10-01T09:00:00Z',note:''}]),false));
test('overlapping leave rejected',()=>assert.equal(rules.validTimeOff([{startsAt:'2026-10-01T09:00:00Z',endsAt:'2026-10-01T11:00:00Z',note:''},{startsAt:'2026-10-01T10:00:00Z',endsAt:'2026-10-01T12:00:00Z',note:''}]),false));
test('invalid leave dates rejected',()=>assert.equal(rules.validTimeOff([{startsAt:'bad',endsAt:'bad',note:''}]),false));
test('Amman is a valid zone',()=>assert.equal(rules.isTimeZone('Asia/Amman'),true));
test('UTC accepted',()=>assert.equal(rules.isTimeZone('UTC'),true));
test('unknown zone rejected',()=>assert.equal(rules.isTimeZone('Mars/Crater'),false));
test('timezone abbreviation rejected',()=>assert.equal(rules.isTimeZone('EST'),false));
test('manage implies read',()=>assert.ok(rules.effectivePermissions(['services.manage']).has('services.read')));
test('grant held access accepted',()=>assert.equal(rules.withinGrantCeiling(['employees.manage','services.manage'],['services.read']),true));
test('grant unheld access blocked',()=>assert.equal(rules.withinGrantCeiling(['employees.manage'],['settings.manage']),false));
test('read cannot grant manage',()=>assert.equal(rules.withinGrantCeiling(['customers.read'],['customers.manage']),false));
test('no implicit manager role bypass',()=>assert.equal(rules.withinGrantCeiling([],['employees.manage']),false));
test('different branches rejected',()=>assert.equal(rules.compatibleBranch(1,2),false));
test('clinic-wide service accepted',()=>assert.equal(rules.compatibleBranch(null,2),true));
test('clinic-wide employee accepted',()=>assert.equal(rules.compatibleBranch(1,null),true));
test('UTC wall time converts',()=>assert.equal(time.localToInstant('2026-10-01T10:30','UTC'),'2026-10-01T10:30:00.000Z'));
test('Amman round-trip local time',()=>{const v=time.localToInstant('2026-10-01T10:30','Asia/Amman');assert.ok(v);assert.equal(time.instantToLocal(v,'Asia/Amman'),'2026-10-01T10:30');});
test('fractional offset round-trip',()=>{const v=time.localToInstant('2026-10-01T10:30','Asia/Kathmandu');assert.ok(v);assert.equal(time.instantToLocal(v,'Asia/Kathmandu'),'2026-10-01T10:30');});
test('DST spring gap rejected',()=>assert.equal(time.localToInstant('2026-03-08T02:30','America/New_York'),null));
test('DST fall ambiguous time rejected',()=>assert.equal(time.localToInstant('2026-11-01T01:30','America/New_York'),null));
test('invalid local date rejected',()=>assert.equal(time.localToInstant('2026-02-30T09:00','UTC'),null));
function keys(o,p=''){return Object.entries(o).flatMap(([k,v])=>typeof v==='object'?keys(v,p+k+'.'):[p+k]).sort();}
test('EN and AR dictionaries have identical keys',()=>assert.deepEqual(keys(en),keys(ar)));
test('EN/AR placeholders agree',()=>{for(const key of keys(en)){const get=(o)=>key.split('.').reduce((v,k)=>v[k],o);assert.deepEqual((get(en).match(/\{[^}]+\}/g)||[]).sort(),(get(ar).match(/\{[^}]+\}/g)||[]).sort(),key);}});
console.log(JSON.stringify({syntaxFiles,offlineChecks:tests,result:'passed',limitation:'Syntax and pure business rules only. Full typecheck, PostgreSQL API tests and real browser acceptance are separate.'},null,2));
