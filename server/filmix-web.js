'use strict';
// FilmixTV's web protocol (MSX opens https://filmix.tv/intro).
var http=require('http'),https=require('https'),URL=require('url'),crypto=require('crypto'),net=require('net');
var recent=require('./recent');
var SITE='https://filmix.tv',API='https://api.filmix.tv/api-fx';
var UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager';
function id(value){var n=Number(value);if(!/^\d+$/.test(String(value))||n<1||n>2147483647)throw new Error('Некорректный ID Filmix');return n;}
function text(value){return String(value||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:\d+|x[\da-f]+);/gi,function(s){var names={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(names[s])return names[s];var n=s[2].toLowerCase()==='x'?parseInt(s.slice(3,-1),16):Number(s.slice(2,-1));return n>0&&n<=65535?String.fromCharCode(n):s;}).trim().slice(0,12000);}
function names(list){return Array.isArray(list)?list.slice(0,20).map(function(v){return text(typeof v==='object'?v.name:v);}):[];}
function rating(v){return Number(v)>0&&Number(v)<=10?Number(v).toFixed(1):'';}
function cap(user){return user&&user.is_pro_plus?2160:user&&user.is_pro?1080:720;}
// Parse the server-rendered JSON value without executing any remote JavaScript.
function playerData(html){
  var marker='window.playerData',at=html.indexOf(marker),start=html.indexOf('=',at)+1;
  if(at<0||start<1)throw new Error('Filmix TV не вернул данные видео');
  while(/\s/.test(html[start]))start++;
  if(html[start]!=='{')throw new Error('Неизвестный формат Filmix TV');
  var depth=0,quoted=false,escaped=false;
  for(var i=start;i<html.length;i++){
    var c=html[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
    else if(c==='"')quoted=true;
    else if(c==='{'||c==='[')depth++;
    else if(c==='}'||c===']'){depth--;if(!depth)return JSON.parse(html.slice(start,i+1));}
  }
  throw new Error('Filmix TV вернул неполные данные видео');
}
function create(options){
  var site=options.site||SITE,apiBase=options.api||API,refreshing=null,cache={},latestCache={},grants={},signingKey=crypto.randomBytes(32);
  function config(){return options.getConfig();}
  function identity(){return config().filmixWebHash+'|'+config().filmixWebRefreshToken;}
  function headers(extra){return Object.assign({'User-Agent':config().filmixWebUserAgent||UA,Accept:'application/json','Content-Language':'ru',Origin:site,Referer:site+'/'},extra||{});}
  function cookies(){var c=config();return 'lang=ru; hash1='+encodeURIComponent(c.filmixWebHash||'')+'; token1='+encodeURIComponent(c.filmixWebAccessToken||'')+'; refresh1='+encodeURIComponent(c.filmixWebRefreshToken||'');}
  function saveCookies(values){
    var update={},keys={hash1:'filmixWebHash',token1:'filmixWebAccessToken',refresh1:'filmixWebRefreshToken'};
    (values||[]).forEach(function(cookie){var pair=cookie.split(';')[0],at=pair.indexOf('='),key=keys[pair.slice(0,at)],value=decodeURIComponent(pair.slice(at+1));if(key&&value&&value!=='deleted')update[key]=value;});
    if(Object.keys(update).length)options.saveConfig(update);
  }
  function request(address,settings){
    settings=settings||{};
    return new Promise(function(resolve,reject){
      var u=URL.parse(address),data=settings.body===undefined?null:JSON.stringify(settings.body),h=headers(settings.headers);
      if(data){h['Content-Type']='application/json;charset=UTF-8';h['Content-Length']=Buffer.byteLength(data);}
      var req=(u.protocol==='https:'?https:http).request(Object.assign({},u,{method:settings.method||'GET',headers:h}),function(res){
        var chunks=[],size=0;res.on('data',function(chunk){size+=chunk.length;if(size>8*1024*1024){req.destroy();reject(new Error('Слишком большой ответ Filmix TV'));}else chunks.push(chunk);});
        res.on('error',function(){reject(new Error('Ответ Filmix TV прерван'));});res.on('aborted',function(){reject(new Error('Ответ Filmix TV прерван'));});
        res.on('end',function(){if(settings.cookies)saveCookies(res.headers['set-cookie']);resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()});});
      });
      req.setTimeout(20000,function(){req.destroy();reject(new Error('Filmix TV не ответил вовремя'));});req.on('error',function(){reject(new Error('Нет соединения с Filmix TV'));});req.end(data);
    });
  }
  function needSession(){if(!config().filmixWebHash||!config().filmixWebAccessToken)throw new Error('Войдите в Filmix TV в настройках приложения');}
  function refresh(){
    if(refreshing)return refreshing;
    var c=config();if(!c.filmixWebRefreshToken)return Promise.reject(new Error('Войдите в Filmix TV заново'));
    refreshing=request(apiBase+'/refresh?refreshToken='+encodeURIComponent(c.filmixWebRefreshToken),{headers:{hash:c.filmixWebHash}}).then(function(r){
      var d;try{d=JSON.parse(r.text);}catch(_){throw new Error('Filmix TV вернул некорректную сессию');}
      if(r.status!==200||!d.accessToken)throw new Error('Сессия Filmix TV истекла. Войдите заново в настройках');
      var update={filmixWebAccessToken:d.accessToken};if(d.refreshToken)update.filmixWebRefreshToken=d.refreshToken;options.saveConfig(update);
    });
    refreshing=refreshing.then(function(v){refreshing=null;return v;},function(e){refreshing=null;throw e;});return refreshing;
  }
  function api(route,retry){
    needSession();var c=config();return request(apiBase+'/'+route,{headers:{Authorization:'Bearer '+c.filmixWebAccessToken,hash:c.filmixWebHash}}).then(function(r){
      if((r.status===401||r.status===403)&&!retry)return refresh().then(function(){return api(route,true);});
      if(r.status!==200)throw new Error('Filmix TV: HTTP '+r.status);
      var result;try{result=JSON.parse(r.text);}catch(_){throw new Error('Filmix TV вернул некорректный JSON');}return result;
    });
  }
  function page(path,retry){
    needSession();return request(site+path,{cookies:true,headers:{Accept:'text/html',Cookie:cookies()}}).then(function(r){
      if((r.status===401||r.status===403||r.status===302&&/login/.test(r.headers.location||''))&&!retry)return refresh().then(function(){return page(path,true);});
      if(r.status!==200)throw new Error('Не удалось открыть Filmix TV. Войдите заново в настройках');return r.text;
    });
  }
  function watch(value,force){
    var n=id(value),key=identity()+'|'+n,old=cache[key];if(!force&&old&&old.expires>Date.now())return old.promise;
    var promise=page('/watch?id='+n).then(function(html){var d=playerData(html);if(!d.movie||Number(d.movie.id)!==n)throw new Error('Filmix TV вернул другое видео');return d;}).catch(function(e){delete cache[key];throw e;});
    cache[key]={promise:promise,expires:Date.now()+120000};Object.keys(cache).slice(0,-32).forEach(function(k){delete cache[k];});return promise;
  }
  function profile(){return api('me').then(function(u){return {authenticated:true,login:text(u.login),maxQuality:cap(u),plan:u.is_pro_plus?'PRO+':u.is_pro?'PRO':'Аккаунт',transport:'web'};});}
  function details(value){return watch(value).then(function(d){var m=d.movie;return {id:id(value),title:text(m.title),originalTitle:text(m.original_title),poster:m.poster?'/filmix-poster?id='+id(value):'',description:text(m.short_story),year:String(m.year||''),duration:Number(m.duration)||0,genres:names(m.genres),countries:names(m.countries),actors:names(m.actors),directors:names(m.directors),imdbRating:rating(m.ratingImdb),kpRating:rating(m.ratingKinopoisk)};});}
  function latest(value,force){
    var p=recent.pageNumber(value),key=identity()+'|'+p,old=latestCache[key];if(!force&&old&&old.updatedAt>Date.now()-300000)return Promise.resolve(old);
    return api('list?limit=50&page='+p).then(function(d){
      if(!d||!Array.isArray(d.items))throw new Error('Filmix TV не вернул список');
      var result={source:'filmix',page:Number(d.page)||p,hasMore:!!d.has_next_page,updatedAt:Date.now(),note:'Последние публикации и обновления Filmix TV.',items:d.items.map(function(m){var serial=(m.genres||[]).some(function(g){return Number(g.id)===7||Number(g.id)===93;})||Number(m.last_season)>0;return {id:'filmix:'+id(m.id),filmixId:id(m.id),source:'filmix',title:text(m.title),year:String(m.year||''),type:serial?'tv':'movie',season:Number(m.last_season)||0,episode:Number(m.last_episode)||0,quality:String(m.quality||''),updatedAt:m.updated||''};})};
      latestCache[key]=result;Object.keys(latestCache).slice(0,-8).forEach(function(k){delete latestCache[k];});return result;
    }).catch(function(e){if(old)return Object.assign({},old,{stale:true});throw e;});
  }
  function search(query){query=String(query||'').trim();if(query.length<2||query.length>160)throw new Error('Введите от 2 до 160 символов');return api('list?limit=48&search='+encodeURIComponent(query)).then(function(d){if(!d||!Array.isArray(d.items))throw new Error('Filmix TV не вернул результаты поиска');return {results:d.items.map(function(m){return {id:id(m.id),title:text(m.title),originalTitle:text(m.original_name),year:Number(m.year)||0};})};});}
  function files(d){
    var out=[],maximum=cap(d.user),rows=[];
    if(d.isSerial&&d.videoLinks&&typeof d.videoLinks==='object'){
      Object.keys(d.videoLinks).forEach(function(voice){var seasons=d.videoLinks[voice];Object.keys(seasons||{}).forEach(function(key){var season=seasons[key];Object.keys(season.episodes||{}).forEach(function(key){rows.push(Object.assign({},season.episodes[key],{season:season.season,voiceover:voice}));});});});
    }else if(Array.isArray(d.videoLinks))rows=d.videoLinks;
    rows.forEach(function(row){
      var season=d.isSerial?Number(row.season):0,episode=d.isSerial?Number(row.episode):1;
      if(!isFinite(season)||season<0||season>1000||!isFinite(episode)||episode<1||episode>9999)return;
      var voice=text(row.voiceover||'Оригинал'),variants=(row.files||[]).filter(function(f){return Number(f.quality)>=144&&Number(f.quality)<=maximum&&(!f.proPlus||d.user&&d.user.is_pro_plus)&&typeof f.url==='string';});
      if(!variants.length)return;
      out.push({id:season*10000+episode,season:season,episode:episode,voice:voice,qualities:variants.map(function(f){return Number(f.quality);}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return b-a;}),path:d.isSerial?'Сезон '+season+'/Серия '+episode:text(d.movie.title),variants:variants});
    });return out;
  }
  function post(value){return watch(value).then(function(d){var list=files(d);if(!list.length)throw new Error('Filmix TV: нет доступных видео для этого аккаунта');return {id:id(value),title:text(d.movie.title),isSeries:!!d.isSerial,maxQuality:cap(d.user),voices:list.map(function(f){return f.voice;}).filter(function(v,i,a){return a.indexOf(v)===i;}),seasons:list.map(function(f){return f.season;}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return a-b;}),files:list.map(function(f){var out=Object.assign({},f);delete out.variants;return out;})};});}
  function mediaURL(value){var u=URL.parse(String(value));if(!/^https?:$/.test(u.protocol||'')||!u.hostname||u.auth||u.hash||net.isIP(u.hostname)&&!options.publicAddress(u.hostname)&&!options.lookup)throw new Error('Недопустимый адрес Filmix TV');return u;}
  function resolve(spec,force){return watch(spec.id,force).then(function(d){var row=files(d).filter(function(f){return f.id===Number(spec.fileId)&&f.voice===spec.voice;})[0],variant=row&&row.variants.filter(function(f){return Number(f.quality)===Number(spec.quality);})[0];if(!variant)throw new Error('Видео или качество недоступно для этого аккаунта');mediaURL(variant.url);return variant.url;});}
  function grant(spec){return resolve(spec).then(function(address){Object.keys(grants).forEach(function(k){if(grants[k].expires<Date.now())delete grants[k];});var keys=Object.keys(grants);if(keys.length>=64)delete grants[keys[0]];var key=crypto.randomBytes(24).toString('hex');grants[key]={url:address,spec:spec,identity:config().filmixWebHash,expires:Date.now()+4*3600000,updated:Date.now()};return {url:'/filmix-stream/'+key};});}
  function child(key,address){var encoded=Buffer.from(address).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'),sig=crypto.createHmac('sha256',signingKey).update(key+'\n'+address).digest('hex');return '/filmix-stream/'+key+'/'+encoded+'.'+sig;}
  function proxy(req,res,address,settings){
    var remote,closed=false;settings=settings||{};res.on('close',function(){closed=true;if(remote)remote.destroy();});
    function fail(){if(closed||res.finished)return;if(!res.headersSent){res.writeHead(502);res.end('Поток Filmix TV недоступен');}else res.destroy();}
    function load(value,redirects){
      if(closed)return;var u;try{u=mediaURL(value);}catch(_){return fail();}
      var h=headers({'Accept-Encoding':'identity'});if(req.headers.range&&!settings.image)h.Range=req.headers.range;
      remote=(u.protocol==='https:'?https:http).request(Object.assign({},u,{method:req.method,headers:h,lookup:options.lookup||options.publicLookup}),function(up){
        if(up.statusCode>=300&&up.statusCode<400&&up.headers.location){up.resume();if(!redirects)return fail();return load(URL.resolve(value,up.headers.location),redirects-1);}
        var type=String(up.headers['content-type']||''),playlist=/mpegurl/i.test(type)||/\.m3u8(?:\?|$)/i.test(value);
        if(settings.image&&(up.statusCode!==200||!/^image\/(jpeg|png|webp)(?:;|$)/.test(type))){up.resume();return fail();}
        if(req.method==='HEAD'){up.resume();res.writeHead(up.statusCode,{'Content-Type':playlist?'application/vnd.apple.mpegurl':type,'Cache-Control':'no-store'});res.end();return;}
        if(settings.image||playlist&&settings.key){
          var chunks=[],size=0,limit=settings.image?2*1024*1024:1024*1024;
          up.on('data',function(c){size+=c.length;if(size>limit){remote.destroy();fail();}else chunks.push(c);});up.on('error',fail);up.on('aborted',fail);
          up.on('end',function(){if(closed||res.finished||size>limit)return;var data=Buffer.concat(chunks);
            if(playlist){var body=data.toString();if(body.indexOf('#EXTM3U')!==0)return fail();body=body.split(/\r?\n/).map(function(line){if(line&&line[0]!=='#')return child(settings.key,URL.resolve(value,line));return line.replace(/URI="([^"]+)"/g,function(_,uri){return 'URI="'+child(settings.key,URL.resolve(value,uri))+'"';});}).join('\n');data=Buffer.from(body);type='application/vnd.apple.mpegurl';}
            res.writeHead(200,{'Content-Type':type,'Content-Length':data.length,'Cache-Control':settings.image?'private, max-age=10800':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
          });return;
        }
        var out={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};['content-type','content-length','content-range','accept-ranges'].forEach(function(h){if(up.headers[h])out[h]=up.headers[h];});res.writeHead(up.statusCode,out);up.on('error',fail);up.on('aborted',fail);if(req.method==='HEAD'){up.resume();res.end();}else up.pipe(res);
      });remote.setTimeout(45000,function(){remote.destroy();fail();});remote.on('error',fail);remote.end();
    }load(address,4);
  }
  function stream(req,res,path){
    var parts=path.split('/'),key=parts[0],g=grants[key];if(!g||g.expires<Date.now()||g.identity!==config().filmixWebHash){res.writeHead(410);res.end();return;}
    if(parts.length>1){var pair=parts[1].split('.'),address;try{address=Buffer.from(pair[0].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString();}catch(_){res.writeHead(403);res.end();return;}var sig=crypto.createHmac('sha256',signingKey).update(key+'\n'+address).digest('hex');if(pair[1]!==sig){res.writeHead(403);res.end();return;}return proxy(req,res,address,{key:key});}
    (Date.now()-g.updated>120000?resolve(g.spec,true).then(function(address){g.url=address;g.updated=Date.now();}):Promise.resolve()).then(function(){proxy(req,res,g.url,{key:key});},function(){res.writeHead(502);res.end();});
  }
  function poster(req,res,value){watch(value).then(function(d){proxy(req,res,d.movie.poster,{image:true});},function(){res.writeHead(502);res.end();});}
  function login(name,password){
    name=String(name||'').trim();password=String(password||'');if(!name||!password)throw new Error('Введите логин и пароль Filmix TV');
    return request(site+'/login?tab=remote',{cookies:true,headers:{Cookie:cookies(),Accept:'text/html'}}).then(function(){return request(site+'/api/login',{method:'POST',cookies:true,headers:{Cookie:cookies()},body:{name:name,password:password}});}).then(function(r){
      var d;try{d=JSON.parse(r.text);}catch(_){throw new Error('Filmix TV не ответил на вход');}
      if(r.status===409||d.errorKey==='tooManyDevices')throw new Error('Достигнут лимит устройств Filmix TV. Удалите неиспользуемое устройство в личном кабинете');
      if(r.status!==200||!d.redirect||!config().filmixWebAccessToken)throw new Error(d.errorKey==='wrongLoginOrPassword'?'Неверный логин или пароль Filmix TV':'Вход Filmix TV не завершён. Проверьте аккаунт на filmix.tv');
      cache={};latestCache={};return profile();
    });
  }
  function disconnect(){options.saveConfig({filmixWebAccessToken:'',filmixWebRefreshToken:''});cache={};latestCache={};grants={};return {ok:true};}
  function authStart(){throw new Error('Для Filmix TV используйте вход по логину и паролю в настройках');}
  return {latest:latest,search:search,details:details,post:post,profile:profile,poster:poster,grant:grant,stream:stream,login:login,authStart:authStart,authCheck:profile,disconnect:disconnect};
}
module.exports={create:create,playerData:playerData};
