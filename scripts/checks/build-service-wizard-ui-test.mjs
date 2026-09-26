/** Test-only CommonJS bundle of the real controller + React service UI; never a deployment build. */
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require(process.env.TYPESCRIPT_PATH||'typescript'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.WIZARD_TEST_OUT||path.join(root,'verification/service-wizard/ui-test');fs.mkdirSync(out,{recursive:true});
const cache=new Map(),external=new Set(['react','react-dom/client','react/jsx-runtime']);
function resolve(name,from){if(external.has(name))return name;if(name.endsWith('.css'))return 'css';if(name==='@workspace/service-definition')return 'lib/service-definition/src/index.ts';if(!name.startsWith('.'))throw new Error(`Unknown test dependency ${name}`);const base=path.resolve(root,path.dirname(from),name);const file=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts')].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());if(!file)throw new Error(`Missing ${name} in ${from}`);return path.relative(root,file);}
function visit(file){if(cache.has(file)||external.has(file)||file==='css')return;const result=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});const code=result.outputText.replace(/require\("([^"]+)"\)/g,(_,name)=>{const dep=resolve(name,file);visit(dep);return `require(${JSON.stringify(dep)})`;});cache.set(file,code);}
const entry='artifacts/jormall/src/components/concierge/view.ts';visit(entry);
let bundle=`(()=>{const modules={},cache={};\n`;
for(const [file,code] of cache)bundle+=`modules[${JSON.stringify(file)}]=function(module,exports,require){${code}\n};\n`;
bundle+=`const external={'react':window.__TestReact,'react-dom/client':window.__TestReactDOM,'react/jsx-runtime':window.__TestJSX,'css':{}};function require(name){if(name in external)return external[name];if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);return m.exports;}window.ConciergeView=require(${JSON.stringify(entry)}).ConciergeView;})();`;
fs.writeFileSync(path.join(out,'ui.js'),bundle);
const runtimePath=process.env.WIZARD_RUNTIME_BUNDLE;
if(runtimePath){
 // Restricted offline test environment: reuse React19 runtime ALREADY IN the supplied compiled bundle.
 // Remove old application mount and exports. This file is test-only, not the updated application.
 let old=fs.readFileSync(runtimePath,'utf8');const marker='p1.createRoot(document.getElementById("root")';const at=old.lastIndexOf(marker);
 if(at<0||!old.includes('r as j')||!old.includes('y as r'))throw new Error('Unrecognized retained runtime; use installed dependencies and esbuild instead.');
 old=old.slice(0,at)+'window.__TestReact=y;window.__TestReactDOM=p1;window.__TestJSX=r;';fs.writeFileSync(path.join(out,'runtime.js'),old);
}else{
 // Reproducible path on an installed workspace; no reliance on retained production output.
 const esbuild=require(require.resolve('esbuild',{paths:[path.join(root,'artifacts/api-server')]}));
 await esbuild.build({stdin:{contents:"import * as React from 'react';import * as ReactDOM from 'react-dom/client';import * as JSX from 'react/jsx-runtime';window.__TestReact=React;window.__TestReactDOM=ReactDOM;window.__TestJSX=JSX;",resolveDir:path.join(root,'artifacts/jormall')},bundle:true,format:'iife',outfile:path.join(out,'runtime.js'),define:{'process.env.NODE_ENV':'"development"'}});
}
fs.copyFileSync(path.join(root,'scripts/checks/service-wizard-fixture.js'),path.join(out,'fixture.js'));
console.log(`${cache.size} real source modules bundled for browser verification at ${out}`);
