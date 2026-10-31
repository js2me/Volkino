'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const hash='0123456789abcdef0123456789abcdef01234567';
const files=[{id:1,path:'Season 1/Episode 01.mkv',length:1000},{id:2,path:'Season 1/Episode 02.mkv',length:1000},{id:3,path:'Season 2/Episode 01.mkv',length:1000}];
function boot(saved=[]){
  let document,clock=100000,nextId=0;const tasks=new Map(),requests=[],stored={};
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes={};this.listeners={};this.className='';this._text='';}
    appendChild(e){e.parentNode=this;this.children.push(e);return e;}
    set innerHTML(v){this.children=[];this._text=v;}get innerHTML(){return this._text;}
    set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(e=>e.textContent).join('');}
    setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k]||null;}
    removeAttribute(k){delete this.attributes[k];}
    addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);}
    emit(type,event={}){(this.listeners[type]||[]).forEach(fn=>fn(event));}
    focus(){document.activeElement=this;if(this.onfocus)this.onfocus();}blur(){document.activeElement=document.body;}
    contains(e){return this===e||this.children.some(c=>c.contains(e));}
    click(){if(this.onclick)this.onclick({preventDefault(){},stopPropagation(){}});}
    scrollIntoView(){}getBoundingClientRect(){return {left:0,width:1000,top:0,height:40};}
    querySelectorAll(selector){const out=[],parts=selector.split(',');function walk(e){e.children.forEach(c=>{if(parts.some(s=>s[0]==='.'?c.className.split(' ').includes(s.slice(1)):c.tagName===s.toUpperCase()))out.push(c);walk(c);});}walk(this);return out;}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
  }
  const body=new Element('body');const elements={};
  function node(id,parent=body,tag='div'){const el=parent.appendChild(new Element(tag));el.id=id;elements[id]=el;return el;}
  node('content');node('main');node('page-title');node('toast');node('connection-light');node('connection-text');
  const player=node('player'),video=node('video',player,'video');
  for(const id of ['player-top','player-controls','playing-title','playing-status','player-time','player-progress'])node(id,player);
  node('player-back',player,'button');node('player-timeline',player);const episodes=node('player-episodes',player);node('episode-list',episodes);
  document={body,activeElement:body,createElement:t=>new Element(t),createTextNode(text){const e=new Element();e.textContent=text;return e;},getElementById(id){if(elements[id])return elements[id];let found=null;function walk(e){if(e.id===id)found=e;e.children.forEach(walk);}walk(body);return found;},querySelectorAll:s=>body.querySelectorAll(s),addEventListener:body.addEventListener.bind(body)};
  Object.assign(video,{readyState:0,paused:true,seeking:false,duration:NaN,currentTime:0,load(){this.readyState=0;this.duration=NaN;this.currentTime=0;},pause(){this.paused=true;this.emit('pause');},play(){this.paused=false;return Promise.resolve();}});
  function later(fn,ms){tasks.set(++nextId,{fn,at:clock+ms});return nextId;}
  function advance(ms){const end=clock+ms;for(;;){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;clock=next[1].at;tasks.delete(next[0]);next[1].fn();}clock=end;}
  function XHR(){}XHR.prototype.open=function(method,url){this.url=url;};XHR.prototype.setRequestHeader=function(){};XHR.prototype.send=function(data){this.data=data;requests.push(this);};
  const window={addEventListener(){}};
  const source=fs.readFileSync(require.resolve('../app/app.js'),'utf8').replace('}());','window.test={state:state,playFile:playFile,stopPlayer:stopPlayer,renderFiles:renderFiles,seekControl:seekControl,history:function(){return history;},openFilmix:openFilmix,resumeHistory:resumeHistory,searchFilmix:searchFilmix};}());');
  class FakeDate extends Date{static now(){return clock;}}
  vm.runInNewContext(source,{document,window,XMLHttpRequest:XHR,localStorage:{getItem(){return JSON.stringify(saved);},setItem(k,v){stored[k]=v;}},TWHistory:require('../app/history'),TWPlayback:Object.assign({},require('../app/playback'),{create(video,options){return require('../app/playback').create(video,Object.assign(options,{setTimeout:later,clearTimeout:id=>tasks.delete(id)}));}}),Date:FakeDate,setTimeout:later,clearTimeout:id=>tasks.delete(id)});
  Object.assign(window.test.state,{hash,torrent:{title:'Series'},files:files.map(f=>({...f})),originalLink:'magnet:?xt=urn:btih:'+hash,view:'files'});
  function key(code){body.emit('keydown',{keyCode:code,preventDefault(){}});body.emit('keyup',{keyCode:code,preventDefault(){}});}
  function ready(position=100,event='playing'){video.duration=1000;video.currentTime=position;video.readyState=4;video.paused=false;video.emit(event);}
  function play(){window.test.playFile(files[0],0);advance(100);ready();}
  function reply(route,value,status=200){const r=requests.find(r=>!r.done&&r.url.startsWith('/api/'+route));assert.ok(r,'pending '+route);r.done=true;r.status=status;r.responseText=JSON.stringify(value);r.onload();}
  return {...window.test,document,video,player,elements,advance,key,ready,play,reply,requests,stored,tasks};
}
function item(id,position,duration=1000,extra={}){return {hash,fileId:id,title:'Episode',fileName:files[id-1].path,link:'magnet:?xt=urn:btih:'+hash,position,duration,...extra};}
test('controls hide after pointer seeking and resume hiding when readiness recovers without playing event',()=>{
  const h=boot();h.play();h.elements['player-timeline'].onclick({clientX:500,preventDefault(){},stopPropagation(){}});h.advance(250);h.video.seeking=false;h.video.currentTime=500;h.video.emit('seeked');h.advance(5000);
  assert.equal(h.elements['player-controls'].className,'hidden');
  h.video.readyState=2;h.video.emit('waiting');h.advance(6000);assert.equal(h.elements['player-controls'].className,'');
  h.ready(520,'timeupdate');h.advance(5000);assert.equal(h.elements['player-controls'].className,'hidden');
});
test('time updates and stationary pointer jitter do not keep controls visible; pause keeps them visible',()=>{
  const h=boot();h.play();h.player.emit('mousemove',{clientX:200,clientY:200});
  for(let i=0;i<6;i++){h.advance(1000);h.video.emit('timeupdate');h.player.emit('mousemove',{clientX:201,clientY:201});}
  assert.equal(h.elements['player-controls'].className,'hidden');h.video.pause();h.advance(6000);assert.equal(h.elements['player-controls'].className,'');
  h.key(13);h.video.emit('playing');h.advance(5000);assert.equal(h.elements['player-controls'].className,'hidden');
});
test('Down shows only sibling episodes; arrows select without seeking; OK saves outgoing progress and resumes selected file',()=>{
  const h=boot([item(2,300)]);h.renderFiles();const returnFocus=h.document.activeElement;h.play();h.video.currentTime=240;h.key(40);
  const cards=h.elements['episode-list'].querySelectorAll('button');assert.equal(cards.length,2);assert.equal(h.document.activeElement,cards[0]);assert.equal(cards[0].getAttribute('aria-current'),'true');
  h.key(39);assert.equal(h.document.activeElement,cards[1]);assert.equal(h.seekControl.target(),null);h.key(13);
  assert.equal(h.state.playing.file.id,2);assert.equal(h.state.resume,300);assert.equal(h.history().find(x=>x.fileId===1).position,240);assert.equal(h.state.episodesOpen,false);
  h.advance(100);h.ready(0,'loadedmetadata');assert.equal(h.video.currentTime,300);h.advance(5000);assert.equal(h.state.playing.file.id,2);
  h.stopPlayer();assert.equal(h.document.activeElement,returnFocus);
});
test('episode picker auto hides; Back closes picker before leaving video and Up hides controls immediately',()=>{
  const h=boot();h.play();h.key(40);h.advance(5000);assert.equal(h.state.episodesOpen,false);assert.equal(h.elements['player-controls'].className,'hidden');assert.equal(h.document.activeElement,h.video);
  h.key(40);h.key(461);assert.ok(h.state.playing);assert.equal(h.state.episodesOpen,false);h.key(38);assert.equal(h.elements['player-controls'].className,'hidden');h.key(461);assert.equal(h.state.playing,null);
});
test('file cards show unwatched, partial and complete progress and ended marks the current file complete',()=>{
  const h=boot([item(1,250),item(2,960)]);h.renderFiles();const fills=h.elements.content.querySelectorAll('.file-watch-fill');assert.deepEqual(fills.map(x=>x.style.width),['25%','100%','0%']);
  h.play();h.video.currentTime=1000;h.video.emit('ended');assert.equal(h.history().find(x=>x.fileId===1).completed,true);assert.equal(fills[0].style.width,'100%');assert.equal(h.state.playing,null);
});

test('switching episodes cancels the previous startup deadline and late preload errors',()=>{
 const h=boot();h.play();h.advance(10000);h.key(40);h.key(39);h.key(13);const current=h.state.playing;
 const oldPreload=h.requests.find(r=>r.url==='/api/preload');oldPreload.status=400;oldPreload.responseText=JSON.stringify({error:'old error'});oldPreload.onload();
 assert.doesNotMatch(h.elements['playing-status'].textContent,/old error/);h.advance(50000);assert.equal(h.state.playing,current);assert.equal(current.failed,undefined);
});

function onlinePost(){return {id:42,title:'Online Series',maxQuality:720,voices:['Dub','Original'],seasons:[1,2],files:[{id:10001,path:'Сезон 1/Серия 1',season:1,episode:1,voice:'Dub',qualities:[720,480]},{id:10002,path:'Сезон 1/Серия 2',season:1,episode:2,voice:'Dub',qualities:[720,480]},{id:10001,path:'Сезон 1/Серия 1',season:1,episode:1,voice:'Original',qualities:[720]},{id:20001,path:'Сезон 2/Серия 1',season:2,episode:1,voice:'Dub',qualities:[720]}]};}
test('Filmix uses the shared player and episode picker without any TorrServer requests or expiring links in history',()=>{
 const h=boot();h.openFilmix(42,'Online Series');h.reply('filmix/post',onlinePost());assert.equal(h.state.files.length,2);assert.equal(h.document.getElementById('filmix-voice').value,'Dub');
 h.playFile(h.state.files[0],0);h.advance(100);const request=h.requests.find(r=>r.url==='/api/filmix/play');assert.equal(JSON.parse(request.data).quality,720);h.reply('filmix/play',{url:'/filmix-stream/temporary-grant'});h.ready(120);assert.equal(h.video.src,'/filmix-stream/temporary-grant');
 h.key(40);h.key(39);h.key(13);h.advance(100);h.reply('filmix/play',{url:'/filmix-stream/second-grant'});assert.equal(h.state.playing.file.id,10002);h.ready(200);h.stopPlayer();
 assert.equal(h.requests.some(r=>/\/api\/(preload|status)/.test(r.url)),false);assert.equal(h.history().length,2);assert.equal(h.history()[0].source,'filmix');assert.equal(h.history().find(r=>r.fileId===10001).position,120);assert.equal(h.stored['tw-history'].includes('temporary-grant'),false);assert.equal(h.stored['tw-history'].includes('filmix:42'),true);
});
test('Filmix resume renews the stream and restores voice, season and position; late play responses cannot reopen a closed player',()=>{
 const h=boot();h.resumeHistory({source:'filmix',filmixId:42,fileId:20001,season:2,voice:'Dub',quality:720,position:330});h.reply('filmix/post',onlinePost());assert.equal(h.state.filmixSeason,2);assert.equal(h.state.playing.file.id,20001);h.advance(100);h.reply('filmix/play',{url:'/filmix-stream/renewed'});h.ready(0,'loadedmetadata');assert.equal(h.video.currentTime,330);h.stopPlayer();
 h.playFile(h.state.files[0],330);h.advance(100);h.stopPlayer();const src=h.video.src;h.reply('filmix/play',{url:'/filmix-stream/too-late'});assert.equal(h.state.playing,null);assert.equal(h.video.src,src);
});
test('Filmix selectors filter seasons and voices while keeping progress shared across translations',()=>{
 const h=boot([{source:'filmix',filmixId:42,fileId:10001,position:500,duration:1000,title:'Episode',link:'filmix:42'}]);h.openFilmix(42,'Online Series');h.reply('filmix/post',onlinePost());
 const voice=h.document.getElementById('filmix-voice');voice.value='Original';voice.onchange();assert.equal(h.state.files.length,1);assert.equal(h.state.files[0].voice,'Original');assert.equal(h.elements.content.querySelector('.file-watch-fill').style.width,'50%');
 const season=h.document.getElementById('filmix-season');season.value='2';season.onchange();assert.equal(h.state.files[0].id,20001);assert.equal(h.state.filmixVoice,'Dub');
});


test('player arrows and media keys use the configured seek step, defaulting to 30 seconds',()=>{
  for(const [setting,step] of [[undefined,30],[10,10],[75,75],[0,30]]){
    for(const [key,direction] of [[37,-1],[39,1],[412,-1],[417,1]]){
      const h=boot();h.state.config.seekStep=setting;h.play();h.key(key);
      assert.equal(h.seekControl.target(),100+direction*step);
      h.advance(250);assert.equal(h.video.currentTime,100+direction*step);
    }
  }
});
