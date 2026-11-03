'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const catalog=require('../server/catalog');
function card(id=1,title='Movie'){return{title,playlist_url:'http://fxmlparsers.in.net/VilkaDB/?id=tmdb&tid='+id+'&media_type=movie',logo_30x30:'http://fxmlparsers.in.net/VilkaDB/?wimg=http%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw200%2FPoster.jpg',description:'<span class="descitem drating">8.5</span><span class="year">2026</span>'};}
test('catalog accepts only movie/TV identities and strips remote presentation code',()=>{const r=catalog.cards({channels:[card(),card(),{title:'Action',playlist_url:'cmd:exec()'},card(2,'<script>evil()</script>Title\\u0020Two')]});assert.equal(r.length,2);assert.equal(r[1].title,'Title Two');assert.equal(r[0].rating,'8.5');assert.equal(r[0].year,'2026');assert.match(r[0].poster,/^\/poster\?path=/);assert.equal(catalog.itemKey('http://evil.test/VilkaDB/?id=tmdb&tid=1&media_type=movie'),null);assert.throws(()=>catalog.endpoint('http://localhost/private'));});
test('the portal Continue watching section never becomes the user local history',()=>{const a=card(1),b=card(2);a.before='<div class="chapterall">Тренды недели</div>';b.before='<div class="chapterall">Продолжить смотреть</div>';assert.deepEqual(catalog.popular({channels:[a,b]}).map(x=>x.id),['tmdb:movie:1']);});
test('poster proxy paths cannot target arbitrary hosts or paths',()=>{assert.equal(catalog.posterPath('http://image.tmdb.org/t/p/w500/abc.jpg'),'/t/p/w200/abc.jpg');for(const p of ['http://localhost:8090/echo','http://evil.test/t/p/w200/abc.jpg','http://image.tmdb.org/t/p/w200/../../etc/passwd'])assert.equal(catalog.posterPath(p),'');});
test('details return plain synopsis and a search title, without executing a source action',()=>{const p={title:'Большой Бак',channels:[{after:'<b>Большой Бак</b> TMDB 6.5 · 2008'},{after:'<div>Описание</div><p>Добрый кролик.</p>'},{playlist_url:'http://fxmlparsers.in.net/VilkaDB/?id=tmdb&torr=Big+Buck+Bunny&media_type=movie'}]};const d=catalog.details(p,'tmdb:movie:10378');assert.equal(d.description,'Добрый кролик.');assert.equal(d.searchTitle,'Big Buck Bunny');assert.equal(d.year,'2008');});
test('home fetches coalesce, cache survives restart, expired data remains available during outage',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-catalog-'));const file=path.join(dir,'cache.json');let clock=Date.UTC(2026,9,25),calls=0,offline=false;
 const fetchPage=async url=>{calls++;if(offline)throw Error('offline');const c=card();c.before='<div class="chapterall">Тренды недели</div>';return{channels:[c]};};
 try{const api=catalog.create({fetchPage,cacheFile:file,now:()=>clock});const [a,b]=await Promise.all([api.home(),api.home()]);assert.equal(calls,3);assert.equal(a.sections.length,3);assert.deepEqual(a,b);await api.home();assert.equal(calls,3);
 offline=true;const reloaded=catalog.create({fetchPage,cacheFile:file,now:()=>clock});assert.equal((await reloaded.home()).cached,true);assert.equal(calls,3);clock+=4*3600000;const stale=await reloaded.home();assert.equal(stale.stale,true);assert.equal(stale.sections.length,3);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('missing sources yield partial home, total outage without cache reports an error',async()=>{const api=catalog.create({fetchPage:async u=>{if(u==='/VilkaDB/')return{channels:[Object.assign(card(),{before:'<div class="chapterall">Тренды недели</div>'})]};throw Error('no');}});assert.equal((await api.home()).partial,true);await assert.rejects(catalog.create({fetchPage:async()=>{throw Error('offline');}}).home(),/недоступен/);});

test('browse validates type-specific genres, rating and page before constructing a source URL',()=>{
 const f=catalog.browseFilters({type:'movie',genre:'28',minRating:'7',page:'2'});assert.equal(catalog.browseEndpoint(f),'/VilkaDB/?type=movie&with_genres=28&rating=7&year=&p=2');
 assert.equal(catalog.browseFilters({type:'tv',genre:'10765'}).genre,'10765');
 for(const q of [{type:'all'},{type:'tv',genre:'28'},{type:'movie',genre:'10765'},{minRating:'10'},{minRating:'7&url=http://localhost'},{page:'0'},{page:'2.5'},{page:'501'}])assert.throws(()=>catalog.browseFilters(q));
});
test('browse keeps a full page beyond the home limit and enforces the minimum known rating',()=>{
 const many=Array.from({length:36},(_,i)=>card(i+1));many[0].description='<span class="drating">6.5</span>';many[1].description='Unknown rating';
 assert.equal(catalog.cards({channels:many}).length,18);
 const d=catalog.browsePage({channels:many,_catalog_has_more:'1'},catalog.browseFilters({minRating:8}));assert.equal(d.items.length,34);assert.ok(d.items.every(c=>Number(c.rating)>=8));assert.equal(d.hasMore,true);assert.equal(d.genres.movie.find(g=>g.id==='28').name,'Боевик');
});
test('browse pagination respects a next-page link, last page and separate series identity',()=>{
 const tv=card(1);tv.playlist_url=tv.playlist_url.replace('media_type=movie','media_type=tv');
 const f=catalog.browseFilters({type:'tv',page:2});let d=catalog.browsePage({channels:[tv,{playlist_url:'http://fxmlparsers.in.net/VilkaDB/?type=tv&p=3'}]},f);assert.equal(d.hasMore,true);assert.equal(d.items[0].type,'tv');
 d=catalog.browsePage({channels:[tv],_catalog_has_more:'0'},f);assert.equal(d.hasMore,false);assert.throws(()=>catalog.browsePage({},f));
});
test('browse caches each filter and page separately and preserves it through an outage after restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-browse-')),file=path.join(dir,'cache.json');let now=Date.UTC(2026,9,25),calls=0,offline=false;
 const fetchPage=async()=>{calls++;if(offline)throw Error('offline');return{channels:[card()],_catalog_has_more:'1'};};
 try{const api=catalog.create({fetchPage,cacheFile:file,now:()=>now});await api.browse({genre:'28',minRating:7});await api.browse({genre:'28',minRating:7});assert.equal(calls,1);await api.browse({genre:'28',minRating:7,page:2});assert.equal(calls,2);
 offline=true;now+=2*3600000;const fresh=catalog.create({fetchPage,cacheFile:file,now:()=>now});const stale=await fresh.browse({genre:'28',minRating:7});assert.equal(stale.stale,true);assert.equal(stale.filters.page,1);assert.equal(stale.filters.genre,'28');assert.equal(stale.items.length,1);
 }finally{fs.rmSync(dir,{recursive:true});}
});


test('browse validates year and sorting and forwards year to the source',()=>{
 const f=catalog.browseFilters({year:'2024',sort:'rating',page:2});
 assert.match(catalog.browseEndpoint(f),/year=2024&p=2$/);
 for(const q of [{year:'1899'},{year:'2024-2026'},{year:'2024&x=1'},{year:String(new Date().getFullYear()+1)},{sort:'rating&x=1'}])assert.throws(()=>catalog.browseFilters(q));
});
test('browse filters exact year and sorts the entire returned page stably, with missing values last',()=>{
 const make=(id,year,rating)=>Object.assign(card(id),{description:'<span class="year">'+year+'</span><span class="drating">'+rating+'</span>'});
 const page={channels:[make(1,2024,7),make(2,2026,8),make(3,2024,9),make(4,2024,9),make(5,'','')],_catalog_has_more:'1'};
 assert.deepEqual(catalog.browsePage(page,catalog.browseFilters({year:2024,sort:'rating'})).items.map(c=>c.id),['tmdb:movie:3','tmdb:movie:4','tmdb:movie:1']);
 assert.deepEqual(catalog.browsePage(page,catalog.browseFilters({sort:'newest'})).items.map(c=>c.year),['2026','2024','2024','2024','']);
 assert.equal(catalog.browsePage(page,catalog.browseFilters({year:2024})).hasMore,true);
});
test('year and sort have separate cache identities, including after a restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-year-')),file=path.join(dir,'cache.json');let calls=0;
 const fetchPage=async()=>{calls++;return{channels:[card()]};};
 try{let api=catalog.create({fetchPage,cacheFile:file});await api.browse({year:2026,sort:'rating'});await api.browse({year:2026,sort:'newest'});await api.browse({year:2025,sort:'rating'});assert.equal(calls,3);
 api=catalog.create({fetchPage,cacheFile:file});const d=await api.browse({year:2026,sort:'rating'});assert.equal(calls,3);assert.equal(d.filters.year,'2026');assert.equal(d.filters.sort,'rating');
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('home caches external sources separately and restores stale results for the selected source',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-providers-')),file=path.join(dir,'cache.json');let clock=Date.UTC(2026,9,25),calls=0;
 try{const api=catalog.create({fetchPage:async()=>({channels:[]}),cacheFile:file,now:()=>clock});
  const load=name=>async()=>{calls++;return {source:name,sections:[{id:'popular',items:[]}],updatedAt:clock};};
  assert.equal((await api.externalHome('cub',load('CUB'))).source,'CUB');assert.equal((await api.externalHome('yts',load('YTS'))).source,'YTS');
  assert.equal((await api.externalHome('cub',load('bad'))).source,'CUB');assert.equal(calls,2);
  clock+=4*3600000;const restored=catalog.create({fetchPage:async()=>({channels:[]}),cacheFile:file,now:()=>clock});
  const stale=await restored.externalHome('cub',async()=>{throw Error('offline');});assert.equal(stale.source,'CUB');assert.equal(stale.stale,true);
  assert.throws(()=>restored.externalHome('unknown',load('bad')));
 }finally{fs.rmSync(dir,{recursive:true});}
});
