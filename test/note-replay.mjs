import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalizeNoteLocation, replayDestination } from '../src/note-location.js';
import { createNoteReplay } from '../src/note-replay.js';
import { NoteReplaySeeker } from '../src/content/note-replay.js';

const identify = globalThis.Kairos.Utils.getVideoId;
assert.notEqual(identify('https://www.bilibili.com/video/BV123/?p=1'), identify('https://www.bilibili.com/video/BV123/?p=2'));
assert.equal(identify('https://www.bilibili.com/video/av123/'), identify('https://www.bilibili.com/video/av123?p=1'));
const lessons = [
  'https://www.coursera.org/learn/a/lecture/one/introduction',
  'https://www.coursera.org/learn/a/lecture/two/introduction',
  'https://www.coursera.org/learn/b/lecture/one/introduction',
  'https://www.udemy.com/course/a/learn/lecture/123#overview',
  'https://www.udemy.com/course/a/learn/#/lecture/456',
  'https://www.youtube.com/watch?v=abc&t=99',
  'https://www.ted.com/talks/a_talk'
];
assert.equal(new Set(lessons.map(identify)).size, lessons.length);
for (const url of lessons) {
  const note = { id: 'n', videoId: identify(url), videoUrl: url, videoTitle: 'Introduction', timestamp: 163 };
  const target = replayDestination(note);
  assert.equal(identify(target.url), note.videoId);
  assert.equal(target.timestamp, 163);
  if (url.includes('udemy')) assert.equal(new URL(target.url).hash, new URL(url).hash, 'Preserve lecture in hash');
}
const legacy = { id:'old', videoId:'bili-BV123', videoUrl:'https://www.bilibili.com/video/BV123/?p=2', videoTitle:'Introduction', timestamp:163, content:'Original', imageUrl:'data:image/png;base64,abc' };
assert.equal(normalizeNoteLocation(legacy).videoId,'bili-BV123:p2');
assert.equal(normalizeNoteLocation(legacy).content, legacy.content);
assert.equal(normalizeNoteLocation(legacy).imageUrl, legacy.imageUrl);
for (const url of ['javascript:alert(1)','https://evil.test/video','https://www.youtube.com/','https://www.youtube.com@evil.test/watch?v=abc']) {
  assert.throws(()=>replayDestination({...legacy,videoUrl:url}));
}
assert.throws(()=>replayDestination({...legacy,videoId:null,videoUrl:'https://www.youtube.com/'}));
assert.throws(()=>replayDestination({...legacy,timestamp:NaN}));
assert.throws(()=>replayDestination({...legacy,timestamp:-1}));

const session = {}, created = [], navigations = [];
let nextTab=20;
const api = {
  tabs: {create:async value=>{created.push(value);return {id:++nextTab};},update:async(id,value)=>{
    assert.ok(session['kairosReplay:'+id], 'Persist request before navigating');
    navigations.push({id,...value});
  },remove:async()=>{}},
  storage:{session:{get:async key=>({[key]:session[key]}),set:async value=>Object.assign(session,value),remove:async key=>delete session[key]}}
};
const replay = createNoteReplay(api,async()=>legacy);
const opened = await replay.open('old');
assert.equal(created[0].url,'about:blank');
assert.equal(navigations[0].url,legacy.videoUrl);
const restarted = createNoteReplay(api,async()=>legacy);
const sender={tab:{id:opened.tabId},frameId:0,url:legacy.videoUrl};
assert.equal((await restarted.pending(sender)).timestamp,163,'Pending jump survives worker restart');
assert.equal(await restarted.pending({...sender,tab:{id:1}}),null,'Do not affect another tab');
assert.equal(await restarted.pending({...sender,frameId:4}),null,'Do not send to an embedded player');
assert.equal(await restarted.pending({...sender,url:'https://www.youtube.com/watch?v=abc'}),null);
await restarted.clear(opened.tabId);
assert.equal(await restarted.pending(sender),null);
await replay.open('old');
session['kairosReplay:'+nextTab].expires=0;
assert.equal(await replay.pending({...sender,tab:{id:nextTab}}),null);

let now=0, page='other-lesson', video=null, done=0, messages=[];
const job={videoId:'lesson',timestamp:163};
const seeker=new NoteReplaySeeker(job,{getPageId:()=>page,getVideo:()=>video,now:()=>now,finish:()=>done++,notify:m=>messages.push(m)});
seeker.tick(); assert.equal(done,0);
page='lesson'; video={readyState:0,duration:600,currentTime:0,paused:true,seeking:false,seekable:{length:0}};
seeker.tick();assert.equal(video.currentTime,0);
video.readyState=1;seeker.tick();assert.equal(video.currentTime,0,'Wait for seekable ranges');
video.seekable={length:1,start:()=>0,end:()=>600};seeker.tick();assert.equal(video.currentTime,163);
now=800;video.currentTime=20;seeker.tick();assert.equal(video.currentTime,163,'Recover a late native resume reset');
now=1000;seeker.tick();now=3000;seeker.tick();assert.equal(done,1);
video.currentTime=400;seeker.tick();assert.equal(video.currentTime,400,'Completed jump never fights later playback');
const timeout = new NoteReplaySeeker(job,{getPageId:()=> 'other',getVideo:()=>null,now:()=>now,finish:()=>done++,notify:m=>messages.push(m)});
now+=91000;timeout.tick();assert.equal(timeout.done,true);assert.match(messages.at(-1),/not ready/);
const switched = new NoteReplaySeeker(job,{getPageId:()=>page,getVideo:()=>video,now:()=>now,finish:()=>done++});
switched.tick();page='next-lesson';switched.tick();assert.equal(switched.done,true);
console.log('PASS: lesson identity, Bilibili part isolation, legacy locations, validated destinations, tab-scoped persistent replay and delayed/reset playback');

const metadataContext = {
  URL, CSS: {escape: value=>value},
  window: {Kairos:{}, location:{href:'https://www.coursera.org/learn/physics/lecture/one/introduction'}},
  document: {title:'Introduction',querySelector:selector=>{
    const values={'[data-e2e="course-title"]':'Physics 101','[data-e2e="lecture-title"]':'Introduction'};
    return values[selector]?{getAttribute:()=>null,textContent:values[selector]}:null;
  }}
};
vm.runInNewContext(readFileSync(new URL('../src/content/utils.js',import.meta.url),'utf8'),metadataContext);
let info=metadataContext.window.Kairos.Utils.getVideoInfo();
assert.equal(info.courseTitle,'Physics 101');
assert.equal(info.lessonTitle,'Introduction');
metadataContext.window.location.href='https://www.udemy.com/course/linear-algebra/learn/lecture/123';
info=metadataContext.window.Kairos.Utils.getVideoInfo();
assert.equal(info.courseTitle,'linear algebra','Course slug remains available when site headings are missing');
assert.equal(info.lessonTitle,'Introduction');
console.log('PASS: course and lesson metadata extraction plus readable fallback');
