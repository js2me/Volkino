'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot,files,hash}=require('./helpers/models');
test('startup waits for configuration and keeps the requested page',t=>{
 const h=boot(t);h.app.view=null;h.app.start();h.app.navigate('catalog');assert.equal(h.app.view,null);
 h.reply('session',{});h.reply('config',{catalogBrowseProvider:'filmix'});assert.equal(h.app.view,'catalog');assert.equal(h.app.config.catalogBrowseProvider,'filmix');
});
test('torrent history returns to history after a previous catalogue detail visit',t=>{
 const h=boot(t);h.app.detailOrigin='catalog';h.app.searchFromDetail=true;h.app.detailItem={id:'tmdb:movie:1',title:'Old movie',type:'movie'};h.app.navigate('history');
 h.app.resume({hash,fileId:1,title:'Episode',fileName:files[0].path,torrentTitle:'Series',link:'magnet:?xt=urn:btih:'+hash,position:123,duration:1000,updated:1});
 h.reply('add',{hash,title:'Series'});h.reply('status?',{torrent:{title:'Series'},files});h.advance(100);h.ready(0,'loadedmetadata');assert.equal(h.video.currentTime,123);assert.equal(h.app.menuView,'history');
 h.player.stop();h.app.back();assert.equal(h.app.view,'history');
});
test('Filmix history returns to history rather than Filmix search or the old catalogue',t=>{
 const h=boot(t);h.app.detailOrigin='catalog';h.app.searchFromDetail=true;h.app.navigate('history');
 h.app.resume({source:'filmix',filmixId:42,hash:'',fileId:10001,title:'Episode',fileName:'Сезон 1/Серия 1',torrentTitle:'Online series',link:'filmix:42',position:123,duration:1000,updated:1});
 h.reply('filmix/post',{title:'Online series',voices:['Dub'],seasons:[1],maxQuality:720,files:[{id:10001,path:'Сезон 1/Серия 1',voice:'Dub',season:1,qualities:[720]}]});h.advance(100);h.reply('filmix/play',{url:'/stream'});h.ready(0,'loadedmetadata');assert.equal(h.video.currentTime,123);
 h.player.stop();h.app.back();assert.equal(h.app.view,'history');
});
