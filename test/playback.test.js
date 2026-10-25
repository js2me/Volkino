'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const playback=require('../app/playback');
function harness(){
  let now=0,id=0,tasks=new Map(),position=100,assignments=[],errors=[],started=[],finished=0,previews=[];
  const video={duration:1000,readyState:4,paused:false,seeking:false,play(){this.paused=false;return Promise.resolve();}};
  Object.defineProperty(video,'currentTime',{get(){return position;},set(v){position=v;assignments.push(v);video.seeking=true;}});
  function advance(ms){const end=now+ms;for(;;){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}
  const control=playback.create(video,{setTimeout(fn,ms){tasks.set(++id,{fn,at:now+ms});return id;},clearTimeout(id){tasks.delete(id);},onStart(v){started.push(v);},onError(e){errors.push(e);},onDone(){finished++;},onPreview(v){previews.push(v);}});
  return{video,control,advance,assignments,errors,started,previews,finished:()=>finished};
}
test('a pointer click at the midpoint requests the midpoint; track edges are clamped',()=>{
  assert.equal(playback.pointerTime(600,100,1000,3600),1800);
  assert.equal(playback.pointerTime(-50,100,1000,3600),0);
  assert.equal(playback.pointerTime(2000,100,1000,3600),3599);
  assert.equal(playback.pointerTime(600,100,0,3600),null);
  assert.equal(playback.pointerTime(600,100,1000,NaN),null);
});
test('held arrows accumulate a target but send only one native seek',()=>{
  const h=harness();h.control.by(30);h.control.by(30);h.control.by(30);assert.equal(h.control.target(),190);assert.deepEqual(h.assignments,[]);h.advance(249);assert.deepEqual(h.assignments,[]);h.advance(1);assert.deepEqual(h.assignments,[190]);assert.equal(h.control.isBusy(),true);
});
test('seek remains visibly busy until the native player confirms readiness and the target',()=>{
  const h=harness();h.control.to(500);h.advance(250);h.control.update();assert.equal(h.control.isBusy(),true);h.video.seeking=false;h.video.readyState=2;h.control.update();assert.equal(h.control.isBusy(),true);h.video.readyState=4;h.control.update();assert.equal(h.control.isBusy(),false);assert.equal(h.finished(),1);h.advance(45000);assert.deepEqual(h.errors,[]);
});
test('a stalled seek times out, and the controller accepts another target',()=>{
  const h=harness();h.control.to(500);h.advance(45250);assert.equal(h.errors.length,1);assert.equal(h.control.isBusy(),false);assert.match(h.errors[0],/45/);assert.equal(h.control.to(200),true);h.advance(250);assert.deepEqual(h.assignments,[500,200]);
});
test('closing the player cancels delayed work and does not resume a different video',()=>{
  const h=harness();h.control.to(500);h.control.cancel();h.advance(50000);assert.deepEqual(h.assignments,[]);assert.deepEqual(h.errors,[]);h.control.to(700);h.advance(250);h.control.cancel();h.video.seeking=false;h.control.update();assert.equal(h.finished(),0);
});
test('metadata is required, and seeking a paused video does not autoplay it',()=>{
  const h=harness();h.video.readyState=0;assert.equal(h.control.to(500),false);h.video.readyState=4;h.video.paused=true;h.control.to(500);h.advance(250);h.video.seeking=false;h.control.update();assert.equal(h.video.paused,true);
});
