'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const recent=require('../server/recent'),filmix=require('../server/filmix');

test('latest pages validate before fetching; Filmix rows preserve chronological source order and expose no credentials',()=>{
  assert.equal(recent.pageNumber(),1);
  for(const value of [0,-1,1.5,501,'1&host=evil',NaN])assert.throws(()=>recent.pageNumber(value));
  const result=recent.filmixPage([
    {id:10,title:'Updated series',year:2021,date_atom:'2026-10-31T20:58:35+02:00',last_episode:{season:'2',episode:'8'},user_dev_token:'private-token'},
    {id:99,title:'New movie',year:2026,date_atom:'2026-10-30T18:00:00Z'},
    {id:99,title:'Duplicate'}, {id:'invalid',title:'Invalid'},
  ],1);
  assert.deepEqual(result.items.map(item=>item.id),['filmix:10','filmix:99']);
  assert.equal(result.items[0].type,'tv');assert.equal(result.items[0].episode,8);
  assert.equal(result.items[0].updatedAt,'2026-10-31T18:58:35.000Z');
  assert.equal(result.items[1].type,'movie');assert.equal(result.hasMore,false);
  assert.equal(JSON.stringify(result).includes('private-token'),false);
  assert.throws(()=>recent.filmixPage({message:null},1),/не вернул/);
});

test('Filmix latest requests date-desc catalog with device params, coalesces and isolates cache by account',async()=>{
  let calls=0,seen,config={filmixDeviceId:'0123456789abcdef',filmixToken:''};
  const upstream=http.createServer((req,res)=>{
    calls++;seen=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(Array.from({length:50},(_,i)=>({id:i+1,title:'Movie '+i,date_atom:'2026-10-31T10:00:00Z',year:2026}))));
  });await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  config.filmixApiUrl='http://127.0.0.1:'+upstream.address().port+'/api/v2';
  try{
    const adapter=filmix.create({getConfig:()=>config,saveConfig:update=>Object.assign(config,update)});
    const [a,b]=await Promise.all([adapter.latest(1),adapter.latest(1)]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.hasMore,true);
    assert.equal(seen.pathname,'/api/v2/catalog');assert.equal(seen.searchParams.get('orderby'),'date');assert.equal(seen.searchParams.get('orderdir'),'desc');assert.equal(seen.searchParams.get('page'),'1');assert.equal(seen.searchParams.get('user_dev_apk'),'2.2.13');
    await adapter.latest(1);assert.equal(calls,1);config.filmixToken='private-token';await adapter.latest(1);assert.equal(calls,2);
    await adapter.latest(1,true);assert.equal(calls,3);
    assert.equal(JSON.stringify(a).includes('private-token'),false);
    assert.throws(()=>adapter.latest(501));assert.equal(calls,3);
  }finally{upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});

test('Filmix preview loads without playable files, strips markup and secrets and coalesces requests',async()=>{
  let calls=0;
  const upstream=http.createServer((req,res)=>{calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:10,title:'Series',short_story:'First<br>Second &amp; third',year:2026,poster:'https://example.com/poster.jpg',imdb_rating:7.9,kp_rating:0,categories:['Drama'],countries:['Russia'],actors:['Actor'],directors:['Director'],user_dev_token:'secret',player_links:{movie:[]}}));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const adapter=filmix.create({getConfig:()=>({filmixApiUrl:'http://127.0.0.1:'+upstream.address().port,filmixDeviceId:'0123456789abcdef'}),saveConfig(){}});
  try{
    const [a,b]=await Promise.all([adapter.details(10),adapter.details(10)]);
    assert.deepEqual(a,b);assert.equal(calls,1);
    assert.equal(a.description,'First\nSecond & third');assert.equal(a.imdbRating,'7.9');assert.equal(a.kpRating,'');
    assert.equal(a.poster,'/filmix-poster?id=10');assert.deepEqual(a.genres,['Drama']);
    assert.equal(JSON.stringify(a).includes('secret'),false);assert.equal('player_links' in a,false);
  }finally{upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
});

test('Filmix posters follow CDN redirects and return only image data',async()=>{
  let port;
  const upstream=http.createServer((req,res)=>{
    if(req.url.startsWith('/post/10')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({id:10,title:'Movie',poster:'http://posters.example:'+port+'/old.jpg'}));}
    if(req.url==='/old.jpg'){res.writeHead(301,{Location:'/new.jpg'});return res.end();}
    if(req.url==='/new.jpg'){res.writeHead(200,{'Content-Type':'image/jpeg'});return res.end(Buffer.from([255,216,255,217]));}
    res.writeHead(404);res.end();
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));port=upstream.address().port;
  const adapter=filmix.create({getConfig:()=>({filmixApiUrl:'http://127.0.0.1:'+port,filmixDeviceId:'0123456789abcdef'}),saveConfig(){},lookup:(host,opts,done)=>opts.all?done(null,[{address:'127.0.0.1',family:4}]):done(null,'127.0.0.1',4)});
  const proxy=http.createServer((req,res)=>adapter.poster(req,res,10));await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  try{const response=await fetch('http://127.0.0.1:'+proxy.address().port);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from([255,216,255,217]));}
  finally{proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>upstream.close(r))]);}
});
