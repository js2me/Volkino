'use strict';
// Fixed third-party endpoints only; redirects are checked again before connecting.
var https=require('https'),URL=require('url');
function allowedData(u){return u.protocol==='https:'&&!u.auth&&!u.hash&&['tmdb.cub.best','v3-cinemeta.strem.io','cinemeta-catalogs.strem.io','yts.lt','yts.gg'].indexOf(u.hostname)>=0&&(!u.port||u.port==='443');}
function allowedPoster(u){
  if(u.protocol!=='https:'||u.auth||u.hash||u.search||u.port&&u.port!=='443')return false;
  if(u.hostname==='image.tmdb.org'||u.hostname==='imagetmdb.com')return /^\/t\/p\/w200\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(u.pathname);
  if(u.hostname==='images.metahub.space')return /^\/poster\/small\/tt\d{1,12}\/img$/.test(u.pathname);
  if(u.hostname==='yts.gg'||u.hostname==='img.yts.gg')return /^\/assets\/images\/movies\/[a-zA-Z0-9_-]+\/(small|medium|large)-cover\.(jpg|png|webp)$/.test(u.pathname);
  return false;
}
function get(address,validate,maxSize,redirects){
  return new Promise(function(resolve,reject){
    var u=URL.parse(address);if(!validate(u))return reject(new Error('Недопустимый адрес источника'));
    var req=https.get(address,{headers:{Accept:'application/json, image/jpeg, image/png, image/webp','User-Agent':'VolKino/1.0'}},function(res){
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(!redirects)return reject(new Error('Слишком много перенаправлений'));return resolve(get(URL.resolve(address,res.headers.location),validate,maxSize,redirects-1));}
      if(res.statusCode!==200){res.resume();return reject(new Error('Источник ответил HTTP '+res.statusCode));}
      var parts=[],size=0,failed=false;
      res.on('data',function(chunk){size+=chunk.length;if(size>maxSize){failed=true;req.destroy();reject(new Error('Ответ источника слишком большой'));}else parts.push(chunk);});
      res.on('end',function(){if(!failed)resolve({data:Buffer.concat(parts),type:String(res.headers['content-type']||'').split(';')[0].toLowerCase()});});
      res.on('error',reject);res.on('aborted',function(){reject(new Error('Ответ источника прерван'));});
    });
    req.setTimeout(15000,function(){req.destroy(new Error('Источник не ответил вовремя'));});req.on('error',reject);
  });
}
function json(address){return get(address,allowedData,12*1024*1024,3).then(function(r){try{return JSON.parse(r.data.toString());}catch(_){throw new Error('Источник вернул некорректный JSON');}});}
function poster(req,res,address){
  return get(address,allowedPoster,1024*1024,3).catch(function(err){var u=URL.parse(address);if(allowedPoster(u)&&u.hostname==='image.tmdb.org')return get('https://imagetmdb.com'+u.pathname,allowedPoster,1024*1024,3);throw err;}).then(function(r){if(!/^image\/(jpeg|png|webp)$/.test(r.type))throw new Error('Некорректный формат постера');res.writeHead(200,{'Content-Type':r.type,'Content-Length':r.data.length,'Cache-Control':'public, max-age=10800','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:r.data);}).catch(function(){if(!res.headersSent){res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('Постер недоступен');}});
}
module.exports={json:json,poster:poster,allowedData:allowedData,allowedPoster:allowedPoster};
