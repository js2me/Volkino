'use strict';
var URL=require('url'),fs=require('fs'),core=require('./core');
var ORIGIN='http://fxmlparsers.in.net';
function text(value){return core.clean(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,function(_,s){return String.fromCharCode(s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):parseInt(s,10));}).replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
function pageQuery(value){var u=URL.parse(core.clean(value),true);if(u.hostname&&u.hostname!=='fxmlparsers.in.net'&&!/^[a-z0-9-]+\.fxmlparsers\.in\.net$/.test(u.hostname))return null;if(u.pathname!=='/VilkaDB/'&&u.pathname!=='/VilkaDB')return null;return u.query;}
function itemKey(value){var q=pageQuery(value);if(!q||q.id!=='tmdb'||q.torr||q.torr_only)return null;if(/^\d+$/.test(q.tid||'')&&/^(movie|tv)$/.test(q.media_type||''))return'tmdb:'+q.media_type+':'+q.tid;if(/^tt\d+$/.test(q.imdbid||''))return'imdb:'+q.imdbid;return null;}
function endpoint(key){var m=String(key||'').match(/^tmdb:(movie|tv):(\d{1,12})$/);if(m)return'/VilkaDB/?id=tmdb&media_type='+m[1]+'&tid='+m[2];m=String(key||'').match(/^imdb:(tt\d{1,12})$/);if(m)return'/VilkaDB/?id=tmdb&imdbid='+m[1];throw new Error('Некорректная карточка каталога');}
function posterPath(value){var u=URL.parse(core.clean(value),true);if(u.query.wimg)u=URL.parse(u.query.wimg);if(!/^(image\.tmdb\.org|imagetmdb\.com)$/.test(u.hostname||''))return'';var p=u.pathname||'';return/^\/t\/p\/(w200|w300|w500|original)\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(p)?p.replace(/\/p\/(w300|w500|original)\//,'/p/w200/'):'';}
function poster(value){var p=posterPath(value);return p?'/poster?path='+encodeURIComponent(p):'';}
function cards(page,limit){var seen={};return(page.channels||[]).map(function(c){var id=itemKey(c.playlist_url),name=text(c.title);if(!id||!name||seen[id])return null;seen[id]=true;var description=core.clean(c.description),rating=description.match(/class=['"][^'"]*drating[^'"]*['"][^>]*>([\d.]+)/),year=description.match(/class=['"][^'"]*year[^'"]*['"][^>]*>(\d{4})/);return{id:id,title:name,poster:poster(c.logo_30x30),rating:rating?rating[1]:'',year:year?year[1]:'',type:id.indexOf('tmdb:tv:')===0||/сериал/i.test(text(description))?'tv':'movie',metadata:text(description).slice(0,240)};}).filter(Boolean).slice(0,limit||18);}
function popular(page){var channels=[],group='';(page.channels||[]).forEach(function(c){var m=core.clean(c.before).match(/class=['"][^'"]*chapterall[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i);if(m)group=text(m[1]);if(/тренды|популярн/i.test(group))channels.push(c);});return cards({channels:channels});}
function details(page,key){
  var title=text(page.title),header='',description='',searchTitle=title,type=key.indexOf('tmdb:tv:')===0?'tv':'movie';
  (page.channels||[]).forEach(function(c){if(c.after){var t=text(c.after);if(/^Описание(?:\s|$)/i.test(t))description=t.replace(/^Описание\s*/i,'').slice(0,4000);else if(!header&&t.length>20)header=t.slice(0,800);}var q=pageQuery(c.playlist_url);if(q&&q.torr){searchTitle=core.clean(q.torr);if(q.media_type==='tv')type='tv';}});
  if(!title)throw new Error('VilkaDB не вернул описание фильма');var y=header.match(/\b(19\d{2}|20\d{2})\b/);
  return{id:key,title:title,poster:poster(page.icon),description:description||'Описание пока недоступно.',metadata:header,year:y?y[1]:'',type:type,searchTitle:searchTitle};
}
var GENRES={
  movie:[[28,'Боевик'],[12,'Приключения'],[16,'Мультфильм'],[35,'Комедия'],[80,'Криминал'],[99,'Документальный'],[18,'Драма'],[10751,'Семейный'],[14,'Фэнтези'],[36,'История'],[27,'Ужасы'],[10402,'Музыка'],[9648,'Детектив'],[10749,'Мелодрама'],[878,'Фантастика'],[10770,'Телевизионный фильм'],[53,'Триллер'],[10752,'Военный'],[37,'Вестерн']],
  tv:[[10759,'Боевик и приключения'],[16,'Мультфильм'],[35,'Комедия'],[80,'Криминал'],[99,'Документальный'],[18,'Драма'],[10751,'Семейный'],[10762,'Детский'],[9648,'Детектив'],[10763,'Новости'],[10764,'Реалити-шоу'],[10765,'Фантастика и фэнтези'],[10766,'Мыльная опера'],[10767,'Ток-шоу'],[10768,'Война и политика'],[37,'Вестерн']]
};
function genreOptions(){var out={};Object.keys(GENRES).forEach(function(type){out[type]=GENRES[type].map(function(g){return{id:String(g[0]),name:g[1]};});});return out;}
function browseFilters(query){
  var type=String(query.type||'movie'),genre=String(query.genre||''),rating=Number(query.minRating||0),page=Number(query.page||1),year=String(query.year||''),sort=String(query.sort||'popular');
  if(type!=='movie'&&type!=='tv')throw new Error('Выберите фильмы или сериалы');
  if(genre&&!GENRES[type].some(function(g){return String(g[0])===genre;}))throw new Error('Этот жанр недоступен для выбранного типа');
  if([0,5,6,7,8,9].indexOf(rating)<0)throw new Error('Некорректный минимальный рейтинг');
  if(!isFinite(page)||Math.floor(page)!==page||page<1||page>500)throw new Error('Некорректная страница каталога');
  if(year&&(!/^\d{4}$/.test(year)||Number(year)<1900||Number(year)>new Date().getUTCFullYear()))throw new Error('Некорректный год');
  if(['popular','newest','rating'].indexOf(sort)<0)throw new Error('Некорректная сортировка');
  return{type:type,genre:genre,minRating:rating,year:year,sort:sort,page:page};
}
function browseEndpoint(f){return'/VilkaDB/?type='+f.type+'&with_genres='+f.genre+'&rating='+(f.minRating||'')+'&year='+(f.year||'')+'&p='+f.page;}
function browsePage(data,f){
  if(!data||!Array.isArray(data.channels))throw new Error('Источник вернул некорректную страницу каталога');
  var items=cards(data,40).filter(function(c){return c.type===f.type&&(!f.minRating||Number(c.rating)>=f.minRating)&&(!f.year||c.year===f.year);});
  if(f.sort==='newest'||f.sort==='rating')items=items.map(function(c,i){return{card:c,index:i};}).sort(function(a,b){var field=f.sort==='rating'?'rating':'year';return Number(b.card[field]||0)-Number(a.card[field]||0)||a.index-b.index;}).map(function(c){return c.card;});
  var more=data._catalog_has_more===true||data._catalog_has_more===1||data._catalog_has_more==='1';
  if(!more)more=data.channels.some(function(c){var q=pageQuery(c.playlist_url);return q&&q.type===f.type&&Number(q.p)===f.page+1;});
  return{items:items,filters:f,genres:genreOptions(),hasMore:more&&f.page<500,source:'VilkaDB'};
}
function create(options){
  var fetchPage=options.fetchPage,now=options.now||Date.now,file=options.cacheFile,cache={},pending={};
  if(file)try{var saved=JSON.parse(fs.readFileSync(file,'utf8'));Object.keys(saved).slice(-32).forEach(function(k){if(k==='home'||/^browse:(movie|tv):[0-9]*:[0-9]:[0-9]*:(popular|newest|rating):[0-9]+$/.test(k)||/^(tmdb:(movie|tv):\d+|imdb:tt\d+)$/.test(k))cache[k]=saved[k];});}catch(_){}
  function save(){var keys=Object.keys(cache).sort(function(a,b){return cache[b].at-cache[a].at;});keys.slice(32).forEach(function(k){delete cache[k];});if(file)try{fs.writeFileSync(file+'.tmp',JSON.stringify(cache),{mode:384});fs.renameSync(file+'.tmp',file);}catch(_){} }
  function cached(key,ttl,loader){var old=cache[key];if(old&&old.data&&now()-old.at<ttl)return Promise.resolve(Object.assign({},old.data,{cached:true}));if(pending[key])return pending[key];pending[key]=Promise.resolve().then(loader).then(function(data){cache[key]={at:now(),data:data};save();return data;},function(err){if(old&&old.data)return Object.assign({},old.data,{cached:true,stale:true});throw err;}).then(function(data){delete pending[key];return data;},function(e){delete pending[key];throw e;});return pending[key];}
  function home(){return cached('home',3*60*60*1000,function(){var year=new Date(now()).getUTCFullYear(),warnings=[];function get(p){return fetchPage(p).catch(function(){warnings.push(p);return{channels:[]};});}
    return Promise.all([get('/VilkaDB/'),get('/VilkaDB/?type=movie&year='+year),get('/VilkaDB/?type=tv&year='+year)]).then(function(pages){var sections=[{id:'popular',title:'Популярное сейчас',items:popular(pages[0])},{id:'movies',title:'Новые фильмы · '+year,items:cards(pages[1])},{id:'series',title:'Новые сериалы · '+year,items:cards(pages[2])}].filter(function(s){return s.items.length;});if(!sections.length)throw new Error('Каталог временно недоступен. Поиск торрентов работает отдельно.');return{sections:sections,updatedAt:now(),partial:warnings.length>0,source:'VilkaDB'};});});}
  function item(key){var url=endpoint(key);return cached(key,24*60*60*1000,function(){return fetchPage(url).then(function(page){return details(page,key);});});}
  function browse(query){var f=browseFilters(query),key='browse:'+f.type+':'+f.genre+':'+f.minRating+':'+f.year+':'+f.sort+':'+f.page;return cached(key,60*60*1000,function(){return fetchPage(browseEndpoint(f)).then(function(page){var result=browsePage(page,f);result.updatedAt=now();return result;});});}
  return{home:home,item:item,browse:browse};
}
module.exports={origin:ORIGIN,text:text,itemKey:itemKey,endpoint:endpoint,posterPath:posterPath,cards:cards,popular:popular,details:details,genreOptions:genreOptions,browseFilters:browseFilters,browseEndpoint:browseEndpoint,browsePage:browsePage,create:create};
