'use strict';
// Node 8 compatible. Only this repository's release assets may be downloaded.
var fs = require('fs'), path = require('path'), https = require('https'), URL = require('url'), crypto = require('crypto'), cp = require('child_process');
var repository = 'https://github.com/js2me/Volkino/releases/download/';
function allowed(address) {
  var u = URL.parse(address);
  return u.protocol === 'https:' && !u.auth && (!u.port || u.port === '443') &&
    (address.indexOf(repository) === 0 || ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].indexOf(u.hostname) >= 0 || u.hostname === 'api.github.com' && u.pathname === '/repos/js2me/Volkino/releases/latest');
}
function transfer(address, limit, destination, progress, redirects) {
  return new Promise(function (resolve, reject) {
    if (!allowed(address)) return reject(new Error('Недопустимый адрес обновления'));
    var u = URL.parse(address); u.headers = {'User-Agent':'VolKino', Accept:'application/vnd.github+json'};
    var req = https.get(u, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('Слишком много перенаправлений'));
        return resolve(transfer(URL.resolve(address, res.headers.location), limit, destination, progress, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(res.statusCode === 403 || res.statusCode === 429 ? 'GitHub ограничил запросы. Повторите позже.' : 'GitHub: HTTP ' + res.statusCode)); }
      var chunks = [], size = 0, hash = crypto.createHash('sha256'), out = destination ? fs.createWriteStream(destination, {mode:384}) : null;
      function fail(e) { req.destroy(); if (out) out.destroy(); reject(e); }
      if (out) out.on('error', fail);
      res.on('data', function (chunk) {
        size += chunk.length;
        if (size > limit) return fail(new Error('Файл обновления слишком большой'));
        hash.update(chunk);
        if (out) { if (!out.write(chunk)) { res.pause(); out.once('drain', function () { res.resume(); }); } }
        else chunks.push(chunk);
        if (progress) progress(size);
      });
      res.on('error', fail); res.on('aborted', function () { fail(new Error('Загрузка прервана')); });
      res.on('end', function () {
        if (res.headers['content-length'] && size !== Number(res.headers['content-length'])) return fail(new Error('Файл загружен не полностью'));
        function done() { resolve({data:out ? null : Buffer.concat(chunks).toString('utf8'), sha256:hash.digest('hex'), size:size}); }
        if (out) out.end(done); else done();
      });
    });
    req.setTimeout(20000, function () { req.destroy(new Error('GitHub не ответил вовремя')); }); req.on('error', reject);
  });
}
function tag(value) {
  var m = /^v?(\d+)\.(\d+)\.(\d+)(?:-build\.(\d+))?$/.exec(value || '');
  return m ? m.slice(1).map(function (x) { return Number(x || 0); }) : null;
}
function newer(remote, current) {
  var a = tag(remote), b = tag('v' + current.version + '-build.' + (current.build || 0));
  if (!a || !b) return false;
  for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
function remove(file) { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
function create(options) {
  var directory = options.directory, current = options.current, fetch = options.transfer || transfer;
  var state = {state:'idle', current:current.version, build:current.build || 0, received:0, total:0, error:''}, release, asset, checksum;
  var platform = current.platform;
  var supported = ['android', 'android6', 'webos'].indexOf(platform) >= 0;
  var file = path.join(directory, platform === 'webos' ? 'update.ipk' : 'update.apk');
  function clean() { remove(file); remove(file + '.part'); }
  // Android also cleans its private staging directory after installer results.
  // webOS removes the package before restarting the helper.
  clean();
  remove(path.join(directory, 'installer.js'));
  function status() {
    if (state.state === 'ready' && !fs.existsSync(file)) state.state = 'idle';
    return Object.assign({supported:supported, platform:platform}, state);
  }
  function check() {
    if (['checking','downloading','installing'].indexOf(state.state) >= 0) return status();
    state.state = 'checking'; state.error = '';
    return fetch('https://api.github.com/repos/js2me/Volkino/releases/latest', 2 * 1024 * 1024, null, null, 3).then(function (result) {
      release = JSON.parse(result.data);
      var version = tag(release.tag_name);
      if (!version || release.draft || release.prerelease) throw new Error('Подходящий релиз не найден');
      var suffix = platform === 'webos' ? '_all.ipk' : '_' + platform + '-release.apk';
      asset = (release.assets || []).find(function (a) { return a.name === 'volkino_' + version.slice(0,3).join('.') + suffix; });
      checksum = (release.assets || []).find(function (a) { return a.name === 'SHA256SUMS.txt'; });
      var available = newer(release.tag_name, current);
      if (platform === 'android' || platform === 'android6') available = available && 1000 + version[3] > current.versionCode;
      if (supported && available && (!asset || !checksum)) throw new Error('В релизе отсутствует пакет или контрольная сумма');
      clean(); state.state = available ? 'available' : 'latest'; state.latest = release.tag_name; state.total = asset ? asset.size : 0; state.received = 0;
      return status();
    }).catch(function (e) { state.state = 'error'; state.error = e.message; return status(); });
  }
  function download() {
    if (!supported) throw new Error('Обновление доступно в установленном Android или webOS приложении');
    if (state.state !== 'available') throw new Error('Сначала проверьте обновления');
    state.state = 'downloading'; state.error = ''; state.received = 0;
    try {
      if (!fs.existsSync(directory)) fs.mkdirSync(directory, 448);
      clean();
    } catch (e) { state.state = 'error'; state.error = e.message; return status(); }
    fetch(checksum.browser_download_url, 1024 * 1024, null, null, 3).then(function (r) {
      var expected;
      r.data.split(/\r?\n/).forEach(function (line) { var m = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line); if (m && m[2] === asset.name) expected = m[1].toLowerCase(); });
      if (!expected) throw new Error('Контрольная сумма пакета не найдена');
      return fetch(asset.browser_download_url, 512 * 1024 * 1024, file + '.part', function (size) { state.received = size; }, 5).then(function (result) {
        if (result.sha256 !== expected || result.size !== asset.size) throw new Error('Проверка SHA-256 или размера пакета не пройдена');
        fs.renameSync(file + '.part', file); state.state = 'ready';
      });
    }).catch(function (e) { clean(); state.state = 'error'; state.error = e.message; });
    return status();
  }
  function install() {
    if (platform !== 'webos' || state.state !== 'ready') throw new Error('Пакет не готов к установке');
    var script = path.join(directory, 'installer.js');
    fs.copyFileSync(path.resolve(__dirname, '../scripts/install-on-tv.js'), script);
    var log = fs.openSync(path.join(directory, 'update.log'), 'w', 384);
    var child;
    try {
      child = cp.spawn(process.execPath, [script, file], {detached:true, stdio:['ignore',log,log], env:Object.assign({},process.env,{TW_UPDATE_CLEANUP:'1'})});
    } catch (e) { clean(); remove(script); throw e; }
    finally { fs.closeSync(log); }
    child.on('error', function (e) { clean(); remove(script); state.state = 'error'; state.error = e.message; });
    child.unref(); state.state = 'installing'; return status();
  }
  return {status:status, check:check, download:download, install:install};
}
module.exports = {create:create, newer:newer, allowed:allowed, transfer:transfer};
