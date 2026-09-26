import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('artifacts/jormall/src/components/concierge/soniox-assist.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('exports','module',source)(module.exports,module);const {SonioxAssist}=module.exports;
globalThis.window=globalThis;
class Socket{static OPEN=1;readyState=1;bufferedAmount=0;sent=[];constructor(){Socket.last=this;queueMicrotask(()=>this.onopen?.());}send(x){this.sent.push(x);}close(){this.readyState=3;}emit(tokens){this.onmessage?.({data:JSON.stringify({tokens})});}}
class Recorder extends EventTarget{static isTypeSupported(){return true;}state='inactive';start(){this.state='recording';}stop(){this.state='inactive';}requestData(){queueMicrotask(()=>{const event=new Event('dataavailable');Object.defineProperty(event,'data',{value:new Blob(['audio'])});this.ondataavailable?.(event);this.dispatchEvent(event);});}}
globalThis.WebSocket=Socket;globalThis.MediaRecorder=Recorder;
const api={request:async()=>({enabled:true,apiKey:'temporary-test-only'})};
const token=(text,confidence=.99)=>({text,confidence,is_final:true});
async function start(){const helper=new SonioxAssist();await helper.start(api,{},'ar');return helper;}
const h=await start();let count=0;let result=h.refine('original').then(value=>{count++;return value;});await Promise.resolve();Socket.last.emit([token('كارمالايت'),token('،',.1),token('<fin>',0)]);assert.equal(await result,'كارمالايت،');Socket.last.emit([token('<fin>',0)]);assert.equal(count,1);
result=h.refine('uncertain original');await Promise.resolve();Socket.last.emit([token('اسم مختلف',.1),token('<fin>',0)]);assert.equal(await result,'uncertain original');h.stop();
const overlap=await start();result=overlap.refine('first turn');overlap.speechStarted();assert.equal(await result,'first turn');assert.equal(await overlap.refine('second turn'),'second turn');
const timeout=await start();assert.equal(await timeout.refine('timeout original'),'timeout original');assert.equal(Socket.last.readyState,3);
const shutdown=await start();result=shutdown.refine('stopped');shutdown.stop();assert.equal(await result,'stopped');
console.log('PASS Soniox: finalization, no duplicate turn, low-confidence fallback, overlap isolation, timeout fallback and cleanup');
