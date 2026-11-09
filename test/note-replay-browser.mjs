import { createServer } from 'node:http';
/** Browser regression checks using an isolated Chrome process and mock extension storage. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'kairos-companion-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
const media=join(profile,'lesson.mp4');
execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:s=640x360:r=10','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',media]);
const bytes=await readFile(media);
const server=createServer((req,res)=>{
  if(req.url==='/lesson.mp4'){
    const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    const start=range?Number(range[1]):0,end=range&&range[2]?Number(range[2]):bytes.length-1;
    res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});
    res.end(bytes.subarray(start,end+1));
  }
  else res.end('<!doctype html><body><h1>Introduction</h1><video muted controls style="width:640px;height:360px"></video></body>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
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
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await run('new Promise(r=>setTimeout(r,100))');

  await run((await readFile(new URL('../src/content/note-replay.js',import.meta.url),'utf8')).replace(/^export /gm,''));
  await run(`window.video=document.querySelector('video');window.done=0;window.messages=[];window.page='lesson';
    window.replay=new NoteReplaySeeker({videoId:'lesson',timestamp:3.25},{
      getPageId:()=>page,getVideo:()=>video,finish:()=>done++,notify:m=>messages.push(m)
    });replay.tick();`);
  assert.equal(await run('video.currentTime'),0,'No seek before metadata');
  await run(`video.src='/lesson.mp4';new Promise((resolve,reject)=>{video.oncanplay=resolve;video.onerror=reject;video.load();})`);
  await run(`new Promise((resolve,reject)=>{setTimeout(()=>reject(Error('Replay timed out')),12000);window.timer=setInterval(()=>{replay.tick();if(replay.done){clearInterval(timer);resolve();}},100)})`);
  assert.ok(Math.abs(await run('video.currentTime')-3.25)<.2,'Real HTMLVideoElement seeks to the saved second');
  assert.equal(await run('done'),1);
  await run('video.currentTime=6;replay.tick()');
  assert.ok(Math.abs(await run('video.currentTime')-6)<.2,'Replay leaves subsequent manual seeking alone');
  await run(`window.done=0;window.replay=new NoteReplaySeeker({videoId:'lesson',timestamp:2},{
    getPageId:()=>page,getVideo:()=>video,finish:()=>done++
  });window.page='other';replay.tick();`);
  assert.ok(Math.abs(await run('video.currentTime')-6)<.2,'Wrong lesson is never seeked');
  await run(`page='lesson';video=document.createElement('video');video.muted=true;document.body.append(video);video.src='/lesson.mp4';
    new Promise((resolve,reject)=>{video.oncanplay=resolve;video.onerror=reject;video.load();})`);
  await run(`new Promise((resolve,reject)=>{setTimeout(()=>reject(Error('Replay timed out')),12000);window.timer=setInterval(()=>{replay.tick();if(replay.done){clearInterval(timer);resolve();}},100)})`);
  assert.ok(Math.abs(await run('video.currentTime')-2)<.2,'Replacement lesson player is seeked after it becomes ready');
  console.log('PASS: real video delayed metadata, seekable media, exact-second replay, wrong lesson guard and replacement player');

} finally {
  socket?.close();
  chrome.kill();
  server.close();
}
