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
