'use strict';
// Node 8 compatible. Only pinned upstream binaries are installed and executed.
var fs = require('fs'), path = require('path'), https = require('https'), http = require('http');
var crypto = require('crypto'), cp = require('child_process');
var release = require('./torrserver-release.json');
function asset(platform, arch) {
  if (platform !== 'linux') throw new Error('Локальный TorrServer поддерживается на Linux и webOS');
  var names = { x64: 'amd64', ia32: '386', arm: 'arm7', arm64: 'arm64' };
  if (!names[arch]) throw new Error('Архитектура не поддерживается: ' + arch);
  return 'TorrServer-linux-' + names[arch];
}
function mkdir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, 448); }
function download(url, file, digest, redirects) {
  return new Promise(function (resolve, reject) {
    var req = https.get(url, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5 || !/^https:\/\//.test(res.headers.location)) return reject(new Error('Некорректное перенаправление загрузки'));
        return download(res.headers.location, file, digest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Загрузка TorrServer: HTTP ' + res.statusCode)); }
      var out = fs.createWriteStream(file, {mode: 384}), hash = crypto.createHash('sha256'), size = 0;
      function fail(e) { res.destroy(); out.destroy(); reject(e); }
      res.on('data', function (chunk) { size += chunk.length; hash.update(chunk); if (size > 100 * 1024 * 1024) fail(new Error('Бинарный файл слишком большой')); });
      res.on('error', fail); res.on('aborted', function () { fail(new Error('Загрузка прервана')); }); out.on('error', fail);
      out.on('finish', function () { out.close(function () { if (hash.digest('hex') !== digest) reject(new Error('Не совпала SHA-256 TorrServer')); else resolve(); }); });
      res.pipe(out);
    });
    req.setTimeout(30000, function () { req.destroy(new Error('Таймаут загрузки TorrServer')); }); req.on('error', reject);
  });
}
function create(options) {
  var dir = path.join(options.directory, 'torrserver'), binary = process.env.TW_TORRSERVER_BINARY || path.join(dir, 'TorrServer-' + release.version);
  var child = null, job = null, phase = 'stopped', error = '', stopping = null, starting = null;
  var port = Number(options.port || 32191), base = 'http://127.0.0.1:' + port;
  function status() { return { installed: fs.existsSync(binary), state: phase, error: error, version: release.version, url: base }; }
  function echo() {
    return new Promise(function (resolve, reject) {
      var req = http.get(base + '/echo', function (res) { var data = ''; res.on('data', function (c) { data += c; }); res.on('end', function () { if (res.statusCode === 200 && data.indexOf('MatriX') >= 0) resolve(); else reject(new Error('Некорректный ответ локального TorrServer')); }); res.on('error', reject); });
      req.setTimeout(700, function () { req.destroy(new Error('Нет ответа')); }); req.on('error', reject);
    });
  }
  function stop() {
    if (stopping) return stopping;
    if (!child) { phase = 'stopped'; return Promise.resolve(); }
    var current = child; phase = 'stopping';
    stopping = new Promise(function (resolve) {
      var timer = setTimeout(function () { current.kill('SIGKILL'); }, 3000);
      current.once('exit', function () { clearTimeout(timer); phase = 'stopped'; stopping = null; resolve(); }); current.kill('SIGTERM');
    });
    return stopping;
  }
  function launch() {
    if (phase === 'running' && child) return Promise.resolve(status());
    if (!fs.existsSync(binary)) return Promise.reject(new Error('Сначала нажмите «Установить и запустить»'));
    // Refuse an occupied port rather than connecting to an unrelated process.
    return new Promise(function (resolve, reject) {
      var probe = require('net').createServer(); probe.once('error', function () { reject(new Error('Порт ' + port + ' уже занят')); });
      probe.listen(port, '127.0.0.1', function () { probe.close(resolve); });
    }).then(function () {
      mkdir(dir); var dataDir = path.join(dir, 'data'); mkdir(dataDir);
      // The pinned release stores settings under BitTorr in settings.json.
      // Apply memory limits before startup; /settings set restarts the torrent engine.
      var settingsFile = path.join(dataDir, 'settings.json'), settings = {};
      try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      settings.BitTorr = Object.assign({ReaderReadAHead: 95, PreloadCache: 50, RetrackersMode: 1, TorrentDisconnectTimeout: 30, ResponsiveMode: true, StoreSettingsInJson: true}, settings.BitTorr, {CacheSize: 32 * 1024 * 1024, ConnectionsLimit: 20, UseDisk: false, DisableUPNP: true, EnableDLNA: false, EnableBonjour: false, EnableLPD: false});
      fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings), {mode: 384}); fs.renameSync(settingsFile + '.tmp', settingsFile);
      var log = path.join(dir, 'torrserver.log'); if (fs.existsSync(log) && fs.statSync(log).size > 1024 * 1024) fs.renameSync(log, log + '.old');
      var fd = fs.openSync(log, 'a', 384);
      phase = 'starting'; error = '';
      var current = child = cp.spawn(binary, ['--ip', '127.0.0.1', '--port', String(port), '--path', dataDir], {stdio: ['ignore', fd, fd], env: Object.assign({}, process.env, {GOMEMLIMIT: '96MiB', GOGC: '50'})}); fs.closeSync(fd);
      current.on('error', function (e) { error = e.message; phase = 'error'; child = null; });
      current.on('exit', function (code, signal) { if (child === current) child = null; if (phase !== 'stopped' && !stopping) { phase = 'error'; error = 'TorrServer завершился (' + (signal || code) + '). См. ' + log; } });
      var deadline = Date.now() + 15000;
      return new Promise(function (resolve, reject) {
        function check() {
          if (child !== current) return reject(new Error(error || 'TorrServer завершился'));
          echo().then(function () { if (child !== current) return reject(new Error(error || 'TorrServer завершился')); phase = 'running'; resolve(status()); }, function () {
            if (Date.now() < deadline) return setTimeout(check, 250);
            stop().then(function () { reject(new Error('TorrServer не запустился. См. ' + log)); });
          });
        } check();
      });
    });
  }
  function start() {
    if (starting) return starting;
    starting = launch().then(function (value) { starting = null; return value; }, function (e) { starting = null; throw e; });
    return starting;
  }
  function run(install, ready) {
    if (job || starting || stopping) return status();
    if (phase === 'running' && child) { if (ready) ready(); return status(); }
    phase = install ? 'installing' : 'starting'; error = '';
    job = Promise.resolve().then(function () {
      if (!install || fs.existsSync(binary)) return;
      if (process.env.TW_TORRSERVER_BINARY) throw new Error('В APK отсутствует встроенный TorrServer. Переустановите приложение.');
      var name = asset(process.platform, process.arch); mkdir(dir);
      return download('https://github.com/YouROK/TorrServer/releases/download/' + release.version + '/' + name, binary + '.tmp', release.hashes[name], 0).then(function () { fs.chmodSync(binary + '.tmp', 448); fs.renameSync(binary + '.tmp', binary); });
    }).then(start).then(function () { if (ready) ready(); }).catch(function (e) { phase = 'error'; error = e.message; try { fs.unlinkSync(binary + '.tmp'); } catch (_) {} }).then(function () { job = null; });
    return status();
  }
  return {status: status, run: run, start: start, stop: stop, busy: function () { return !!job || !!starting || !!stopping; }, kill: function () { if (child) child.kill('SIGKILL'); }, base: base};
}
module.exports = {create: create, asset: asset};
