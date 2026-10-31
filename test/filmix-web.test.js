'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const web=require('../server/filmix-web'),mobile=require('../server/filmix');
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
const close=s=>{s.closeAllConnections();return new Promise(r=>s.close(r));};

test('FilmixTV JSON is parsed without executing scripts or accepting truncated data',()=>{
 const data={movie:{id:1,title:'Braces } inside " title'},videoLinks:[]};
 assert.deepEqual(web.playerData('<script>window.playerData = '+JSON.stringify(data)+';throw new Error("must not run")</script>'),data);
 assert.throws(()=>web.playerData('window.playerData = evil()'));
 assert.throws(()=>web.playerData('window.playerData = {"movie":'));
});

test('web API renews sessions, preserves sparse episodes, protects tokens and proxies HLS children',async()=>{
 let base,refreshes=0,seenHeaders={},requests=[],loginBody;
 let config={filmixTransport:'web',filmixWebHash:'device-hash',filmixWebAccessToken:'old-access',filmixWebRefreshToken:'refresh-secret'};
 const payload={movie:{id:10,title:'Series',original_title:'Series original',short_story:'First<br>Second',poster:'',year:2026,ratingImdb:8.1,genres:[],countries:[]},user:{is_pro:true,is_pro_plus:false},isSerial:true,videoLinks:{Voice:{'season-2':{season:2,episodes:{e3:{episode:3,files:[]},e8:{episode:8,files:[]}}}}}};
 const upstream=http.createServer((req,res)=>{
  requests.push(req.url.split('?')[0]);seenHeaders=req.headers;res.setHeader('Content-Type','application/json');
  if(req.url.startsWith('/api/refresh')){refreshes++;return res.end(JSON.stringify({accessToken:'new-access',refreshToken:'new-refresh'}));}
  if(req.url.startsWith('/api/')&&req.headers.authorization!=='Bearer new-access'){res.writeHead(401);return res.end('{}');}
  if(req.url==='/api/me')return res.end(JSON.stringify({login:'example',is_pro:true}));
  if(req.url.startsWith('/api/list'))return res.end(JSON.stringify({page:1,has_next_page:true,items:[{id:10,title:'Series &#34;A&#34;',year:2026,genres:[{id:7}],last_season:2,last_episode:8,quality:'1080'}]}));
  if(req.url.startsWith('/watch?')){
   for(const row of Object.values(payload.videoLinks.Voice['season-2'].episodes))row.files=[{quality:1080,url:'http://cdn.example:'+upstream.address().port+'/master.m3u8'},{quality:2160,proPlus:true,url:'http://cdn.example:'+upstream.address().port+'/private.m3u8'}];
   res.setHeader('Content-Type','text/html');return res.end('<script>window.playerData = '+JSON.stringify(payload)+';</script>');
  }
  if(req.url==='/master.m3u8'){res.setHeader('Content-Type','application/vnd.apple.mpegurl');return res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo/media.m3u8\n');}
  if(req.url==='/video/media.m3u8'){res.setHeader('Content-Type','application/vnd.apple.mpegurl');return res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key.bin"\n#EXTINF:10,\nseg.ts\n#EXT-X-ENDLIST\n');}
  if(req.url==='/video/seg.ts'){res.writeHead(206,{'Content-Type':'video/mp2t','Content-Range':'bytes 0-3/100'});return res.end('data');}
  if(req.url==='/key.bin'){res.setHeader('Content-Type','application/octet-stream');return res.end('key');}
  res.writeHead(404);res.end('{}');
 });base=await listen(upstream);
 const adapter=web.create({getConfig:()=>config,saveConfig:d=>Object.assign(config,d),site:base,api:base+'/api',publicAddress:mobile.publicAddress,lookup:(host,opts,done)=>opts.all?done(null,[{address:'127.0.0.1',family:4}]):done(null,'127.0.0.1',4)});
 const proxy=http.createServer((req,res)=>adapter.stream(req,res,req.url.slice('/filmix-stream/'.length)));const proxyBase=await listen(proxy);
 try{
  const [profile,latest]=await Promise.all([adapter.profile(),adapter.latest(1)]);
  assert.equal(refreshes,1);assert.equal(profile.plan,'PRO');assert.equal(latest.items[0].title,'Series "A"');assert.equal(latest.items[0].episode,8);
  assert.equal(seenHeaders.origin,base);assert.equal(seenHeaders.referer,base+'/');assert.equal(seenHeaders.hash,'device-hash');assert.equal(seenHeaders['user-agent'].includes('VolKino'),false);
  const post=await adapter.post(10);assert.deepEqual(post.files.map(f=>f.episode),[3,8]);assert.deepEqual(post.files[0].qualities,[1080]);assert.equal(post.maxQuality,1080);
  const details=await adapter.details(10);assert.equal(details.imdbRating,'8.1');assert.equal(details.description,'First\nSecond');
  assert.equal(JSON.stringify([post,details,latest]).includes('new-access'),false);assert.equal(JSON.stringify(post).includes('cdn.example'),false);
  await assert.rejects(adapter.grant({id:10,fileId:20008,voice:'Voice',quality:2160}));
  const grant=await adapter.grant({id:10,fileId:20008,voice:'Voice',quality:1080});
  const master=await(await fetch(proxyBase+grant.url)).text();assert.equal(master.includes('cdn.example'),false);
  const playlistPath=master.split('\n').find(line=>line.startsWith('/filmix-stream/'));
  const playlist=await(await fetch(proxyBase+playlistPath)).text();assert.equal(playlist.includes('../key.bin'),false);
  const segmentPath=playlist.split('\n').find(line=>line.startsWith('/filmix-stream/'));
  const segment=await fetch(proxyBase+segmentPath,{headers:{Range:'bytes=0-3'}});assert.equal(segment.status,206);assert.equal(await segment.text(),'data');
  const key=playlist.match(/URI="([^"]+)"/)[1];assert.equal(await(await fetch(proxyBase+key)).text(),'key');
  assert.equal((await fetch(proxyBase+segmentPath.replace(/.$/,'z'))).status,403);
  assert.equal((await fetch(proxyBase+grant.url,{method:'HEAD'})).status,200);
  assert.equal(requests.some(x=>x.includes('/api/v2')),false);
 }finally{await close(proxy);await close(upstream);}
});
