'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const url=require('node:url');const http=require('../server/catalog-http');
test('catalog poster proxy only accepts fixed HTTPS image hosts and paths',()=>{
 for(const u of ['https://image.tmdb.org/t/p/w200/a.jpg','https://imagetmdb.com/t/p/w200/a.png','https://images.metahub.space/poster/small/tt123/img','https://img.yts.gg/assets/images/movies/example/medium-cover.jpg'])assert.equal(http.allowedPoster(url.parse(u)),true,u);
 for(const u of ['http://image.tmdb.org/t/p/w200/a.jpg','https://image.tmdb.org@localhost/t/p/w200/a.jpg','https://image.tmdb.org/t/p/w200/../../etc/passwd','https://image.tmdb.org/t/p/w200/a.jpg?x=1','https://img.yts.gg/other','https://127.0.0.1/'])assert.equal(http.allowedPoster(url.parse(u)),false,u);
});
test('catalog feed redirects stay on known HTTPS servers',()=>{
 assert.equal(http.allowedData(url.parse('https://cinemeta-catalogs.strem.io/year/catalog/movie/year/genre=2026.json')),true);
 assert.equal(http.allowedData(url.parse('https://yts.gg/api/v2/list_movies.json')),true);
 for(const u of ['https://evil.test/','http://tmdb.cub.best/','https://tmdb.cub.best@localhost/','https://tmdb.cub.best:8080/'])assert.equal(http.allowedData(url.parse(u)),false,u);
});
test('catalog transport uses the Node 8 HTTPS signature and follows validated redirects',async t=>{
 const https=require('node:https'),{EventEmitter}=require('node:events'),seen=[];
 t.mock.method(https,'get',function(options,callback){
  assert.equal(arguments.length,2,'webOS Node 8 requires get(options, callback)');
  assert.equal(typeof options,'object');assert.equal(typeof callback,'function');
  assert.equal(options.headers['User-Agent'],'VolKino/1.0');seen.push(options.hostname);
  const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=()=>{};
  process.nextTick(()=>{
   const response=new EventEmitter();response.resume=()=>{};
   response.statusCode=seen.length===1?307:200;
   response.headers=seen.length===1?{location:'https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json'}:{'content-type':'application/json'};
   callback(response);
   response.emit('data',Buffer.from('{"metas":[{"id":"tt123"}]}'));response.emit('end');
  });
  return request;
 });
 assert.deepEqual(await http.json('https://v3-cinemeta.strem.io/catalog/movie/top.json'),{metas:[{id:'tt123'}]});
 assert.deepEqual(seen,['v3-cinemeta.strem.io','cinemeta-catalogs.strem.io']);
});
