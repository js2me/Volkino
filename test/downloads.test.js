'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const downloads = require('../server/downloads');

async function until(read) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Download did not settle');
}
async function fixture(t, upstream) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volkino-downloads-'));
  let manager;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/download-media/')) {
      const parts = req.url.split('/');
      manager.serve(req, res, parts[2], parts[3]);
    } else upstream(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const options = { directory: path.join(dir, 'downloads'), base: () => base, resolve: spec => Promise.resolve(spec.url) };
  manager = downloads.create(options);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { manager, base, options, replace: value => { manager = value; } };
}
const identity = { hash: 'a'.repeat(40), fileId: 1, fileName: 'movie.mp4', title: 'Movie', torrentTitle: 'Movie', link: 'magnet:?xt=urn:btih:' + 'a'.repeat(40) };

test('saved video survives helper restart and upstream outage, supports Range and deletion', async t => {
  let online = true, requests = 0;
  const f = await fixture(t, (req, res) => {
    requests++;
    if (!online) { res.writeHead(503); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': 10 }); res.end('0123456789');
  });
  const spec = { url: '/stream?hash=test&index=1' };
  const added = f.manager.add(spec, identity);
  assert.equal(f.manager.add(spec, identity).id, added.id);
  await until(() => f.manager.list()[0].state === 'ready');
  assert.equal(f.manager.list()[0].received, 10);
  online = false;
  f.replace(downloads.create(f.options));
  const saved = (await fetch(f.base + added.url, { headers: { Range: 'bytes=3-6' } }));
  assert.equal(saved.status, 206); assert.equal(await saved.text(), '3456');
  assert.equal(saved.headers.get('content-range'), 'bytes 3-6/10');
  const suffix = await fetch(f.base + added.url, { headers: { Range: 'bytes=-2' } });
  assert.equal(await suffix.text(), '89');
  assert.equal((await fetch(f.base + added.url, { headers: { Range: 'bytes=50-' } })).status, 416);
  const head = await fetch(f.base + added.url, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), ''); assert.equal(requests, 1);
  assert.equal((await fetch(f.base + added.url.replace('/media', '/index.json'))).status, 404);
  // Recreate the reference used by the fixture's HTTP handler.
  const restarted = downloads.create(f.options); f.replace(restarted);
  restarted.remove(added.id);
  assert.equal((await fetch(f.base + added.url)).status, 404);
  assert.deepEqual(downloads.create(f.options).list(), []);
});

test('HLS saves nested playlists, segments, init data and keys without remote dependencies', async t => {
  let online = true;
  const bodies = {
    '/filmix-stream/master': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n/filmix-stream/playlist\n',
    '/filmix-stream/playlist': '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-KEY:METHOD=AES-128,URI="/filmix-stream/key"\n#EXT-X-MAP:URI="/filmix-stream/init"\n#EXTINF:5,\n/filmix-stream/segment\n#EXT-X-ENDLIST\n',
    '/filmix-stream/key': '0123456789abcdef', '/filmix-stream/init': 'INIT', '/filmix-stream/segment': 'SEGMENT',
  };
  const f = await fixture(t, (req, res) => {
    if (!online) { res.writeHead(503); return res.end(); }
    res.setHeader('Content-Type', /master|playlist/.test(req.url) ? 'application/vnd.apple.mpegurl' : 'application/octet-stream');
    res.end(bodies[req.url]);
  });
  const added = f.manager.add({ url: '/filmix-stream/master' }, identity);
  await until(() => f.manager.list()[0].state === 'ready' || f.manager.list()[0].state === 'error');
  assert.equal(f.manager.list()[0].state, 'ready', f.manager.list()[0].error);
  online = false;
  const master = await (await fetch(f.base + added.url)).text();
  assert(!master.includes('/filmix-stream/'));
  const playlistUrl = new URL(master.split('\n').find(line => line && line[0] !== '#'), f.base + added.url);
  const playlist = await (await fetch(playlistUrl)).text();
  assert(!playlist.includes('/filmix-stream/'));
  const refs = [...playlist.matchAll(/URI="([^"]+)"/g)].map(match => match[1]);
  refs.push(playlist.split('\n').find(line => line && line[0] !== '#'));
  const local = await Promise.all(refs.map(async ref => (await fetch(new URL(ref, playlistUrl))).text()));
  assert.deepEqual(local, ['0123456789abcdef', 'INIT', 'SEGMENT']);
});

test('failed downloads can be retried and live HLS is never marked ready', async t => {
  let fail = true;
  const f = await fixture(t, (req, res) => {
    if (fail) { res.writeHead(503); return res.end(); }
    if (req.url.includes('live')) { res.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); return res.end('#EXTM3U\n#EXTINF:5,\n/filmix-stream/segment\n'); }
    res.end('VIDEO');
  });
  const item = f.manager.add({ url: '/stream?hash=test' }, identity);
  await until(() => f.manager.list()[0].state === 'error');
  fail = false; f.manager.retry(item.id);
  await until(() => f.manager.list()[0].state === 'ready');
  assert.equal(await (await fetch(f.base + item.url)).text(), 'VIDEO');
  const live = f.manager.add({ url: '/filmix-stream/live' }, identity);
  await until(() => f.manager.list().find(item => item.id === live.id).state === 'error');
  assert.match(f.manager.list().find(item => item.id === live.id).error, /прямого эфира/);
});

test('cancel stops active transfer, deletes partial data and starts next queued download', async t => {
  let started;
  const opened = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, (req, res) => {
    if (req.url.includes('slow')) { res.write('PARTIAL'); started(); }
    else res.end('NEXT');
  });
  const slow = f.manager.add({ url: '/stream?slow' }, identity);
  await opened;
  const next = f.manager.add({ url: '/stream?next' }, identity);
  f.manager.remove(slow.id);
  await until(() => f.manager.list().find(item => item.id === next.id).state === 'ready');
  assert.equal(await (await fetch(f.base + next.url)).text(), 'NEXT');
  assert.equal(fs.existsSync(path.join(f.options.directory, slow.id)), false);
});

test('authenticated helper API validates torrent file, saves it and serves it after restart with upstream offline', async t => {
  const { spawn } = require('node:child_process');
  const { once } = require('node:events');
  const hash = 'b'.repeat(40);
  const upstream = http.createServer((req, res) => {
    if (req.url === '/torrents') {
      req.resume(); res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ hash, title: 'Offline movie', file_stats: [{ id: 1, path: 'movie.mp4', length: 10 }] }));
    }
    res.setHeader('Content-Type', 'video/mp4'); res.end('0123456789');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volkino-download-api-'));
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ torrserverMode: 'external', torrserverUrl: 'http://127.0.0.1:' + upstream.address().port }));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  // Reserve a free port, then use it for both helper launches.
  const socket = http.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  async function launch() {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, TW_CONFIG: config, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    await once(child.stdout, 'data');
  }
  await launch();
  const base = 'http://127.0.0.1:' + port;
  let token = (await (await fetch(base + '/api/session')).json()).token;
  async function api(route, body) {
    return fetch(base + '/api/' + route, { method: body ? 'POST' : 'GET', headers: { 'X-App-Token': token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  }
  assert.equal((await fetch(base + '/api/downloads/save', { method: 'POST' })).status, 403);
  assert.equal((await api('downloads/save', { hash, fileId: 99 })).status, 400);
  const response = await api('downloads/save', { hash, fileId: 1 });
  assert.equal(response.status, 200); const saved = await response.json();
  for (let attempt = 0; attempt < 100; attempt++) {
    const items = (await (await api('downloads')).json()).items;
    if (items[0].state === 'ready') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await (await api('downloads')).json()).items[0].state, 'ready');
  child.kill(); await once(child, 'exit');
  upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
  await launch(); token = (await (await fetch(base + '/api/session')).json()).token;
  const playback = await fetch(base + saved.url, { headers: { Range: 'bytes=2-4' } });
  assert.equal(playback.status, 206); assert.equal(await playback.text(), '234');
  assert.equal((await api('downloads/remove', { id: saved.id })).status, 200);
  assert.equal((await fetch(base + saved.url)).status, 404);
});
