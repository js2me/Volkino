'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {boot} = require('./helpers/models');
const movie={id:'tmdb:movie:1',title:'Фильм',type:'movie',poster:''};
const torrent={title:'Фильм 1080p',magnet:'magnet:?xt=urn:btih:abc',seeders:10,size:100};
test('details searches immediately; a later description preserves results',t=>{
 const h=boot(t);h.app.openItem(movie,'home');assert.equal(h.app.state.searchStatus.text,'Ищем раздачи…');
 h.reply('search?',{results:[torrent]});const rows=h.app.state.results;h.reply('catalog/item?',{...movie,description:'Описание'});
 assert.equal(h.app.state.results,rows);assert.equal(h.app.detailItem.description,'Описание');
});
test('refined titles discard earlier responses and unmounted details ignore late descriptions',t=>{
 const h=boot(t);h.app.openItem(movie,'home');h.reply('catalog/item?',{...movie,searchTitle:'Original title'});
 assert.ok(h.requests.some(r=>r.route==='search?q=Original%20title'));
 h.reply('search?',{results:[torrent]});assert.equal(h.app.state.results.length,0);
 h.reply('search?',{results:[{...torrent,title:'Correct result'}]});assert.equal(h.app.state.results[0].title,'Correct result');
 h.app.openItem(movie,'home');h.app.change('files');h.reply('catalog/item?',{...movie,description:'Late'});h.reply('search?',{results:[torrent]});assert.notEqual(h.app.detailItem.description,'Late');assert.equal(h.app.view,'files');
});
test('returning from files keeps details and results without searching again',t=>{
 const h=boot(t);h.app.openItem(movie,'catalog');h.reply('catalog/item?',{...movie,description:'Описание'});h.reply('search?',{results:[torrent]});
 h.screen.openTorrent(torrent,0);const count=h.requests.filter(r=>r.route.startsWith('search?')).length;
 h.app.returnToResults();assert.equal(h.app.view,'details');assert.equal(h.app.detailOrigin,'catalog');assert.equal(h.app.state.results[0].title,torrent.title);assert.equal(h.requests.filter(r=>r.route.startsWith('search?')).length,count);
});
test('failed automatic search retries on the same details page',t=>{
 const h=boot(t);h.app.openItem(movie,'home');h.reply('search?',null,new Error('Offline'));assert.equal(h.app.state.searchStatus.error,true);
 h.screen.runSearch();h.reply('search?',{results:[torrent]});assert.equal(h.app.view,'details');assert.equal(h.app.state.results.length,1);
});
test('local installation errors stay visible without changing selected mode',t=>{
 const h=boot(t);h.app.config={torrserverMode:'external'};const settings=h.settings();settings.set('torrserverMode','local');settings.localAction('start');h.reply('local-server/start',{});h.reply('local-server',{state:'installing',version:'test'});assert.match(settings.localStatus,/Загружаем/);
 h.advance(1000);h.reply('local-server',{state:'error',version:'test',error:'SHA-256 mismatch'});assert.match(settings.localStatus,/SHA-256 mismatch/);assert.equal(settings.draft.torrserverMode,'local');settings.unmount();
});
test('late local-server actions cannot start polling after settings unmount',t=>{
 const h=boot(t);const settings=h.settings();settings.localAction('start');settings.unmount();h.reply('local-server/start',{});assert.equal(h.requests.filter(r=>r.route==='local-server').length,0);
});
