'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const updates = require('../server/updates');

function fixture(t, platform = 'android') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'volkino-updates-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const name = 'volkino_0.9.2_' + (platform === 'webos' ? 'all.ipk' : platform + '-release.apk');
  const content = Buffer.from('verified package');
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const base = 'https://github.com/js2me/Volkino/releases/download/v0.9.2-build.12/';
  const release = {tag_name:'v0.9.2-build.12', assets:[{name, size:content.length, browser_download_url:base + name}, {name:'SHA256SUMS.txt', browser_download_url:base + 'SHA256SUMS.txt'}]};
  let corrupt = false, rejectDownload = false, downloads = 0;
  const manager = updates.create({directory, current:{version:'0.9.2', build:11, versionCode:1011, platform}, transfer:async (url, max, dest, progress) => {
    if (url.includes('api.github.com')) return {data:JSON.stringify(release)};
    if (url.endsWith('SHA256SUMS.txt')) return {data:sha + '  ' + name + '\n'};
    downloads++;
    fs.writeFileSync(dest, content); progress(content.length);
    if (rejectDownload) throw new Error('Connection interrupted');
    return {sha256:corrupt ? '0'.repeat(64) : sha, size:content.length};
  }});
  return {directory, manager, release, get downloads() {return downloads;}, corrupt() {corrupt=true;}, interrupt() {rejectDownload=true;}};
}
async function settled(manager) {
  for (let i=0; i<100; i++) {
    if (manager.status().state !== 'downloading') return manager.status();
    await new Promise(r=>setImmediate(r));
  }
  throw new Error('Download did not settle');
}
test('compares build numbers, version changes and rejects prerelease tags', () => {
  const current = {version:'0.9.2', build:11};
  assert.equal(updates.newer('v0.9.2-build.12', current), true);
  assert.equal(updates.newer('v0.9.2-build.11', current), false);
  assert.equal(updates.newer('v0.9.1-build.999', current), false);
  assert.equal(updates.newer('v0.10.0-build.1', current), true);
  assert.equal(updates.newer('v0.10.0-beta.1', current), false);
});
test('chooses release assets for each platform and prevents duplicate downloads', async t => {
  for (const platform of ['android','android6','webos']) {
    const f = fixture(t, platform);
    assert.equal((await f.manager.check()).state, 'available');
    assert.equal(f.manager.download().state, 'downloading');
    assert.throws(()=>f.manager.download(), /Сначала/);
    assert.equal((await settled(f.manager)).state, 'ready');
    assert.equal(f.downloads, 1);
    const file = path.join(f.directory, platform === 'webos' ? 'update.ipk' : 'update.apk');
    assert.equal(fs.existsSync(file), true);
    assert.equal(fs.existsSync(file + '.part'), false);
    fs.unlinkSync(file); // Native installer removes the APK on success or cancellation.
    assert.equal(f.manager.status().state, 'idle');
    assert.equal((await f.manager.check()).state, 'available');
  }
});
test('hash mismatch and interrupted downloads leave no installer files', async t => {
  for (const kind of ['corrupt','interrupt']) {
    const f = fixture(t); f[kind]();
    await f.manager.check(); f.manager.download();
    assert.equal((await settled(f.manager)).state, 'error');
    assert.deepEqual(fs.readdirSync(f.directory), []);
  }
});
test('startup cleans abandoned installers and partial downloads', t => {
  const f = fixture(t);
  for (const file of ['update.apk','update.apk.part','installer.js']) fs.writeFileSync(path.join(f.directory,file),'stale');
  updates.create({directory:f.directory,current:{version:'0.9.2',platform:'android'}});
  assert.deepEqual(fs.readdirSync(f.directory), []);
});
test('missing assets, GitHub errors and already installed releases do not start downloads', async t => {
  const f = fixture(t);
  f.release.tag_name = 'v0.9.2-build.11';
  assert.equal((await f.manager.check()).state, 'latest');
  f.release.tag_name = 'v0.9.2-build.12'; f.release.assets = [];
  assert.equal((await f.manager.check()).state, 'error');
  assert.throws(()=>f.manager.download(), /Сначала/);
  const offline = updates.create({directory:f.directory,current:{version:'0.9.2',platform:'android'},transfer:async()=>{throw new Error('offline');}});
  assert.equal((await offline.check()).error, 'offline');
  assert.equal(f.downloads, 0);
});
test('download URL validation blocks third-party hosts, credentials and insecure redirects', () => {
  for (const address of ['http://github.com/js2me/Volkino/releases/download/v1/a.apk','https://github.com/other/repo/releases/download/v1/a.apk','https://evil.test/a.apk','https://user@release-assets.githubusercontent.com/a','https://release-assets.githubusercontent.com:8443/a']) assert.equal(updates.allowed(address),false,address);
  assert.equal(updates.allowed('https://github.com/js2me/Volkino/releases/download/v1/a.apk'),true);
  assert.equal(updates.allowed('https://release-assets.githubusercontent.com/a?token=example'),true);
});
