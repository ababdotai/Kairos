/** Browser regression checks using an isolated Chrome process and mock extension storage. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'kairos-companion-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    chrome.stderr.on('data', data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    chrome.on('error', reject);
  });
  const pages = await (await fetch(`http://${new URL(endpoint).host}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if(data.method==='Fetch.requestPaused') {void call('Fetch.fulfillRequest',{requestId:data.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<html><body><div id=movie_player><video style="width:800px;height:450px"></video></div><div id=secondary></div></body></html>').toString('base64')});return;}
    if (pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(data.error) : resolve(data.result);
    }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const manifest=JSON.parse(await readFile(new URL('../dist/manifest.json',import.meta.url),'utf8'));
  const sourceManifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.content_scripts[0].matches,sourceManifest.content_scripts[0].matches);
  assert.deepEqual(manifest.web_accessible_resources,sourceManifest.web_accessible_resources);
  assert.deepEqual(manifest.content_scripts[0].js,['assets/kairos-content.js']);
  const bundle=await readFile(new URL('../dist/'+manifest.content_scripts[0].js[0],import.meta.url),'utf8');
  assert.ok(!/\bimport\s*\(/.test(bundle),'No dynamic import in the production script');
  new Function(bundle); // A classic script, not an ES module.
  await call('Page.enable');
  await call('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]});
  await call('Page.navigate',{url:'https://www.youtube.com/watch?v=N4jH66US7iA'});
  await new Promise(r=>setTimeout(r,200));
  const tree=await call('Page.getFrameTree');
  const world=await call('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'kairos-smoke'});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,contextId:world.executionContextId,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await evaluate(`window.errors=[];window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.chrome={runtime:{id:'test-extension',getURL:()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',onMessage:{addListener(){}},sendMessage:async(message,callback)=>{const response={success:true,data:[]};callback?.(response);return response;}},storage:{onChanged:{addListener(){}},local:{get:async(key,cb)=>{cb?.({});return {};},set:async()=>{}},sync:{get:async(key,cb)=>{cb?.({});return {};},set:async()=>{}}},i18n:{getUILanguage:()=> 'en'}}`);
  await evaluate(bundle);
  await new Promise(r=>setTimeout(r,500));
  assert.equal(await evaluate('!!window.Kairos.overlayManagerInstance'),true,'Built script initializes in an isolated world on a YouTube URL');
  assert.deepEqual(await evaluate('errors'),[]);
  assert.equal(await run('typeof window.Kairos'),'undefined','Page world remains isolated');
  assert.ok(await evaluate('!!document.querySelector("#kairos-overlay-root")'),'Overlay mounts');

  await evaluate("window.addEventListener('error',e=>errors.push(e.message));delete chrome.runtime.id;");
  await new Promise(r=>setTimeout(r,1300));
  assert.equal(await evaluate('!!document.querySelector("#kairos-overlay-root")'),false,'Invalidated overlay is removed');
  assert.equal(await evaluate('Kairos.Runtime.valid()'),false);
  assert.ok(await evaluate('document.body.textContent.includes("Refresh this video page")'),'Refresh guidance appears');
  await evaluate('Kairos.overlayManagerInstance.sidePanel.injectPanel()');
  assert.equal(await evaluate('!!document.querySelector("#kairos-overlay-root")'),false);
  assert.deepEqual(await evaluate('errors'),[],'No uncaught errors when the extension is reloaded');
  console.log('PASS: built manifest, classic script, no dynamic imports, YouTube-origin isolated-world initialization (mock extension APIs)');
} finally { socket?.close();chrome.kill(); }
