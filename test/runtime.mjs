import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/content/runtime.js',import.meta.url),'utf8');
function setup(){
 let tick, stopped=0, callbacks=0, calls=0;
 const chrome={runtime:{id:'test',getURL:p=>'extension://'+p,sendMessage:(m,cb)=>{calls++;if(cb)cb({success:true});else return Promise.resolve({success:true});}}};
 const context={chrome,console,Promise,setInterval:fn=>(tick=fn,1),clearInterval:()=>stopped++,window:{Kairos:{},addEventListener(){}}};
 vm.runInNewContext(code,context);
 const r=context.window.Kairos.Runtime;r.onInvalidated(()=>callbacks++);
 return {r,chrome,tick:()=>tick(),stats:()=>({stopped,callbacks,calls})};
}
let x=setup();
assert.equal((await x.r.sendMessage({})).success,true);
delete x.chrome.runtime.id;x.tick();
assert.equal(x.r.valid(),false);
assert.equal((await x.r.sendMessage({})).code,'EXTENSION_CONTEXT_INVALIDATED');
assert.equal(x.r.getURL('icon.png'),'');
x.tick();assert.equal(x.stats().callbacks,1);assert.equal(x.stats().calls,1);
x=setup();x.chrome.runtime.sendMessage=()=>{throw Error('Extension context invalidated.');};
await new Promise(resolve=>x.r.sendMessage({},v=>{assert.equal(v.success,false);resolve();}));
assert.equal(x.stats().callbacks,1);
x=setup();x.chrome.runtime.sendMessage=()=>Promise.reject(Error('Extension context invalidated.'));
assert.equal((await x.r.sendMessage({})).code,'EXTENSION_CONTEXT_INVALIDATED');
x=setup();x.chrome.runtime.sendMessage=()=>Promise.reject(Error('Network failure'));
await assert.rejects(x.r.sendMessage({}),/Network failure/);assert.equal(x.r.valid(),true);
console.log('PASS: reload detection, one-shot teardown, callback and promise failures, unrelated error preservation');
