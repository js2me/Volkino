'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const subtitles=require('../server/webos-subtitles');
function fixture(appId='org.torrenter.watcher') {
 const state={args:['stream',{option:{appId}}],sourceInfo:{programInfo:[{subtitleTrackInfo:[{trackNum:0,language:'eng'},{trackNum:2,language:'(null)'}]}]}};
 const calls=[];
 const api=subtitles.create({supported:true,call:async(method,payload)=>{
   calls.push({method,payload});
   if(method==='getPipelineState')return {data:JSON.stringify(state)};
   if(method==='selectTrack')state.selectTrack={type:payload.type,index:payload.index};
   if(method==='setSubtitleEnable')state.setSubtitleEnable={enable:payload.enable};
   return {returnValue:true};
 }});
 return {api,calls,state};
}
test('LG reads embedded tracks even when DOM textTracks is empty, with unknown initial state',async()=>{
 const {api}=fixture(),r=await api.read('_movie');assert.deepEqual(r.tracks,[{index:0,label:'eng'},{index:2,label:'Дорожка 2'}]);assert.equal(r.enabled,null);
});
test('LG uses text track type and enables, switches and disables native subtitles',async()=>{
 const {api,calls}=fixture();assert.equal((await api.select('_movie',0)).enabled,true);
 assert.equal((await api.select('_movie',2)).selected,2);assert.equal((await api.select('_movie',-1)).enabled,false);
 assert.ok(calls.filter(c=>c.method==='selectTrack').every(c=>c.payload.type==='text'));
});
test('LG rejects another app pipeline and absent or malformed tracks before mutating',async()=>{
 const f=fixture('com.webos.app.hdmi');await assert.rejects(f.api.select('_foreign',0),/не принадлежит/);assert.ok(f.calls.every(c=>c.method==='getPipelineState'));
 const g=fixture();await assert.rejects(g.api.select('_movie',1),/недоступна/);await assert.rejects(g.api.select('_movie','0'),/Некорректная/);
 assert.throws(()=>g.api.read('bad; command'),/Некорректный/);
});
test('LG verifies the applied native state instead of reporting ignored commands as successful',async()=>{
 const f=fixture();const api=subtitles.create({supported:true,call:async(method)=>method==='getPipelineState'?{data:JSON.stringify(f.state)}:{returnValue:true}});
 await assert.rejects(api.select('_movie',0),/не применил/);
});
