'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const search=require('../server/title-search');
const movie={title:'Сердце зверя',originalTitle:'Heart of the Beast',year:2026,type:'movie'};
test('card search tries original title first, merges aliases, rejects unrelated works and wrong years',async()=>{
 const calls=[];
 const result=await search.find(movie,async q=>{calls.push(q);return {results:[
  {id:1,title:'Сердце зверя',originalTitle:'Heart of the Beast',year:2026},
  {id:2,title:'Сердце зверя',originalTitle:'Coeur animal',year:2009},
  {id:3,title:'Некрасивая подружка. Сердце зверя',year:2022},
  {id:4,title:'Случайный фильм',year:2026}
 ]};},false);
 assert.deepEqual(calls,['Heart of the Beast','Сердце зверя']);assert.deepEqual(result.results.map(x=>x.id),[1]);
});
test('torrent matching discards same-name films, series and incidental mentions',async()=>{
 const titles=['Сердце зверя / Heart of the Beast (2026) WEB-DL 1080p',
  'Сердце зверя / Coeur animal (2009) DVDRip',
  'Некрасивая подружка. Сердце зверя [S08] (2022) WEBRip',
  'Документальный фильм про Сердце зверя (2026)',
  'Heart.of.the.Beast.2026.1080p.mkv'];
 const result=await search.find(movie,async()=>({results:titles.map((title,i)=>({title,magnet:'magnet:'+i}))}),true);
 assert.deepEqual(result.results.map(r=>r.magnet),['magnet:0','magnet:4']);
});
test('series packs can contain later seasons; film and series identities remain distinct',()=>{
 const c={title:'Тьма',originalTitle:'Dark',type:'tv',year:2017};
 assert.ok(search.score({title:'Тьма / Dark / Сезон 3 (2020) WEB-DL'},c,true));
 assert.equal(search.score({title:'Dark',year:2017,type:'movie'},c,false),0);
 assert.equal(search.score({title:'Тьма',year:2009},c,false),0);
});
test('normalization preserves sequel numbers and tolerates punctuation, case and ё',()=>{
 assert.ok(search.score({title:'Ёлки 2',year:2011},{title:'Елки 2',year:2011,type:'movie'},false));
 assert.equal(search.score({title:'Ёлки',year:2011},{title:'Елки 2',year:2011,type:'movie'},false),0);
});
test('one source query failing does not discard good matches; total failure is reported',async()=>{
 const result=await search.find(movie,async q=>{if(q===movie.originalTitle)throw Error('offline');return {results:[{id:1,title:movie.title,year:2026}]};},false);
 assert.equal(result.results.length,1);
 await assert.rejects(search.find(movie,async()=>{throw Error('offline');},false),/offline/);
});

test('short titles do not match longer unrelated titles from the same year',()=>{
 const c={title:'Оно',originalTitle:'It',year:2017,type:'movie'};
 assert.equal(search.score({title:'Оно приходит ночью / It Comes at Night (2017)'},c,true),0);
 assert.ok(search.score({title:'Оно / It (2017) BDRip 1080p'},c,true));
});
