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
http.createServer((req,res)=>{
 if(req.headers.authorization){res.writeHead(401);return res.end('credentials leaked');}
 if(req.url==='/echo')return res.end('MatriX.fixture');
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
    const pid=Number(fs.readFileSync(path.join(dir,'torrserver/data/pid')));
    await close();await until(()=>{try{process.kill(pid,0);return false;}catch(_){return true;}});
    await launch();await until(async()=>(await api('local-server')).state==='running');assert.equal((await api('health')).version,'MatriX.fixture');
    await api('local-server/stop',{});assert.equal((await api('local-server')).state,'stopped');assert.equal((await api('config')).torrserverMode,'external');
    assert.equal(JSON.parse(fs.readFileSync(cfg)).torrserverPassword,'secret');
    await api('config',{torrserverMode:'local'});assert.equal((await api('health')).version,'MatriX.fixture');
    await api('config',{torrserverMode:'external'});assert.equal((await api('local-server')).state,'stopped');
  }finally{await close();fs.rmSync(dir,{recursive:true,force:true});}
});
