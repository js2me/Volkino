'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const history=require('../app/history');
function entry(id,position=0){return{hash:id.toString(16).padStart(40,'0'),fileId:1,title:'Video '+id,link:'magnet:?xt=urn:btih:'+id.toString(16).padStart(40,'0'),position,updated:id};}
function storage(initial){let value=initial;return{getItem(){return value;},setItem(key,next){assert.equal(key,'tw-history');value=next;},raw(){return value;}};}
test('retains exactly the newest 100 entries in memory and after reload, evicting the oldest tail',()=>{
  let list=[];for(let i=1;i<=130;i++)list=history.upsert(list,entry(i));assert.equal(list.length,100);assert.equal(list[0].title,'Video 130');assert.equal(list[99].title,'Video 31');
  const store=storage();history.save(store,list);assert.deepEqual(history.load(store),list);
});
test('opening the same file moves it to the front without duplicates and preserves the saved position',()=>{
  let list=[entry(3),entry(2,91),entry(1)];list=history.upsert(list,{hash:entry(2).hash.toUpperCase(),fileId:1,title:'Video 2',link:entry(2).link,updated:10});assert.equal(list.length,3);assert.equal(list[0].position,91);assert.equal(list[0].title,'Video 2');
});
test('different episodes in the same torrent remain separate and an opened unwatched file persists',()=>{
  let list=history.upsert([],entry(1));list=history.upsert(list,Object.assign(entry(1),{fileId:2}));assert.equal(list.length,2);const store=storage();history.save(store,list);assert.equal(history.load(store)[0].position,0);
});
test('old history survives upgrade; oversized and malformed storage are bounded safely',()=>{
  const old=Array.from({length:120},(_,i)=>entry(i+1));const store=storage(JSON.stringify(old));const list=history.load(store);assert.equal(list.length,100);history.save(store,list);assert.equal(JSON.parse(store.raw()).length,100);
  assert.deepEqual(history.load(storage('{bad')),[]);assert.deepEqual(history.normalize([null,{},entry(1),entry(1)]),[entry(1)]);
});
test('reports storage write failures instead of silently pretending to save',()=>{assert.throws(()=>history.save({setItem(){throw new Error('quota');}},[entry(1)]),/quota/);});
test('Filmix history survives reload, stays separate from torrents and shares episode progress across voices',()=>{
 const online={source:'filmix',filmixId:42,fileId:10001,title:'Episode',link:'filmix:42',position:120,voice:'Dub',season:1};
 let list=history.upsert([entry(1)],online);list=history.upsert(list,{...online,voice:'Original',position:240});assert.equal(list.length,2);assert.equal(list[0].position,240);assert.notEqual(history.key(list[0]),history.key(list[1]));
 const store=storage();history.save(store,list);assert.deepEqual(history.load(store),list);assert.equal(history.normalize([{...online,filmixId:'invalid'}]).length,0);
});
