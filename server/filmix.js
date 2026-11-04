'use strict';
// Filmix mobile API v2 adapter. Node 8 / webOS, no dependencies.
var http=require('http'),https=require('https'),URL=require('url'),crypto=require('crypto'),dns=require('dns'),net=require('net');
var DEFAULT_API='http://filmixapp.cyou/api/v2',DEFAULT_SITE='https://filmix.my';
var recent=require('./recent');
function number(value,name){var n=Number(value);if(!/^\d+$/.test(String(value))||!isFinite(n)||n<1||n>2147483647)throw new Error('Некорректный '+name);return n;}
function mediaURL(value){var u=URL.parse(String(value||''));if(!/^https?:$/.test(u.protocol||'')||!u.hostname||u.auth||u.hash)throw new Error('Filmix вернул некорректную ссылку на видео');return u;}
function publicAddress(address){
  if(net.isIP(address)===4){var p=address.split('.').map(Number);return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&(p[1]===18||p[1]===19));}
  if(net.isIP(address)===6)return /^2[0-9a-f]{3}:/i.test(address);return false;
}
function publicLookup(host,options,done){dns.lookup(host,{all:true},function(err,list){if(err)return done(err);var address=list.filter(function(a){return publicAddress(a.address);})[0];if(!address||list.some(function(a){return !publicAddress(a.address);}))return done(new Error('Недопустимый адрес видеосервера'));if(options&&options.all)done(null,[address]);else done(null,address.address,address.family);});}
function qualities(link,explicit){var match=String(link).match(/\[([\d,]+)\]/);var raw=match?match[1].split(','):Array.isArray(explicit)?explicit:[];return raw.map(Number).filter(function(q,i,a){return q>=144&&q<=4320&&a.indexOf(q)===i;}).sort(function(a,b){return b-a;});}
function normalizePost(post,cap){
  if(!post||!post.id||!post.player_links)throw new Error('Filmix не вернул список видео');
  var out={id:number(post.id,'ID Filmix'),title:String(post.title||'Filmix').slice(0,500),files:[],voices:[],seasons:[],isSeries:Object.keys(post.player_links.playlist||{}).length>0,maxQuality:cap},links=post.player_links;
  function add(entry,voice,season,episode){
    if(!entry||typeof entry.link!=='string')return;mediaURL(entry.link);
    var q=qualities(entry.link,entry.qualities).filter(function(n){return n<=cap;});
    if(!q.length&&!/\[|%s/.test(entry.link)){var fixed=entry.link.match(/_(\d{3,4})\.mp4/);if(fixed&&Number(fixed[1])<=cap)q=[Number(fixed[1])];}
    if(!q.length)return;
    voice=String(voice||'Оригинал').slice(0,200);if(season<0||season>1000||episode<1||episode>9999)return;
    var id=season*10000+episode;if(out.files.some(function(f){return f.id===id&&f.voice===voice;}))return;
    out.files.push({id:id,season:season,episode:episode,voice:voice,qualities:q,path:out.isSeries?'Сезон '+season+'/Серия '+episode:out.title,link:entry.link});
    if(out.voices.indexOf(voice)<0)out.voices.push(voice);if(out.seasons.indexOf(season)<0)out.seasons.push(season);
  }
  if(Array.isArray(links.movie))links.movie.forEach(function(e){add(e,e.translation,0,1);});
  var playlist=links.playlist||{};
  Object.keys(playlist).forEach(function(s){var voices=playlist[s];if(!voices||typeof voices!=='object')return;Object.keys(voices).forEach(function(voice){var episodes=voices[voice];if(!episodes||typeof episodes!=='object')return;Object.keys(episodes).forEach(function(key,index){var e=episodes[key],match=e&&String(e.link).match(/s(\d+)e(\d+)(?:_|\.)/i),season=match?Number(match[1]):parseInt(s,10),episode=match?Number(match[2]):Array.isArray(episodes)?index+1:parseInt(key,10);if(isFinite(season)&&isFinite(episode))add(e,voice,season,episode);});});});
  out.files.sort(function(a,b){return a.id-b.id;});out.seasons.sort(function(a,b){return a-b;});
  if(!out.files.length)throw new Error('Filmix: нет доступных видео для этого аккаунта. Проверьте доступ и подписку в настройках.');return out;
}
function createMobile(options){
  var grants={},pending=null,profileCache=null,lookup=options.lookup||publicLookup,latestCache={},latestPending={},detailsCache={};
  function config(){return options.getConfig();}
  function credentials(){var c=config();if(!c.filmixDeviceId){options.saveConfig({filmixDeviceId:crypto.randomBytes(8).toString('hex')});c=config();}return c;}
  function api(endpoint,extra,tokenOverride){
    var c=credentials(),q=Object.assign({user_dev_id:c.filmixDeviceId,user_dev_name:'VolKino',user_dev_vendor:'LG',user_dev_os:'webOS',user_dev_apk:'2.2.13'},extra||{}),secret=tokenOverride===undefined?c.filmixToken:tokenOverride;
    if(secret)q.user_dev_token=secret;
    var address=(c.filmixApiUrl||DEFAULT_API)+'/'+endpoint+'?'+Object.keys(q).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(q[k]);}).join('&');
    return new Promise(function(resolve,reject){
      var req=(/^https:/.test(address)?https:http).get(Object.assign({},URL.parse(address),{headers:{Accept:'application/json','User-Agent':'VolKino/0.6'}}),function(res){
        var chunks=[],size=0;if(res.statusCode!==200){res.resume();return reject(new Error('Filmix: HTTP '+res.statusCode));}
        res.on('data',function(chunk){size+=chunk.length;if(size>8*1024*1024){req.destroy();reject(new Error('Слишком большой ответ Filmix'));}else chunks.push(chunk);});res.on('error',function(){reject(new Error('Ответ Filmix прерван'));});res.on('aborted',function(){reject(new Error('Ответ Filmix прерван'));});
        res.on('end',function(){try{var data=JSON.parse(Buffer.concat(chunks).toString());if(data&&(!Array.isArray(data))&&(data.error||data.status==='error'||data.error_message||data.user_message))throw new Error('Filmix отказал в доступе. Проверьте аккаунт и адрес API.');resolve(data);}catch(e){reject(new Error(e.message.indexOf('Filmix')>=0?e.message:'Filmix вернул некорректный JSON'));}});
      });req.setTimeout(15000,function(){req.destroy();reject(new Error('Filmix не ответил вовремя'));});req.on('error',function(){reject(new Error('Не удалось подключиться к Filmix. Проверьте адрес API и сеть.'));});
    });
  }
  function profile(refresh,secret){
    var c=config(),token=secret===undefined?c.filmixToken:secret,key=(c.filmixApiUrl||DEFAULT_API)+'|'+(token||'');
    if(!token){var guest={authenticated:false,maxQuality:480,plan:'Гость'};return refresh?api('search',{story:'Big Buck Bunny'}).then(function(r){if(!Array.isArray(r))throw new Error('Неизвестный формат поиска Filmix');return guest;}):Promise.resolve(guest);}
    if(!refresh&&profileCache&&profileCache.key===key&&profileCache.expires>Date.now())return Promise.resolve(profileCache.value);
    return api('user_profile',null,token).then(function(r){var p=r.user_data||r,valid=p&&(p.login||Number(p.user_id||p.id)>0);if(!valid)throw new Error('Filmix: устройство ещё не подключено или токен недействителен');function yes(v){return v===true||v===1||v==='1'||v==='true';}var plus=yes(p.is_pro_plus),pro=yes(p.is_pro),value={authenticated:true,login:String(p.login||''),maxQuality:plus?2160:pro?1080:720,plan:plus?'PRO+':pro?'PRO':'Аккаунт'};if(secret===undefined)profileCache={key:key,value:value,expires:Date.now()+60000};return value;});
  }
  function post(id){id=number(id,'ID Filmix');return profile().then(function(p){return api('post/'+id).then(function(r){return normalizePost(r,p.maxQuality);});});}
  function search(query){query=String(query||'').trim();if(query.length<2||query.length>160)return Promise.reject(new Error('Введите от 2 до 160 символов'));return api('search',{story:query}).then(function(r){if(!Array.isArray(r))throw new Error('Неизвестный формат поиска Filmix');return {results:r.slice(0,100).filter(function(e){return e&&/^\d+$/.test(String(e.id));}).map(function(e){return {id:Number(e.id),title:String(e.title||e.original_title||'Filmix').slice(0,500),originalTitle:String(e.original_title||'').slice(0,500),year:Number(e.year)||0};})};});}
  function publicPost(id){return post(id).then(function(r){return Object.assign({},r,{files:r.files.map(function(f){var out=Object.assign({},f);delete out.link;return out;})});});}
  function metadata(value){
    var id=number(value,'ID Filmix'),c=config(),key=(c.filmixApiUrl||DEFAULT_API)+'|'+(c.filmixToken||'')+'|'+id;
    if(detailsCache[key]&&detailsCache[key].expires>Date.now())return detailsCache[key].promise;
    function text(value){return String(value||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').trim().slice(0,12000);}
    function list(value){return Array.isArray(value)?value.slice(0,20).map(text):[];}
    function rating(value){var n=Number(value);return n>0&&n<=10?n.toFixed(1):'';}
    var promise=api('post/'+id).then(function(r){
      if(!r||Number(r.id)!==id)throw new Error('Filmix не вернул описание');
      return {poster:String(r.poster||''),info:{id:id,title:text(r.title),originalTitle:text(r.original_title),
        poster:r.poster?'/filmix-poster?id='+id:'',description:text(r.short_story),year:String(r.year||''),duration:Number(r.duration)||0,
        genres:list(r.categories),countries:list(r.countries),actors:list(r.actors),directors:list(r.directors),imdbRating:rating(r.imdb_rating),kpRating:rating(r.kp_rating)}};
    }).catch(function(error){delete detailsCache[key];throw error;});
    detailsCache[key]={promise:promise,expires:Date.now()+300000};
    Object.keys(detailsCache).slice(0,-64).forEach(function(k){delete detailsCache[k];});
    return promise;
  }
  function details(id){return metadata(id).then(function(entry){return entry.info;});}
  function poster(req,res,id){
    function fail(){if(!res.headersSent){res.writeHead(502);res.end();}}
    metadata(id).then(function(entry){
      function load(address,redirects){
      var u=mediaURL(address);
      if(net.isIP(u.hostname)&&!publicAddress(u.hostname))throw new Error('Недопустимый адрес постера');
      var remote=(u.protocol==='https:'?https:http).get(Object.assign({},u,{lookup:lookup}),function(up){
        var type=String(up.headers['content-type']||'').split(';')[0],chunks=[],size=0;
        if([301,302,303,307,308].indexOf(up.statusCode)>=0&&up.headers.location&&redirects>0){
          up.resume();try{load(URL.resolve(address,up.headers.location),redirects-1);}catch(_){fail();}return;
        }
        if(up.statusCode!==200||!/^image\/(jpeg|png|webp)$/.test(type)){up.resume();return fail();}
        up.on('data',function(chunk){size+=chunk.length;if(size>2*1024*1024){remote.destroy();fail();}else chunks.push(chunk);});
        up.on('error',fail);up.on('aborted',fail);
        up.on('end',function(){if(res.finished||size>2*1024*1024)return;var data=Buffer.concat(chunks);res.writeHead(200,{'Content-Type':type,'Content-Length':data.length,'Cache-Control':'public, max-age=10800','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);});
      });
      remote.setTimeout(8000,function(){remote.destroy();fail();});remote.on('error',fail);
      res.on('close',function(){remote.destroy();});
      }
      load(entry.poster,3);
    }).catch(fail);
  }
  function latest(value,refresh){
    var page=recent.pageNumber(value),c=config(),key=(c.filmixApiUrl||DEFAULT_API)+'|'+(c.filmixToken||'')+'|'+page,old=latestCache[key];
    if(!refresh&&old&&Date.now()-old.updatedAt<300000)return Promise.resolve(Object.assign({},old,{cached:true}));
    if(latestPending[key])return latestPending[key];
    latestPending[key]=api('catalog',{orderby:'date',orderdir:'desc',page:page}).then(function(data){
      var result=recent.filmixPage(data,page);latestCache[key]=result;
      Object.keys(latestCache).slice(0,-8).forEach(function(k){delete latestCache[k];});return result;
    },function(error){if(old)return Object.assign({},old,{cached:true,stale:true});throw error;}).then(function(result){delete latestPending[key];return result;},function(error){delete latestPending[key];throw error;});
    return latestPending[key];
  }
  function resolve(spec){return post(spec.id).then(function(p){var file=p.files.filter(function(f){return f.id===Number(spec.fileId)&&f.voice===spec.voice;})[0];if(!file)throw new Error('Filmix: серия или озвучка недоступна');var quality=Number(spec.quality)||file.qualities[0];if(file.qualities.indexOf(quality)<0)throw new Error('Filmix: выбранное качество недоступно для этого аккаунта');var url=file.link.replace(/\[[\d,]+\]/,String(quality)).replace('%s',String(quality));mediaURL(url);return url;});}
  function grant(spec){return resolve(spec).then(function(url){var keys=Object.keys(grants);keys.forEach(function(k){if(grants[k].expires<Date.now())delete grants[k];});keys=Object.keys(grants);if(keys.length>=64)delete grants[keys[0]];var key=crypto.randomBytes(24).toString('hex');grants[key]={url:url,spec:spec,updated:Date.now(),expires:Date.now()+4*60*60*1000,identity:(config().filmixApiUrl||DEFAULT_API)+'|'+(config().filmixToken||'')};return {url:'/filmix-stream/'+key};});}
  function stream(req,res,key){
    var g=grants[key],identity=(config().filmixApiUrl||DEFAULT_API)+'|'+(config().filmixToken||'');if(!g||g.expires<Date.now()||g.identity!==identity){res.writeHead(410);res.end();return;}
    var remote=null,closed=false;res.on('close',function(){closed=true;if(remote)remote.destroy();});
    function fail(){if(closed)return;if(!res.headersSent){res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('Поток Filmix недоступен. Откройте видео повторно.');}else res.destroy();}
    function proxy(address,redirects){
      if(closed)return;var u;try{u=mediaURL(address);if(net.isIP(u.hostname)&&!publicAddress(u.hostname)&&!options.lookup)throw new Error('Недопустимый адрес');}catch(_){fail();return;}
      var headers={'User-Agent':'VolKino/0.6','Accept-Encoding':'identity'};if(req.headers.range)headers.Range=req.headers.range;
      remote=(u.protocol==='https:'?https:http).request(Object.assign({},u,{method:req.method,headers:headers,lookup:lookup}),function(up){
        if(up.statusCode>=300&&up.statusCode<400&&up.headers.location){up.resume();if(redirects>=4)return fail();return proxy(URL.resolve(address,up.headers.location),redirects+1);}
        var out={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};['content-type','content-length','content-range','accept-ranges'].forEach(function(h){if(up.headers[h])out[h]=up.headers[h];});
        res.writeHead(up.statusCode,out);up.on('error',fail);up.on('aborted',fail);if(req.method==='HEAD'){up.resume();res.end();}else up.pipe(res);
      });remote.setTimeout(45000,function(){remote.destroy();fail();});remote.on('error',fail);remote.end();
    }
    (Date.now()-g.updated>120000?resolve(g.spec).then(function(url){g.url=url;g.updated=Date.now();}):Promise.resolve()).then(function(){proxy(g.url,0);},fail);
  }
  function authStart(){return api('token_request',null,'').then(function(r){var code=String(r.user_code||''),secret=r.user_dev_token||r.code;if(!code||typeof secret!=='string'||!secret)throw new Error('Filmix не выдал код устройства');pending={code:code,token:secret,expires:Date.now()+15*60*1000,base:config().filmixApiUrl||DEFAULT_API};return {code:code,activationUrl:(config().filmixSiteUrl||DEFAULT_SITE)+'/consoles'};});}
  function authCheck(){if(!pending||pending.expires<Date.now()||pending.base!==(config().filmixApiUrl||DEFAULT_API))return Promise.reject(new Error('Сначала получите новый код устройства'));return profile(true,pending.token).then(function(p){options.saveConfig({filmixToken:pending.token});pending=null;profileCache=null;return p;});}
  function disconnect(){options.saveConfig({filmixToken:''});pending=null;profileCache=null;grants={};return {ok:true};}
  return {catalog:function(query){return api('catalog',query);},latest:latest,details:details,poster:poster,search:search,post:publicPost,grant:grant,stream:stream,profile:profile,authStart:authStart,authCheck:authCheck,disconnect:disconnect};
}
function create(options){
  var mobile,web,facade={};
  // The public mobile catalogue is also usable with Filmix TV playback accounts.
  facade.catalog=function(query){return (mobile||(mobile=createMobile(options))).catalog(query);};
  ['latest','details','poster','search','post','grant','stream','profile','authStart','authCheck','disconnect','login'].forEach(function(method){
    facade[method]=function(){
      var adapter;
      if(options.getConfig().filmixTransport==='web')adapter=web||(web=require('./filmix-web').create(Object.assign({},options,{publicLookup:publicLookup,publicAddress:publicAddress})));
      else adapter=mobile||(mobile=createMobile(options));
      if(!adapter[method])throw new Error('Сначала выберите Filmix TV в настройках');
      return adapter[method].apply(adapter,arguments);
    };
  });return facade;
}
module.exports={create:create,normalizePost:normalizePost,publicAddress:publicAddress,publicLookup:publicLookup,defaultApi:DEFAULT_API,defaultSite:DEFAULT_SITE};
