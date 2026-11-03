'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,files,hash}=require('./helpers/models');
function item(id,position,duration=1000,extra={}){return{hash,fileId:id,title:'Episode',fileName:files[id-1].path,torrentTitle:'Series',link:'magnet:?xt=urn:btih:'+hash,position,duration,...extra};}
function onlinePost(){return{title:'Online Series',maxQuality:720,voices:['Dub','Original'],seasons:[1,2],isSeries:true,files:[{id:10001,path:'Сезон 1/Серия 1',season:1,voice:'Dub',qualities:[720,480]},{id:10002,path:'Сезон 1/Серия 2',season:1,voice:'Dub',qualities:[720,480]},{id:10001,path:'Сезон 1/Серия 1',season:1,voice:'Original',qualities:[720]},{id:20001,path:'Сезон 2/Серия 1',season:2,voice:'Dub',qualities:[720]}]};}
test('controls hide after seeking and recover without a playing event',t=>{
 const h=boot(t);h.play();h.player.seek(100);h.advance(250);h.video.readyState=2;h.advance(5000);assert.equal(h.player.overlay,true);
 h.video.readyState=4;h.video.emit('seeked');h.advance(5000);assert.equal(h.player.overlay,false);
});
test('time updates and pointer jitter do not keep controls visible; pause keeps them visible',t=>{
 const h=boot(t);h.play();h.player.onMouseMove({clientX:100,clientY:100});h.advance(3000);h.video.emit('timeupdate');h.player.onMouseMove({clientX:102,clientY:101});h.advance(2000);assert.equal(h.player.overlay,false);
 h.video.pause();h.advance(6000);assert.equal(h.player.overlay,true);
});
test('episode picker contains only siblings and switching saves outgoing progress and resumes the next file',t=>{
 const h=boot(t,[item(2,300)]);h.play();h.video.currentTime=180;h.key(40);assert.deepEqual(h.player.episodeFiles.map(f=>f.id),[1,2]);
 h.player.selectEpisode(h.player.episodeFiles[1]);assert.equal(h.app.history().find(f=>f.fileId===1).position,180);assert.equal(h.player.playing.file.id,2);h.advance(100);h.ready(0,'loadedmetadata');assert.equal(h.video.currentTime,300);
});
test('episode picker auto hides; Back closes picker and settings before exiting playback',t=>{
 const h=boot(t);h.play();h.key(40);h.advance(5000);assert.equal(h.player.episodesOpen,false);
 h.key(40);h.key(461);assert.ok(h.player.playing);assert.equal(h.player.episodesOpen,false);h.key(38);assert.equal(h.player.optionsOpen,true);h.key(461);assert.ok(h.player.playing);h.key(461);assert.equal(h.player.playing,null);
});
test('progress distinguishes partial, complete and unwatched files; ended records completion',t=>{
 const h=boot(t,[item(1,250),item(2,960)]);assert.deepEqual(files.map(f=>h.app.fileProgress(f)),[25,100,0]);h.play();h.video.currentTime=1000;h.video.emit('ended');assert.equal(h.app.history().find(f=>f.fileId===1).completed,true);assert.equal(h.player.playing,null);
});
test('episode switches cancel old deadlines and late preload failures',t=>{
 const h=boot(t);h.play();h.advance(10000);h.player.selectFile(files[1]);const current=h.player.playing;h.reply('preload',null,new Error('old error'));assert.doesNotMatch(h.player.status,/old error/);h.advance(100);h.ready();h.advance(50000);assert.equal(h.player.playing,current);assert.equal(current.failed,undefined);
});
test('Filmix uses the shared player without TorrServer and stores stable history links',t=>{
 const h=boot(t);h.app.openFilmix(42,'Online');h.reply('filmix/post',onlinePost());assert.equal(h.app.files.length,2);h.player.selectFile(h.app.files[0]);h.advance(100);assert.equal(h.requests.find(r=>r.route==='filmix/play').body.quality,720);h.reply('filmix/play',{url:'/filmix-stream/temporary-grant'});h.ready(120);h.player.stop();assert.equal(h.app.history()[0].source,'filmix');assert.equal(h.app.history()[0].link,'filmix:42');assert.equal(h.stored['tw-history'].includes('temporary-grant'),false);assert.equal(h.requests.some(r=>/^(preload|status)/.test(r.route)),false);
});
test('Filmix resume renews the stream, restores voice/season/position and ignores late playback responses',t=>{
 const h=boot(t);h.app.resume({source:'filmix',filmixId:42,fileId:20001,season:2,voice:'Dub',quality:720,position:330});h.reply('filmix/post',onlinePost());assert.equal(h.player.playing.file.id,20001);h.advance(100);h.reply('filmix/play',{url:'/renewed'});h.ready(0,'loadedmetadata');assert.equal(h.video.currentTime,330);h.player.stop();h.player.play(h.app.files[0],330);h.advance(100);h.player.stop();h.reply('filmix/play',{url:'/too-late'});assert.equal(h.player.playing,null);assert.notEqual(h.video.src,'/too-late');
});
test('Filmix filters share progress across translations and fall back to an available voice',t=>{
 const h=boot(t,[{source:'filmix',filmixId:42,fileId:10001,position:500,duration:1000,title:'Episode',link:'filmix:42'}]);h.app.openFilmix(42,'Online');h.reply('filmix/post',onlinePost());h.screen.setFilter('voice','Original');assert.equal(h.app.files.length,1);assert.equal(h.app.fileProgress(h.app.files[0]),50);h.screen.setFilter('season','2');assert.equal(h.app.files[0].id,20001);assert.equal(h.app.filmixVoice,'Dub');
});
for(const [setting,step] of [[undefined,30],[10,10],[75,75],[0,30]]) test('media and arrow keys honor seek setting '+setting,t=>{
 const h=boot(t);h.app.config={seekStep:setting};h.play();for(const [code,direction]of[[37,-1],[39,1],[412,-1],[417,1]]){h.video.currentTime=100;h.player.seekControl.cancel();h.key(code);assert.equal(h.player.seekControl.target(),100+direction*step);h.advance(250);assert.equal(h.video.currentTime,100+direction*step);}
});
test('player options cycle fit modes without pausing or seeking and skip unavailable audio',t=>{
 const h=boot(t);h.root.clientWidth=1920;h.root.clientHeight=1080;h.video.videoWidth=1440;h.video.videoHeight=1080;h.play();h.key(38);assert.equal(h.player.optionsOpen,true);assert.equal(h.player.audioDisabled,true);assert.equal(h.video.paused,false);for(const fit of ['scale(1.3333333333333333, 1.3333333333333333)','scale(1.3333333333333333, 1)','scale(1.33, 1.33)','scale(1, 1)']){h.player.cycleFit();assert.equal(h.video.style.transform,fit);}assert.equal(h.video.currentTime,100);
});
test('fit follows video metadata, video size changes and screen dimensions',t=>{
 const h=boot(t);h.root.clientWidth=1920;h.root.clientHeight=1080;h.play();h.player.cycleFit();assert.equal(h.video.style.transform,'scale(1, 1)');h.video.videoWidth=2880;h.video.videoHeight=1080;h.video.emit('loadedmetadata');assert.equal(h.video.style.transform,'scale(1.5, 1.5)');h.player.cycleFit();assert.equal(h.video.style.transform,'scale(1, 1.5)');h.video.videoWidth=1440;h.video.videoHeight=1080;h.video.emit('resize');assert.equal(h.video.style.transform,'scale(1.3333333333333333, 1)');h.root.clientWidth=1440;h.player.updateOptions();assert.equal(h.video.style.transform,'scale(1, 1)');
});
test('audio tracks wrap; Back closes settings before leaving the player',t=>{
 const h=boot(t);h.play();h.video.audioTracks=[{enabled:true,label:'Russian'},{enabled:false,label:'Original'}];h.player.updateOptions();h.player.audioTrack();assert.equal(h.video.audioTracks[1].enabled,true);assert.equal(h.video.audioTracks[0].enabled,false);h.player.audioTrack();assert.equal(h.video.audioTracks[0].enabled,true);h.key(38);h.key(461);assert.ok(h.player.playing);assert.equal(h.player.optionsOpen,false);
});
test('track switching failures keep playback running and episode changes close options',t=>{
 const h=boot(t);h.play();h.video.audioTracks=[{enabled:true},{}];Object.defineProperty(h.video.audioTracks[1],'enabled',{set(){throw new Error('Unsupported');}});h.player.audioTrack();assert.ok(h.player.playing);assert.match(h.app.toastText,/не поддерживает/);h.key(38);h.player.selectFile(files[1]);assert.equal(h.player.optionsOpen,false);
});
test('native Android playback bypasses video, preserves resume and saves progress',t=>{
 const calls=[];const h=boot(t,[],{play(...args){calls.push(args);}});h.player.play(files[0],125);h.advance(100);assert.equal(calls[0][2],125);assert.equal(calls[0][3],30);assert.equal(h.video.src,'');const token=calls[0][4];h.player.nativePlayback({token:'stale',position:10,duration:1000,closed:true});assert.ok(h.player.playing);h.player.nativePlayback({token,position:300,duration:1000,closed:true});assert.equal(h.player.playing,null);assert.equal(h.app.history()[0].position,300);
});
test('Filmix native playback renews its grant and records completion',t=>{
 const calls=[];const h=boot(t,[],{play(...args){calls.push(args);}});h.app.openFilmix(42,'Online');h.reply('filmix/post',onlinePost());h.player.selectFile(h.app.files[0]);h.advance(100);h.reply('filmix/play',{url:'/grant'});assert.equal(calls[0][0],'/grant');h.player.nativePlayback({token:calls[0][4],position:1000,duration:1000,completed:true,closed:true});assert.equal(h.app.history()[0].completed,true);
});
function timeline(h){return{id:'player-timeline',focus(){h.document.activeElement=this;},getBoundingClientRect(){return{left:0,width:1000};},setPointerCapture(){},releasePointerCapture(){}};}
function pointer(target,type,x){return{currentTarget:target,type,clientX:x,pointerId:1,button:0,isPrimary:true,preventDefault(){},stopPropagation(){}};}
test('touch dragging previews until release and time updates preserve the preview',t=>{
 const h=boot(t);h.play();const bar=timeline(h);h.player.onPointer(pointer(bar,'pointerdown',250));h.player.onPointer(pointer(bar,'pointermove',700));assert.equal(h.video.currentTime,100);assert.equal(h.player.position,700);h.video.emit('timeupdate');assert.equal(h.player.position,700);h.player.onPointer(pointer(bar,'pointerup',800));h.advance(250);assert.equal(h.video.currentTime,800);
});
test('cancelling a touch drag restores position without seeking',t=>{
 const h=boot(t);h.play();const bar=timeline(h);h.player.onPointer(pointer(bar,'pointerdown',700));h.player.onPointer(pointer(bar,'pointercancel',700));assert.equal(h.player.position,100);h.advance(300);assert.equal(h.video.currentTime,100);
});
test('native episode picker receives siblings and saves outgoing progress before switching',t=>{
 const calls=[];const h=boot(t,[item(2,230)],{play(...args){calls.push(args);}});h.player.play(files[0]);h.advance(100);const token=calls[0][4];assert.deepEqual(JSON.parse(calls[0][5]).map(f=>f.id),[1,2]);h.player.nativePlayback({token,position:180,duration:1000,closed:true,nextFileId:2});h.advance(100);assert.equal(calls[1][2],230);assert.equal(h.app.history().find(f=>f.fileId===1).position,180);
});
