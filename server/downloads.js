'use strict';
// Persistent offline library. Node 8.12-compatible, bounded streaming to disk.
var fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), URL = require('url');
exports.create = function (options) {
  var directory = options.directory, items = [], active = null;
  var manifest = path.join(directory, 'index.json');
  function mkdir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, {mode: 448}); }
  function persist() {
    mkdir(directory);
    fs.writeFileSync(manifest + '.tmp', JSON.stringify(items), {mode: 384});
    fs.renameSync(manifest + '.tmp', manifest);
  }
  function clean(item) {
    var dir = path.join(directory, item.id);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (name) { fs.unlinkSync(path.join(dir, name)); });
    fs.rmdirSync(dir);
  }
  try {
    items = JSON.parse(fs.readFileSync(manifest, 'utf8')).filter(function (item) { return /^[a-f0-9]{32}$/.test(item.id); });
    items.forEach(function (item) {
      if (item.state === 'queued' || item.state === 'downloading') {
        item.state = 'error'; item.error = 'Загрузка прервана. Нажмите «Повторить».'; clean(item);
      }
      if (item.state === 'ready' && !fs.existsSync(path.join(directory, item.id, 'media'))) {
        item.state = 'error'; item.error = 'Файл отсутствует. Скачайте видео заново.';
      }
    });
  } catch (error) { if (error.code !== 'ENOENT') console.error('Cannot load downloads:', error.message); }
  function list() {
    return items.map(function (item) {
      return {id:item.id, identity:item.identity, state:item.state, received:item.received, total:item.total, error:item.error || '', created:item.created, url:'/download-media/' + item.id + '/media'};
    });
  }
  function check(job) { if (job.cancelled) throw new Error('Загрузка отменена'); }
  function resource(job, address, name, depth) {
    check(job);
    if (depth > 8 || Object.keys(job.resources).length > 20000) return Promise.reject(new Error('Слишком сложный HLS-плейлист'));
    // Only helper-generated proxy paths are accepted, never arbitrary remote URLs.
    if (!/^\/(filmix-stream\/|stream\?)/.test(address) || /[\r\n]/.test(address)) return Promise.reject(new Error('Некорректный адрес видео'));
    return new Promise(function (resolve, reject) {
      var output, received = 0, length = 0, done = false;
      function fail(error) {
        if (done) return; done = true;
        if (output) output.destroy();
        request.destroy(); reject(error);
      }
      var request = http.get(options.base() + address, function (up) {
        if (up.statusCode !== 200) { up.resume(); return fail(new Error('Источник ответил HTTP ' + up.statusCode)); }
        var type = String(up.headers['content-type'] || 'application/octet-stream');
        var playlist = /mpegurl/i.test(type);
        if (/text\/html|application\/json/i.test(type)) { up.resume(); return fail(new Error('Источник вернул ответ вместо видео')); }
        length = Number(up.headers['content-length']) || 0;
        if (name === 'media' && !playlist) job.item.total = length;
        output = fs.createWriteStream(path.join(directory, job.item.id, name), {mode:384});
        output.on('error', fail); up.on('error', fail);
        up.on('aborted', function () { fail(new Error('Соединение прервано')); });
        up.on('data', function (chunk) {
          received += chunk.length; job.item.received += chunk.length;
          if (playlist && received > 2 * 1024 * 1024) fail(new Error('Слишком большой HLS-плейлист'));
        });
        output.on('finish', function () {
          if (done) return;
          if (!received) return fail(new Error('Источник вернул пустой файл'));
          if (length && received !== length) return fail(new Error('Видео скачано не полностью'));
          done = true; resolve({playlist:playlist, type:type});
        });
        up.pipe(output);
      });
      job.request = request;
      request.setTimeout(90000, function () { fail(new Error('Источник не отвечает. Повторите загрузку.')); });
      request.on('error', fail);
    }).then(function (result) {
      check(job);
      job.item.types[name] = result.type;
      if (!result.playlist) return name;
      job.item.total = 0;
      var file = path.join(directory, job.item.id, name), text = fs.readFileSync(file, 'utf8');
      if (text.indexOf('#EXTM3U') !== 0) throw new Error('Некорректный HLS-плейлист');
      if (!/#EXT-X-STREAM-INF:/.test(text) && !/#EXT-X-ENDLIST/.test(text)) throw new Error('Сохранение прямого эфира не поддерживается');
      var lines = text.split(/\r?\n/), chain = Promise.resolve();
      function child(uri) {
        var addressChild = URL.resolve(address, uri);
        if (!/^\/filmix-stream\//.test(addressChild)) throw new Error('Некорректный сегмент HLS');
        if (job.resources[addressChild]) return job.resources[addressChild];
        var childName = 'part-' + Object.keys(job.resources).length;
        job.resources[addressChild] = childName;
        chain = chain.then(function () { return resource(job, addressChild, childName, depth + 1); });
        return childName;
      }
      lines = lines.map(function (line) {
        if (line && line[0] !== '#') return child(line.trim());
        return line.replace(/URI="([^"]+)"/g, function (_, uri) { return 'URI="' + child(uri) + '"'; });
      });
      return chain.then(function () { check(job); fs.writeFileSync(file, lines.join('\n')); return name; });
    });
  }
  function pump() {
    if (active) return;
    var item = items.slice().reverse().find(function (item) { return item.state === 'queued'; });
    if (!item) return;
    var job = {item:item, cancelled:false, resources:{}};
    active = job; item.state = 'downloading'; item.received = 0; item.total = 0; item.types = {};
    Promise.resolve().then(function () {
      mkdir(directory); mkdir(path.join(directory, item.id));
      persist(); return options.resolve(item.spec);
    }).then(function (address) {
      check(job); job.resources[address] = 'media';
      return resource(job, address, 'media', 0);
    }).then(function () {
      check(job); item.state = 'ready'; item.total = item.received; persist();
    }).catch(function (error) {
      if (!job.cancelled) {
        item.state = 'error';
        item.error = error.code === 'ENOSPC' ? 'Недостаточно места на устройстве. Удалите ненужные файлы.' : error.message;
        try { clean(item); persist(); } catch (e) { console.error('Cannot save download state:', e.message); }
      }
    }).then(function () { active = null; pump(); });
  }
  function add(spec, identity) {
    var duplicate = items.find(function (item) { return JSON.stringify(item.spec) === JSON.stringify(spec); });
    if (duplicate) {
      if (duplicate.state === 'error') {
        clean(duplicate); duplicate.state = 'queued'; duplicate.error = ''; persist(); pump();
      }
      return list().find(function (item) { return item.id === duplicate.id; });
    }
    var item = {id:crypto.randomBytes(16).toString('hex'), spec:spec, identity:identity, state:'queued', received:0, total:0, created:Date.now()};
    items.unshift(item);
    try { persist(); } catch (error) { items.shift(); throw error; }
    pump(); return list().find(function (entry) { return entry.id === item.id; });
  }
  function remove(id) {
    var item = items.find(function (item) { return item.id === id; });
    if (!item) throw new Error('Загрузка не найдена');
    if (active && active.item === item) { active.cancelled = true; if (active.request) active.request.destroy(new Error('Загрузка отменена')); }
    clean(item); items = items.filter(function (entry) { return entry !== item; }); persist(); return {ok:true};
  }
  function retry(id) {
    var item = items.find(function (item) { return item.id === id; });
    if (!item || item.state !== 'error') throw new Error('Загрузка недоступна для повтора');
    return add(item.spec, item.identity);
  }
  function serve(req, res, id, name) {
    var item = items.find(function (item) { return item.id === id && item.state === 'ready'; });
    if (!item || !/^(media|part-\d+)$/.test(name) || !item.types[name]) { res.writeHead(404); res.end(); return; }
    var file = path.join(directory, id, name);
    fs.stat(file, function (error, stat) {
      if (error) { res.writeHead(404); res.end(); return; }
      var start = 0, end = stat.size - 1, range = req.headers.range;
      var headers = {'Content-Type':item.types[name], 'Accept-Ranges':'bytes', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
      if (range) {
        var match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
        } else start = stat.size;
        if (start > end || start >= stat.size) { res.writeHead(416, {'Content-Range':'bytes */' + stat.size}); res.end(); return; }
        headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD' || !stat.size) { res.end(); return; }
      var stream = fs.createReadStream(file, {start:start, end:end});
      stream.on('error', function () { res.destroy(); }); res.on('close', function () { stream.destroy(); }); stream.pipe(res);
    });
  }
  return {list:list, add:add, remove:remove, retry:retry, serve:serve};
};
