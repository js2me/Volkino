'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(){
 let document;const requests=[];
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes={};this.className='';this._text='';this.scrollTop=0;}
  appendChild(e){this.children.push(e);return e;}
  set innerHTML(v){this.children=[];this._text=v;}get innerHTML(){return this._text;}
  set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(e=>e.textContent).join('');}
  setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k]||null;}
  addEventListener(){}focus(){document.activeElement=this;}contains(e){return this===e||this.children.some(c=>c.contains(e));}
  querySelectorAll(s){const matches=e=>s[0]==='.'?e.className.split(' ').includes(s.slice(1)):e.tagName===s.toUpperCase();const out=[];function walk(e){e.children.forEach(c=>{if(matches(c))out.push(c);walk(c);});}walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 const body=new Element('body'),main=body.appendChild(new Element()),content=main.appendChild(new Element());main.id='main';content.id='content';
 for(const id of ['player-audio','player-fit','player-options-close','touch-exit','touch-rewind','touch-forward','touch-pause','touch-episodes','touch-audio','page-title','video','player','player-back','player-timeline','connection-light','connection-text']){const e=body.appendChild(new Element());e.id=id;}
 document={body,activeElement:body,createElement:t=>new Element(t),createTextNode:t=>{const e=new Element();e.textContent=t;return e;},addEventListener(){},querySelectorAll:s=>body.querySelectorAll(s),getElementById(id){let found=null;function walk(e){if(e.id===id)found=e;e.children.forEach(walk);}walk(body);return found;}};
 function XHR(){}XHR.prototype.open=function(method,url){this.url=url;};XHR.prototype.setRequestHeader=function(){};XHR.prototype.send=function(){requests.push(this);};
 const window={addEventListener(){}};
 const source=fs.readFileSync(require.resolve('../app/app.js'),'utf8').replace('}());','window.test={state:state,openDetails:openDetails,change:change,returnToResults:returnToResults,runSearch:runSearch};}());');
 vm.runInNewContext(source,{document,window,XMLHttpRequest:XHR,localStorage:{getItem(){return'[]';}},TWHistory:require('../app/history'),TWPlayback:require('../app/playback'),setTimeout,clearTimeout});
 function reply(route,data,status=200){const r=requests.find(r=>!r.done&&r.url.startsWith('/api/'+route));assert.ok(r,'pending '+route);r.done=true;r.status=status;r.responseText=JSON.stringify(data);r.onload();}
 return{...window.test,document,content,requests,reply};
}
const movie={id:'tmdb:movie:1',title:'Фильм',type:'movie',poster:''};
const torrent={title:'Фильм 1080p',magnet:'magnet:?xt=urn:btih:abc',seeders:10,size:100};
test('details starts torrent search immediately and a later description preserves results and focus',()=>{
 const h=boot();h.openDetails(movie);assert.equal(h.content.textContent.includes('Найти раздачи'),false);assert.match(h.content.textContent,/Ищем раздачи/);
 h.reply('search?',{results:[torrent]});const row=h.content.querySelector('.torrent');row.focus();h.reply('catalog/item?',{...movie,description:'Описание',searchTitle:'Фильм'});
 assert.equal(h.content.querySelector('.torrent'),row);assert.equal(h.document.activeElement,row);assert.match(h.content.textContent,/Описание/);assert.equal(h.content.children[1].className,'detail-torrents');
});
test('a refined search title discards the earlier pending response; leaving details discards late responses',()=>{
 const h=boot();h.openDetails(movie);h.reply('catalog/item?',{...movie,description:'Описание',searchTitle:'Original title'});
 assert.ok(h.requests.some(r=>r.url==='/api/search?q=Original%20title'));
 h.reply('search?',{results:[torrent]});assert.equal(h.content.querySelector('.torrent'),null);
 h.reply('search?',{results:[{...torrent,title:'Correct result'}]});assert.match(h.content.textContent,/Correct result/);
 h.openDetails(movie);h.change('files');h.content.textContent='Files';h.reply('catalog/item?',{...movie,description:'Late description'});h.reply('search?',{results:[torrent]});assert.equal(h.content.textContent,'Files');
});
test('returning from a torrent restores its film and results without searching again',()=>{
 const h=boot();h.state.detailOrigin='catalog';h.openDetails(movie);h.reply('catalog/item?',{...movie,description:'Описание'});h.reply('search?',{results:[torrent,{...torrent,title:'Second'}]});h.document.getElementById('main').scrollTop=680;
 h.content.querySelectorAll('.torrent')[1].onclick();assert.equal(h.state.view,'files');const count=h.requests.filter(r=>r.url.startsWith('/api/search?')).length;
 h.returnToResults();assert.equal(h.state.view,'details');assert.equal(h.document.getElementById('main').scrollTop,680);assert.match(h.document.activeElement.textContent,/Second/);assert.equal(h.requests.filter(r=>r.url.startsWith('/api/search?')).length,count);
});
test('a failed automatic search can retry on the same details page',()=>{
 const h=boot();h.openDetails(movie);h.reply('search?',{error:'Offline'},503);assert.match(h.content.textContent,/Offline/);
 const retry=h.content.querySelectorAll('button').find(b=>b.textContent==='Повторить поиск');assert.ok(retry);retry.onclick();h.reply('search?',{results:[torrent]});assert.equal(h.state.view,'details');assert.ok(h.content.querySelector('.torrent'));
});

test('settings exposes local installation and keeps a failed installation visible',()=>{
 const h=boot();h.state.config={torrserverMode:'external',torrserverUrl:'http://external:8090'};h.change('settings');
 const mode=h.document.getElementById('ts-mode');assert.equal(mode.value,'external');mode.value='local';mode.onchange();
 const install=h.content.querySelectorAll('button').find(b=>b.textContent==='Установить и запустить');assert.ok(install);install.onclick();
 h.reply('local-server/start',{state:'installing'});h.reply('local-server',{state:'installing',version:'MatriX.test'});
 assert.match(h.document.getElementById('local-server-status').textContent,/Загружаем/);
 h.reply('local-server',{state:'error',version:'MatriX.test',error:'SHA-256 mismatch'});
 assert.match(h.document.getElementById('local-server-status').textContent,/SHA-256 mismatch/);assert.equal(mode.value,'local');
 h.change('files');
});
test('a late local-server action cannot cancel polling on the next page',()=>{
 const h=boot();h.state.config={torrserverMode:'external'};h.change('settings');
 h.content.querySelectorAll('button').find(b=>b.textContent==='Установить и запустить').onclick();
 h.change('files');const marker=setTimeout(()=>{},10000);h.state.timer=marker;
 h.reply('local-server/start',{state:'installing'});assert.equal(h.state.timer,marker);assert.equal(marker._destroyed,false);clearTimeout(marker);
});
