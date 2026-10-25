'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../server/core');
const hash = '0123456789abcdef0123456789abcdef01234567';
test('decodes escaped ampersands in real Rutor magnets and deduplicates hashes', () => {
  const result = core.normalize([
    {Title:'Film 1080p',Magnet:'magnet:?xt=urn:btih:'+hash+'\\u0026tr=udp://tracker',Seed:12,Size:'2 GB'},
    {Title:'Duplicate',Magnet:'magnet:?xt=urn:btih:'+hash.toUpperCase(),Seed:3},
    {Title:'No torrent',Magnet:'javascript:alert(1)'}
  ]);
  assert.equal(result.length,1);assert.match(result[0].magnet,/&tr=udp/);assert.equal(result[0].quality,'1080p');assert.equal(result[0].seeders,12);
});
test('extracts real FXML torrent metadata without evaluating portal markup', () => {
  const page={channels:[{title:'Film 720p',stream_url:'magnet:?xt=urn:btih:'+hash,description:'<b>rutracker</b><i>Раздают: <span>17</span></i> Качают: <b>2</b><span>1.45 ГБ</span>'},{title:'Menu',playlist_url:'cmd:run()'}]};
  const [r]=core.vilkaResults(page);assert.equal(r.seeders,17);assert.equal(r.peers,2);assert.equal(r.size,'1.45 ГБ');assert.equal(r.tracker,'rutracker');
});
test('video IDs stay identical to TorrServer one-based indexes', () => {
  assert.deepEqual(core.files({file_stats:[{id:1,path:'info.txt',length:9},{id:4,path:'Season/Ep10.mkv',length:1000},{id:2,path:'Season/Ep2.mp4',length:900}]}).map(f=>f.id),[2,4]);
  assert.equal(core.streamPath(hash,4,false),'/stream/video?link='+hash+'&index=4&play');assert.match(core.streamPath(hash,4,true),/&preload&stat$/);
  assert.throws(()=>core.streamPath(hash,0,false));assert.throws(()=>core.streamPath('../etc/passwd',1,false));
});
test('validates configurable server URLs and rejects embedded secrets and non-http protocols', () => {
  assert.equal(core.validBase('http://192.168.1.2:8090/'),'http://192.168.1.2:8090');
  for(const u of ['file:///etc/passwd','http://user:pass@example.com','http://example.com/?apikey=x','javascript:foo'])assert.throws(()=>core.validBase(u));
});
test('normalizes Jacred records and ignores empty/invalid payloads', () => {
  assert.equal(core.normalize([{title:'Movie',magnet:'magnet:?xt=urn:btih:'+hash,size:1024,seeders:5,tracker:'rutor'}])[0].seeders,5);
  assert.throws(()=>core.normalize({error:'no'}));assert.throws(()=>core.vilkaResults({error:'no'}));
});
