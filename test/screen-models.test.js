'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./helpers/models');

test('Filmix screen owns errors and retries; leaving ignores a pending response',t=>{
 const h=boot(t);h.globals.filmixSearch('Test');const first=h.screen;
 assert.equal(first.globals,h.globals);assert.equal(first.loading,true);
 h.reply('filmix/search',null,new Error('Offline'));assert.equal(first.error,'Offline');assert.equal(first.loading,false);
 first.load();h.reply('filmix/search',{results:[{id:42,title:'Test'}]});assert.equal(first.error,'');assert.equal(first.results.length,1);
 first.load();h.globals.change('search');h.reply('filmix/search',{results:[{id:99,title:'Late'}]});assert.equal(first.results.length,0);assert.equal(h.globals.filmixResults[0].id,42);
});
test('returning from Filmix files restores cached search without another request',t=>{
 const h=boot(t);h.globals.filmixSearch('Test');h.reply('filmix/search',{results:[{id:42,title:'Test'}]});h.screen.open(h.screen.results[0]);h.globals.returnToResults();assert.equal(h.globals.view,'filmix-search');assert.equal(h.screen.results[0].id,42);assert.equal(h.requests.filter(r=>r.route.startsWith('filmix/search')).length,1);
});
test('Files screen ignores stale retry results and responses after unmount',t=>{
 const h=boot(t);h.globals.openTorrentLink('magnet:first','First');const first=h.screen;first.load();
 h.reply('add',{hash:'old'});assert.equal(h.globals.hash,'');h.reply('add',{hash:'new'});assert.equal(h.globals.hash,'new');
 h.globals.change('search');h.reply('status?',{torrent:{title:'Late'},files:[{id:1,path:'Late',length:1}]});assert.equal(h.globals.files.length,0);
});
test('Files screen clears its metadata poll timer on unmount',t=>{
 const h=boot(t);h.globals.openTorrentLink('magnet:first','First');h.reply('add',{hash:'test'});h.reply('status?',{torrent:{title:'First'},files:[]});
 const count=h.requests.length;h.globals.change('search');h.advance(3000);assert.equal(h.requests.length,count);
});
test('magnet input and submission belong to its VM and share the same Globals',t=>{
 const h=boot(t);h.globals.change('magnet');const model=h.screen;assert.equal(model.globals,h.globals);model.setLink('  magnet:test  ');model.submit();assert.equal(h.globals.view,'files');assert.deepEqual(h.requests[0].body,{link:'magnet:test',title:'Торрент по ссылке'});
});
