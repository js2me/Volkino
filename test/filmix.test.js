'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const filmix=require('../server/filmix');
function post(link='https://cdn.example/movie_[,1080,720,480,].mp4?keep=1'){return {id:42,title:'Movie',player_links:{movie:[{translation:'Voice',link}],playlist:[]}};}
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+s.address().port;}
async function close(s){s.closeAllConnections();await new Promise(r=>s.close(r));}
test('Filmix parser preserves sparse episode numbers, caps quality and strips inaccessible variants',()=>{
 const movie=filmix.normalizePost(post(),480);assert.deepEqual(movie.files[0].qualities,[480]);
 const series=filmix.normalizePost({id:43,title:'Series',player_links:{playlist:{2:{Dub:{3:{link:'https://cdn.example/s2e3_%s.mp4',qualities:[2160,1080,720]},8:{link:'https://cdn.example/s2e8_[1080,720].mp4'}}},3:{Dub:[{link:'https://cdn.example/s3e1_[720,480].mp4'}]}}}},720);
 assert.deepEqual(series.files.map(f=>f.id),[20003,20008,30001]);assert.deepEqual(series.files[0].qualities,[720]);assert.deepEqual(series.seasons,[2,3]);
 assert.throws(()=>filmix.normalizePost(post('file:///etc/passwd'),720),/ссылку/);
 assert.throws(()=>filmix.normalizePost(post('https://cdn.example/v_[1080].mp4'),480),/нет доступных/);
});
test('media address guard rejects private, loopback, mapped IPv6 and non-network addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','172.16.0.1','169.254.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','invalid'])assert.equal(filmix.publicAddress(ip),false,ip);
 assert.equal(filmix.publicAddress('8.8.8.8'),true);assert.equal(filmix.publicAddress('2606:4700:4700::1111'),true);
});
test('device auth, quality limits, secret-free metadata and byte-range streaming work with mock Filmix',async()=>{
 let activated=false,seenRange='',seenToken='',redirect=false,config={filmixApiUrl:'',filmixDeviceId:'0123456789abcdef',filmixToken:''};
 const upstream=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');seenToken=u.searchParams.get('user_dev_token');res.setHeader('Content-Type','application/json');
  if(u.pathname==='/api/v2/search')return res.end(JSON.stringify([{id:42,title:'Movie',year:2020}]));
  if(u.pathname==='/api/v2/token_request')return res.end(JSON.stringify({status:'ok',user_code:'ABCD',code:'private-token'}));
  if(u.pathname==='/api/v2/user_profile')return res.end(JSON.stringify({user_data:activated?{user_id:1,login:'test',is_pro:'1'}:{}}));
  if(u.pathname==='/api/v2/post/42')return res.end(JSON.stringify(post('http://media.example:'+upstream.address().port+'/v_[1080,720,480].mp4')));
  if(u.pathname.startsWith('/v_')){seenRange=req.headers.range;if(redirect){res.writeHead(302,{Location:'/final.mp4'});return res.end();}res.writeHead(206,{'Content-Type':'video/mp4','Content-Length':4,'Content-Range':'bytes 10-13/100'});return res.end('DATA');}
  if(u.pathname==='/final.mp4'){seenRange=req.headers.range;res.writeHead(206,{'Content-Type':'video/mp4','Content-Length':4,'Content-Range':'bytes 10-13/100'});return res.end('DATA');}
  res.writeHead(404);res.end();
 });const base=await listen(upstream);config.filmixApiUrl=base+'/api/v2';
 const adapter=filmix.create({getConfig:()=>config,saveConfig:b=>Object.assign(config,b),lookup:(host,opts,cb)=>opts.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)});
 const proxy=http.createServer((req,res)=>adapter.stream(req,res,req.url.split('/').pop()));const local=await listen(proxy);
 try{
  assert.equal((await adapter.search('Movie')).results[0].id,42);
  assert.deepEqual((await adapter.post(42)).files[0].qualities,[480]);assert.equal(JSON.stringify(await adapter.post(42)).includes('media.example'),false);
  await assert.rejects(adapter.grant({id:42,fileId:1,voice:'Voice',quality:1080}),/качество/);
  const code=await adapter.authStart();assert.equal(code.code,'ABCD');assert.equal(JSON.stringify(code).includes('private-token'),false);
  await assert.rejects(adapter.authCheck(),/не подключено/);activated=true;assert.equal((await adapter.authCheck()).maxQuality,1080);assert.equal(config.filmixToken,'private-token');
  const grant=await adapter.grant({id:42,fileId:1,voice:'Voice',quality:1080});assert.match(grant.url,/^\/filmix-stream\/[a-f0-9]{48}$/);assert.equal(seenToken,'private-token');
  redirect=true;const result=await fetch(local+grant.url,{headers:{Range:'bytes=10-13'}});assert.equal(result.status,206);assert.equal(result.headers.get('content-range'),'bytes 10-13/100');assert.equal(await result.text(),'DATA');assert.equal(seenRange,'bytes=10-13');assert.equal(seenToken,null);
  const head=await fetch(local+grant.url,{method:'HEAD'});assert.equal(head.status,206);assert.equal(await head.text(),'');
  adapter.disconnect();assert.equal(config.filmixToken,'');assert.equal((await fetch(local+grant.url)).status,410);
 }finally{await close(proxy);await close(upstream);}
});
test('Filmix HTTP API requires session and keeps token out of public config while preserving it on unrelated saves',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-filmix-')),cfg=path.join(dir,'config.json');
 const reserve=http.createServer();const address=await listen(reserve);await close(reserve);const port=new URL(address).port;
 fs.writeFileSync(cfg,JSON.stringify({filmixToken:'private-token',torrserverMode:'local'}));
 const child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:port,TW_CONFIG:cfg},stdio:['ignore','pipe','pipe']});
 try{await once(child.stdout,'data');assert.equal((await fetch(address+'/api/filmix/search?q=test')).status,403);const session=await(await fetch(address+'/api/session')).json();const headers={'X-App-Token':session.token,'Content-Type':'application/json'};
 const conf=await(await fetch(address+'/api/config',{headers})).json();assert.equal(conf.hasFilmixToken,true);assert.equal(conf.filmixToken,undefined);assert.equal(conf.filmixDeviceId,undefined);
 const saved=await fetch(address+'/api/config',{method:'POST',headers,body:JSON.stringify({filmixSiteUrl:'https://filmix.my'})});assert.equal(saved.status,200);assert.equal(JSON.parse(fs.readFileSync(cfg)).filmixToken,'private-token');assert.equal(fs.statSync(cfg).mode&0o777,0o600);
 const disconnected=await fetch(address+'/api/filmix/auth/disconnect',{method:'POST',headers,body:'{}'});assert.equal(disconnected.status,200);assert.equal(JSON.parse(fs.readFileSync(cfg)).filmixToken,'');
 }finally{const exited=once(child,'exit');child.kill();await exited;fs.rmSync(dir,{recursive:true,force:true});}
});
