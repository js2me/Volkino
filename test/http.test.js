'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const events = require('node:events');
const hash = '0123456789abcdef0123456789abcdef01234567';
test('search, add, files, byte-range stream, secrets and API session work through a real mock upstream', async () => {
  let settings={EnableRutorSearch:true,CacheSize:123456};let seenRange='',seenAuth='';
  const upstream=http.createServer((req,res)=>{
    seenAuth=req.headers.authorization;let data='';req.on('data',c=>data+=c);req.on('end',()=>{
      res.setHeader('Content-Type','application/json');const input=data?JSON.parse(data):null;
      if(req.url==='/echo')return res.end('MatriX.test');
      if(req.url==='/settings'){if(input.action==='set'){settings=input.sets;return res.end();}return res.end(JSON.stringify(settings));}
      if(req.url.startsWith('/search/'))return res.end(JSON.stringify([{Title:'Test Movie',Magnet:'magnet:?xt=urn:btih:'+hash,Seed:5}]));
      if(req.url==='/torrents')return res.end(JSON.stringify({hash,title:'Test Movie',file_stats:[{id:2,path:'Test.mp4',length:100}]}));
      if(req.url.includes('&preload&stat'))return res.end(JSON.stringify({stat:3}));
      if(req.url.includes('&play')){seenRange=req.headers.range;res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':'bytes 10-13/100','Content-Length':'4','Accept-Ranges':'bytes'});return res.end('DATA');}
      res.writeHead(404);res.end();
    });
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const portServer=http.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-test-'));const cfg=path.join(dir,'config.json');
  fs.writeFileSync(cfg,JSON.stringify({torrserverUrl:'http://127.0.0.1:'+upstream.address().port,searchProvider:'torrserver',torrserverUsername:'test',torrserverPassword:'private-password'}));
  const child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),TW_CONFIG:cfg},stdio:['ignore','pipe','pipe']});
  try{
    await Promise.race([events.once(child.stdout,'data'),new Promise((_,rej)=>{const t=setTimeout(()=>rej(new Error('startup timeout')),5000);t.unref();})]);
    const base='http://127.0.0.1:'+port;
    assert.equal((await fetch(base+'/api/config')).status,403);
    const token=(await (await fetch(base+'/api/session')).json()).token;
    async function api(route,data){const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'X-App-Token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;}
    const conf=await api('config');assert.equal(conf.hasPassword,true);assert.equal(conf.torrserverPassword,undefined);
    assert.equal((await api('health')).version,'MatriX.test');
    assert.equal((await api('search?q=Test')).results[0].seeders,5);
    assert.equal((await api('add',{link:'magnet:?xt=urn:btih:'+hash})).hash,hash);
    assert.equal((await api('status?hash='+hash)).files[0].id,2);
    assert.equal((await api('preload',{hash,index:2})).stat,3);
    const stream=await fetch(base+'/stream?hash='+hash+'&index=2',{headers:{Range:'bytes=10-13'}});assert.equal(stream.status,206);assert.equal(stream.headers.get('content-range'),'bytes 10-13/100');assert.equal(await stream.text(),'DATA');assert.equal(seenRange,'bytes=10-13');assert.equal(seenAuth,'Basic '+Buffer.from('test:private-password').toString('base64'));
    settings.EnableRutorSearch=false;await api('enable-search',{});assert.equal(settings.EnableRutorSearch,true);assert.equal(settings.CacheSize,123456);
    await api('config',{torrserverUsername:'another'});const saved=JSON.parse(fs.readFileSync(cfg));assert.equal(saved.torrserverPassword,'private-password');assert.equal(fs.statSync(cfg).mode&0o777,0o600);
    assert.equal((await fetch(base+'/server/index.js')).status,404);
    const rebound=await new Promise((resolve,reject)=>{http.get(base+'/api/session',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(rebound,403);
  }finally{child.kill();await events.once(child,'exit');upstream.closeAllConnections();await new Promise(r=>upstream.close(r));fs.rmSync(dir,{recursive:true});}
});
