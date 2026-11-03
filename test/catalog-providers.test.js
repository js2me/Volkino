'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const providers=require('../server/catalog-providers');
const now=()=>Date.UTC(2026,9,25);
test('CUB cards preserve safe metadata and movie and series identities',()=>{
 const movie=providers.card('cub',{id:1,title:'<b>Фильм</b>',original_title:'Film',release_date:'2026-04-01',vote_average:8.45,poster_path:'/abc.jpg',overview:'<script>bad()</script>Описание'},'movie');
 assert.equal(movie.id,'tmdb:movie:1');assert.equal(movie.title,'Фильм');assert.equal(movie.description,'Описание');assert.equal(movie.searchTitle,'Фильм');assert.equal(movie.provider,'cub');assert.match(movie.poster,/^\/catalog-poster\?url=/);
 assert.equal(providers.card('cub',{id:1,name:'Сериал'},null).id,'tmdb:tv:1');
 assert.equal(providers.card('cub',{id:'not-id',title:'Bad'},null),null);
});
test('posters accept only constrained HTTPS source paths',()=>{
 assert.ok(providers.image('https://image.tmdb.org/t/p/w200/abc.jpg','cub'));
 assert.ok(providers.image('https://images.metahub.space/poster/small/tt123/img','cinemeta'));
 assert.ok(providers.image('https://yts.gg/assets/images/movies/film_2026/medium-cover.jpg','yts'));
 for(const u of ['http://image.tmdb.org/t/p/w200/abc.jpg','https://image.tmdb.org@evil.test/t/p/w200/a.jpg','https://image.tmdb.org/t/p/w200/../evil.jpg','https://image.tmdb.org/t/p/w200/a.jpg?redirect=localhost'])assert.equal(providers.image(u,'cub'),'');
});
test('Cinemeta supports IMDb fallback and filters years',()=>{
 const mk=(id,year)=>({id:'tt'+id,name:'Title '+id,type:'movie',year,poster:'https://images.metahub.space/poster/small/tt'+id+'/img'});
 const c=providers.cards('cinemeta',{metas:[mk(10,'2026'),mk(11,'2025'),mk(10,'2026')]},'movie',2026);
 assert.deepEqual(c.map(x=>x.id),['imdb:tt10']);assert.equal(c[0].type,'movie');assert.equal(c[0].provider,'cinemeta');
 assert.equal(providers.card('cinemeta',Object.assign(mk(10,'2026'),{moviedb_id:100}),null).id,'tmdb:movie:100');
});
test('home builds mixed Cinemeta popularity and returns a partial response when one feed fails',async()=>{
 const urls=[];const api=providers.create({now,fetchJSON:async url=>{urls.push(url);if(url.includes('series/year'))throw Error('offline');let series=url.includes('/series/');return {metas:[{id:series?'tt111':'tt222',name:series?'Series':'Movie',year:'2026'}]};}});
 const r=await api.home('cinemeta');assert.equal(r.source,'Cinemeta');assert.equal(r.partial,true);assert.deepEqual(r.sections[0].items.map(x=>x.type),['movie','tv']);assert.equal(r.sections[1].id,'movies');assert.equal(urls.length,4);
});
test('YTS returns film-only collections with truthful popularity label and current year filter',async()=>{
 const api=providers.create({now,fetchJSON:async url=>({data:{movies:[{imdb_code:'tt1',title:'Old',year:2020},{imdb_code:'tt2',title:'New',year:2026,medium_cover_image:'https://yts.gg/assets/images/movies/new/medium-cover.jpg'}]}})});
 const r=await api.home('yts');assert.match(r.sections[0].title,/загрузкам/);assert.deepEqual(r.sections[1].items.map(x=>x.title),['New']);assert.equal(r.sections[1].items[0].id,'imdb:tt2');assert.equal(r.sections.length,2);
});
test('all upstream failures report an error, and CUB year filters do not leak older movies',async()=>{
 await assert.rejects(providers.create({now,fetchJSON:async()=>{throw Error('offline');}}).home('cub'),/недоступен/);
 const api=providers.create({now,fetchJSON:async()=>({results:[{id:1,title:'Фильм',release_date:'2025-01-01'},{id:2,title:'Новый',release_date:'2026-01-01'}]})});
 const r=await api.home('cub');assert.deepEqual(r.sections[1].items.map(x=>x.title),['Новый']);
});
