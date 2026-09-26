/** Test-only bundler for the dependency-free production UI. Not a deployment bundle. */
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require(process.env.TYPESCRIPT_PATH||'typescript'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const modules=['contract','copy','api','dom','orb','voice','review','view'];
let source='(()=>{const modules={};const cache={};\n';
for(const name of modules){const content=fs.readFileSync(path.join(root,'artifacts/jormall/src/components/concierge',name+'.ts'),'utf8');const result=ts.transpileModule(content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});source+=`modules[${JSON.stringify(name)}]=function(exports,module,require){\n${result.outputText}\n};\n`;}
source+=`function require(name){name=name.split('/').pop();if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;modules[name](m.exports,m,require);return m.exports;}window.ConciergeView=require('view').ConciergeView;})();`;
fs.mkdirSync(path.join(root,'verification/concierge'),{recursive:true});fs.writeFileSync(path.join(root,'verification/concierge/browser-embedded-bundle.js'),source);
console.log('Built test-only bundle of eight real production UI modules; no mock UI.');
