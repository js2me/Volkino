'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const local=require('../server/local-torrserver');
const release=require('../server/torrserver-release.json');
// Do not reuse sockets across intentional helper shutdown/restarts.
function request(url,options={}){return fetch(url,{...options,headers:{...options.headers,Connection:'close'}});}
async function freePort(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out');}
function fixture(dir){
  fs.mkdirSync(path.join(dir,'torrserver'));
  fs.writeFileSync(path.join(dir,'torrserver','TorrServer-'+release.version),'#!'+process.execPath+'\n'+`
const fs=require('fs'),http=require('http'),path=require('path');
const args=process.argv;const data=args[args.indexOf('--path')+1];
fs.writeFileSync(path.join(data,'pid'),String(process.pid));
fs.writeFileSync(path.join(data,'memory-limit'),process.env.GOMEMLIMIT||'');
fs.appendFileSync(path.join(data,'pids'),process.pid+'\\n');
http.createServer((req,res)=>{
 if(req.headers.authorization){res.writeHead(401);return res.end('credentials leaked');}
 if(req.url==='/echo'){if(fs.existsSync(path.join(data,'hang'))){fs.unlinkSync(path.join(data,'hang'));return;}return res.end('MatriX.fixture');}
 if(req.url.startsWith('/stream')){res.writeHead(206,{'Content-Range':'bytes 0-3/4','Content-Length':'4'});return res.end('DATA');}
 res.end('[]');
}).listen(Number(args[args.indexOf('--port')+1]),args[args.indexOf('--ip')+1]);
`,{mode:0o700});
}
test('local binary selection rejects unsupported platforms and architectures',()=>{
  assert.equal(local.asset('linux','arm'),'TorrServer-linux-arm7');assert.equal(local.asset('linux','arm64'),'TorrServer-linux-arm64');
  assert.throws(()=>local.asset('win32','x64'),/Linux/);assert.throws(()=>local.asset('linux','unknown'),/Архитектура/);
});
test('missing binary and occupied port cannot become a successful local start',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-local-'));const occupied=http.createServer();await new Promise(r=>occupied.listen(0,'127.0.0.1',r));
  const l=local.create({directory:dir,port:occupied.address().port});
  try{await assert.rejects(l.start(),/Установить/);fixture(dir);await assert.rejects(l.start(),/занят/);assert.equal(l.status().state,'stopped');}
  finally{await l.stop();await new Promise(r=>occupied.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('managed local server switches proxy, preserves external secrets, autostarts and dies with helper',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-local-http-'));fixture(dir);
  const port=await freePort(),tsPort=await freePort(),cfg=path.join(dir,'config.json');
  fs.writeFileSync(cfg,JSON.stringify({torrserverUrl:'http://192.0.2.1:8090',torrserverUsername:'external',torrserverPassword:'secret'}));
  let child,token;const base='http://127.0.0.1:'+port;
  async function launch(){child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),TW_CONFIG:cfg,TW_TORRSERVER_PORT:String(tsPort),TORRSERVER_URL:''},stdio:['ignore','pipe','pipe']});await once(child.stdout,'data');token=(await(await request(base+'/api/session')).json()).token;}
  async function api(route,data){const res=await request(base+'/api/'+route,{method:data?'POST':'GET',headers:{'X-App-Token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const value=await res.json();assert.equal(res.status,200,JSON.stringify(value));return value;}
  async function close(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}
  try{
    await launch();assert.equal((await request(base+'/api/local-server/start',{method:'POST'})).status,403);
    await api('local-server/start',{});await api('local-server/start',{});
    await until(async()=>{const s=await api('local-server');assert.notEqual(s.state,'error',s.error);return s.state==='running';});
    await until(async()=>(await api('config')).torrserverMode==='local');
    const conf=await api('config');assert.equal(conf.torrserverUrl,'http://192.0.2.1:8090');assert.equal(conf.torrserverPassword,undefined);
    assert.equal((await api('health')).version,'MatriX.fixture');
    const stream=await request(base+'/stream?hash=0123456789abcdef0123456789abcdef01234567&index=1',{headers:{Range:'bytes=0-3'}});assert.equal(stream.status,206);assert.equal(await stream.text(),'DATA');
    const settings=JSON.parse(fs.readFileSync(path.join(dir,'torrserver/data/settings.json'))).BitTorr;assert.equal(settings.CacheSize,32*1024*1024);assert.equal(settings.UseDisk,false);
    const dataDir=path.join(dir,'torrserver/data');
    const firstPid=Number(fs.readFileSync(path.join(dataDir,'pid')));
    const custom={localCacheSize:128,localPreloadCache:25,localConnectionsLimit:40};
    await api('config',custom);
    assert.notEqual(Number(fs.readFileSync(path.join(dataDir,'pid'))),firstPid);
    function checkSettings(){
      const actual=JSON.parse(fs.readFileSync(path.join(dataDir,'settings.json'))).BitTorr;
      assert.equal(actual.CacheSize,128*1024*1024);assert.equal(actual.PreloadCache,25);assert.equal(actual.ConnectionsLimit,40);
      assert.equal(fs.readFileSync(path.join(dataDir,'memory-limit'),'utf8'),'192MiB');
    }
    checkSettings();
    const configuredPid=Number(fs.readFileSync(path.join(dataDir,'pid')));
    await api('config',custom);assert.equal(Number(fs.readFileSync(path.join(dataDir,'pid'))),configuredPid);
    for(const invalid of [{localCacheSize:0},{localCacheSize:2049},{localCacheSize:'64'},{localCacheSize:32.5},{localPreloadCache:101},{localConnectionsLimit:-1}]){
      const response=await request(base+'/api/config',{method:'POST',headers:{'X-App-Token':token,'Content-Type':'application/json'},body:JSON.stringify(invalid)});
      assert.equal(response.status,400);assert.ok((await response.json()).error);
      assert.equal(Number(fs.readFileSync(path.join(dataDir,'pid'))),configuredPid);
    }
    assert.equal((await api('config')).localCacheSize,128);
    const pid=Number(fs.readFileSync(path.join(dir,'torrserver/data/pid')));
    await close();await until(()=>{try{process.kill(pid,0);return false;}catch(_){return true;}});
    await launch();await until(async()=>(await api('local-server')).state==='running');assert.equal((await api('health')).version,'MatriX.fixture');
    checkSettings();
    await api('local-server/stop',{});assert.equal((await api('local-server')).state,'stopped');assert.equal((await api('config')).torrserverMode,'external');
    assert.equal(JSON.parse(fs.readFileSync(cfg)).torrserverPassword,'secret');
    await api('config',{localCacheSize:64});assert.equal((await api('local-server')).state,'stopped');
    await api('config',{torrserverMode:'local'});
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,'settings.json'))).BitTorr.CacheSize,64*1024*1024);assert.equal((await api('health')).version,'MatriX.fixture');
    await api('config',{torrserverMode:'external'});assert.equal((await api('local-server')).state,'stopped');
  }finally{await close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('local supervisor recovers from a crash and an unresponsive process, but respects manual stop',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-reconnect-'));fixture(dir);
  const manager=local.create({directory:dir,port:await freePort(),watchInterval:50,reconnectDelay:50});
  const data=path.join(dir,'torrserver/data');
  const pid=()=>Number(fs.readFileSync(path.join(data,'pid')));
  try{
    await manager.start();const first=pid();process.kill(first,'SIGKILL');
    await until(()=>manager.status().state==='running'&&pid()!==first);
    const second=pid();fs.writeFileSync(path.join(data,'hang'),'');
    await until(()=>manager.status().state==='running'&&pid()!==second);
    const starts=fs.readFileSync(path.join(data,'pids'),'utf8');
    await manager.stop();await new Promise(r=>setTimeout(r,250));
    assert.equal(manager.status().state,'stopped');
    assert.equal(fs.readFileSync(path.join(data,'pids'),'utf8'),starts);
  }finally{await manager.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('stop cancels startup before the process is spawned and cancels a queued retry',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-stop-race-'));fixture(dir);
  const port=await freePort(),manager=local.create({directory:dir,port,watchInterval:50,reconnectDelay:50});
  const occupied=http.createServer();
  try{
    const starting=manager.start();await manager.stop();await assert.rejects(starting,/отменён/);
    assert.equal(fs.existsSync(path.join(dir,'torrserver/data/pid')),false);
    await new Promise(r=>occupied.listen(port,'127.0.0.1',r));
    await assert.rejects(manager.start(),/занят/);await manager.stop();
    await new Promise(r=>occupied.close(r));await new Promise(r=>setTimeout(r,250));
    assert.equal(manager.status().state,'stopped');assert.equal(fs.existsSync(path.join(dir,'torrserver/data/pid')),false);
  }finally{await manager.stop();if(occupied.listening)await new Promise(r=>occupied.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});

test('fresh configuration defaults to local autostart while saved external choices and legacy addresses are preserved',async()=>{
  for(const scenario of [
    {saved:null,mode:'local'},
    {saved:{seekStep:60},mode:'local'},
    {saved:{filmixTransport:'web'},mode:'local',filmix:'web'},
    {saved:{torrserverMode:'external'},mode:'external'},
    {saved:{torrserverMode:'external',torrserverUrl:'http://192.0.2.1:8090'},mode:'external'},
    {saved:{torrserverUrl:'http://192.0.2.1:8090'},mode:'external'},
    {saved:{torrserverMode:'local',torrserverUrl:'http://192.0.2.1:8090'},mode:'local'},
    {saved:null,url:'http://192.0.2.1:8090',mode:'external'}
  ]){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-default-mode-'));fixture(dir);
    const cfg=path.join(dir,'config.json'),port=await freePort(),tsPort=await freePort();
    if(scenario.saved)fs.writeFileSync(cfg,JSON.stringify(scenario.saved));
    const child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),TW_CONFIG:cfg,TW_TORRSERVER_PORT:String(tsPort),TORRSERVER_URL:scenario.url||''},stdio:['ignore','pipe','pipe']});
    try{
      await once(child.stdout,'data');const base='http://127.0.0.1:'+port;
      const {token}=await(await request(base+'/api/session')).json();
      const api=async route=>(await request(base+'/api/'+route,{headers:{'X-App-Token':token}})).json();
      const config=await api('config');
      assert.equal(config.torrserverMode,scenario.mode,JSON.stringify(scenario));
      assert.equal(config.filmixTransport,scenario.filmix||'mobile');
      if(scenario.mode==='local')await until(async()=>(await api('local-server')).state==='running');
      else{await new Promise(r=>setTimeout(r,100));assert.equal((await api('local-server')).state,'stopped');}
    }finally{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}fs.rmSync(dir,{recursive:true,force:true});}
  }
});
