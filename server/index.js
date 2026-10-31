'use strict';
// Node 8.12-compatible; no runtime dependencies. The TV runs this helper locally.
var http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), URL = require('url'), crypto = require('crypto');
var core = require('./core'),catalogModule=require('./catalog');
var PORT = Number(process.env.PORT || 32190), HOST = process.env.HOST || '127.0.0.1';
var APP = path.resolve(__dirname, '../app');
if (!fs.existsSync(path.join(APP, 'index.html'))) APP = path.resolve(__dirname, '..');
var CONFIG = process.env.TW_CONFIG || path.resolve(__dirname, '../config.json');
var defaults = { torrserverMode: 'external', torrserverUrl: '', torrserverUsername: '', torrserverPassword: '', searchProvider: 'vilkadb', jacredUrl: '', jacredApiKey: '' };
var config = Object.assign({}, defaults);
try { config = Object.assign(config, JSON.parse(fs.readFileSync(CONFIG, 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') console.error('Cannot load config:', e.message); }
if (process.env.TORRSERVER_URL) config.torrserverUrl = core.validBase(process.env.TORRSERVER_URL);
var localTS = require('./local-torrserver').create({directory: path.dirname(CONFIG), port: process.env.TW_TORRSERVER_PORT});
function tsBase() { return config.torrserverMode === 'local' ? localTS.base : config.torrserverUrl; }
function tsAuth() { return config.torrserverMode === 'local' ? null : {username: config.torrserverUsername, password: config.torrserverPassword}; }
var token = crypto.randomBytes(24).toString('hex');
var catalog=catalogModule.create({cacheFile:path.join(path.dirname(CONFIG),'catalog-cache.json'),fetchPage:function(endpoint){return request(catalogModule.origin,endpoint,null,null,14000).then(JSON.parse);}});
var imageCache={},imageBytes=0;
function request(base, endpoint, data, auth, timeout) {
  return new Promise(function (resolve, reject) {
    if (!base) return reject(new Error('Сначала укажите адрес TorrServer в настройках'));
    var u = URL.parse(base + endpoint), body = data == null ? null : JSON.stringify(data), headers = { 'Accept': 'application/json' };
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    if (auth && auth.username) headers.Authorization = 'Basic ' + Buffer.from(auth.username + ':' + (auth.password || '')).toString('base64');
    var req = (u.protocol === 'https:' ? https : http).request(Object.assign({}, u, { method: body ? 'POST' : 'GET', headers: headers }), function (res) {
      var chunks = [], length = 0;
      res.on('data', function (c) { length += c.length; if (length > 12 * 1024 * 1024) { req.destroy(); reject(new Error('Ответ сервера слишком большой')); } else chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('Сервер ответил HTTP ' + res.statusCode + (res.statusCode === 401 ? ': проверьте логин и пароль' : '')));
        resolve(text);
      });
      res.on('error', reject);
    });
    req.setTimeout(timeout || 20000, function () { req.destroy(new Error('Сервер не ответил вовремя')); });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
function ts(endpoint, data, timeout) { return request(tsBase(), endpoint, data, tsAuth(), timeout); }
function tsJSON(endpoint, data) { return ts(endpoint, data).then(function (s) { try { return JSON.parse(s); } catch (_) { throw new Error('TorrServer вернул некорректный JSON'); } }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); }
function body(req) {
  return new Promise(function (resolve, reject) {
    var data = ''; req.on('data', function (chunk) { data += chunk; if (data.length > 65536) { reject(new Error('Слишком большой запрос')); req.destroy(); } });
    req.on('end', function () { try { resolve(JSON.parse(data || '{}')); } catch (_) { reject(new Error('Некорректный JSON')); } }); req.on('error', reject);
  });
}
function publicConfig() { var out = Object.assign({}, config); delete out.torrserverPassword; delete out.jacredApiKey; out.hasPassword = !!config.torrserverPassword; out.hasApiKey = !!config.jacredApiKey; return out; }
function validateConfig(data) {
  var next = Object.assign({}, config);
  ['torrserverMode','torrserverUrl','torrserverUsername','torrserverPassword','searchProvider','jacredUrl','jacredApiKey'].forEach(function (key) { if (typeof data[key] === 'string') next[key] = key === 'torrserverPassword' || key === 'jacredApiKey' ? data[key] : data[key].trim(); });
  if (['external', 'local'].indexOf(next.torrserverMode) < 0) throw new Error('Неизвестный режим TorrServer');
  next.torrserverUrl = core.validBase(next.torrserverUrl, true); next.jacredUrl = core.validBase(next.jacredUrl, true);
  if (['vilkadb','torrserver','torznab','jacred'].indexOf(next.searchProvider) < 0) throw new Error('Неизвестный источник поиска');
  return next;
}
function saveConfig(data) {
  var next = validateConfig(data);
  // Credentials stay in the helper config, outside the app's browser storage.
  fs.writeFileSync(CONFIG + '.tmp', JSON.stringify(next, null, 2), { mode: 384 }); fs.renameSync(CONFIG + '.tmp', CONFIG); config = next;
}
function search(query) {
  query = query.trim(); if (query.length < 2 || query.length > 160) throw new Error('Введите от 2 до 160 символов');
  if (config.searchProvider === 'vilkadb') {
    return request('http://fxmlparsers.in.net', '/VilkaDB/?id=tmdb&torr_only=1&torr=' + encodeURIComponent(query)).then(JSON.parse).then(function (r) {
      return { results: core.vilkaResults(r), provider: 'VilkaDB' };
    });
  }
  if (config.searchProvider === 'jacred') {
    if (!config.jacredUrl) throw new Error('Укажите адрес Jacred в настройках');
    return request(config.jacredUrl, '/api/v1.0/torrents?search=' + encodeURIComponent(query) + (config.jacredApiKey ? '&apikey=' + encodeURIComponent(config.jacredApiKey) : '')).then(JSON.parse).then(function (r) { return { results: core.normalize(r.Results || r.results || r), provider: 'Jacred' }; });
  }
  return tsJSON('/settings', { action: 'get' }).then(function (s) {
    var torznab = config.searchProvider === 'torznab';
    if (!s[torznab ? 'EnableTorznabSearch' : 'EnableRutorSearch']) throw new Error(torznab ? 'Включите Torznab и добавьте индексаторы в настройках TorrServer' : 'Поиск Rutor выключен в TorrServer. Откройте настройки приложения и включите поиск.');
    return ts((torznab ? '/torznab' : '') + '/search/?query=' + encodeURIComponent(query)).then(JSON.parse).then(function (r) {
      return { results: core.normalize(r), provider: torznab ? 'Torznab' : 'Rutor', hint: !r.length ? 'Ничего не найдено. После первого включения Rutor дождитесь загрузки индекса и повторите поиск.' : '' };
    });
  });
}
function stream(req, res, q) {
  var endpoint = core.streamPath(q.hash, q.index, false), u = URL.parse(tsBase() + endpoint), headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  if (tsAuth() && config.torrserverUsername) headers.Authorization = 'Basic ' + Buffer.from(config.torrserverUsername + ':' + config.torrserverPassword).toString('base64');
  var proxy = (u.protocol === 'https:' ? https : http).request(Object.assign({}, u, { method: req.method, headers: headers }), function (up) {
    var out = { 'Cache-Control': 'no-store' };
    ['content-type','content-length','content-range','accept-ranges'].forEach(function (h) { if (up.headers[h]) out[h] = up.headers[h]; });
    res.writeHead(up.statusCode, out); up.pipe(res);
    up.on('error', function () { res.destroy(); });
  });
  proxy.setTimeout(90000, function () { proxy.destroy(); if (!res.headersSent) json(res, 504, { error: 'Таймаут TorrServer' }); else res.destroy(); });
  proxy.on('error', function (e) { if (!res.headersSent) json(res, 502, { error: e.message }); else res.destroy(); });
  res.on('close', function () { proxy.destroy(); }); proxy.end();
}
function sendPoster(req,res,p){
  if(!/^\/t\/p\/w200\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(p||'')){json(res,400,{error:'Некорректный постер'});return;}
  function send(data,type){res.writeHead(200,{'Content-Type':type,'Content-Length':data.length,'Cache-Control':'public, max-age=10800','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}
  if(imageCache[p]){imageCache[p].at=Date.now();send(imageCache[p].data,imageCache[p].type);return;}
  var remote=http.get(catalogModule.origin+'/VilkaDB/?wimg='+encodeURIComponent('http://image.tmdb.org'+p),function(up){
    var type=String(up.headers['content-type']||'').split(';')[0];
    if(up.statusCode!==200||!/^image\/(jpeg|png|webp)$/.test(type)){up.resume();json(res,502,{error:'Постер недоступен'});return;}
    var chunks=[],length=0,failed=false;up.on('data',function(c){length+=c.length;if(length>1024*1024){failed=true;remote.destroy();if(!res.headersSent)json(res,502,{error:'Постер слишком большой'});}else chunks.push(c);});
    up.on('end',function(){if(failed)return;var data=Buffer.concat(chunks);while(imageBytes+data.length>6*1024*1024){var keys=Object.keys(imageCache).sort(function(a,b){return imageCache[a].at-imageCache[b].at;});if(!keys.length)break;imageBytes-=imageCache[keys[0]].data.length;delete imageCache[keys[0]];}if(imageCache[p])imageBytes-=imageCache[p].data.length;imageCache[p]={data:data,type:type,at:Date.now()};imageBytes+=data.length;send(data,type);});
    up.on('error',function(){if(!res.headersSent)json(res,502,{error:'Постер недоступен'});});
  });
  remote.setTimeout(10000,function(){remote.destroy();if(!res.headersSent)json(res,504,{error:'Таймаут постера'});});remote.on('error',function(){if(!res.headersSent)json(res,502,{error:'Постер недоступен'});});
}
var server = http.createServer(function (req, res) {
  // Bind locally on TV. Reject DNS rebinding and cross-site state changes.
  var host = (req.headers.host || '').split(':')[0];
  if (HOST === '127.0.0.1' && ['127.0.0.1','localhost'].indexOf(host) < 0) return json(res, 403, { error: 'Недопустимый Host' });
  var parsed = URL.parse(req.url, true), route = parsed.pathname, q = parsed.query;
  if (route === '/api/session' && req.method === 'GET') return json(res, 200, { token: token });
  if (route.indexOf('/api/') === 0 && req.headers['x-app-token'] !== token) return json(res, 403, { error: 'Обновите приложение' });
  Promise.resolve().then(function () {
    if (route === '/api/config' && req.method === 'GET') return publicConfig();
    if (route === '/api/config' && req.method === 'POST') return body(req).then(function (b) {
      if (localTS.busy()) throw new Error('Дождитесь установки или запуска TorrServer');
      var local = (b.torrserverMode || config.torrserverMode) === 'local';
      // Validate before changing process state.
      validateConfig(b);
      return (local ? localTS.start() : localTS.stop()).then(function () { saveConfig(b); return publicConfig(); });
    });
    if (route === '/api/local-server' && req.method === 'GET') return localTS.status();
    if (route === '/api/local-server/start' && req.method === 'POST') return localTS.run(true, function () { saveConfig({torrserverMode: 'local'}); });
    if (route === '/api/local-server/stop' && req.method === 'POST') {
      if (localTS.busy()) throw new Error('Дождитесь установки или запуска TorrServer');
      return localTS.stop().then(function () { saveConfig({torrserverMode: 'external'}); return localTS.status(); });
    }
    if (route === '/api/health' && req.method === 'GET') return ts('/echo', null, 6000).then(function (v) { return { ok: true, version: v.trim(), url: tsBase() }; });
    if (route === '/api/catalog/browse' && req.method === 'GET') return catalog.browse(q);
    if (route === '/api/catalog/home' && req.method === 'GET') return catalog.home();
    if (route === '/api/catalog/item' && req.method === 'GET') return catalog.item(String(q.key||''));
    if (route === '/poster' && (req.method === 'GET'||req.method === 'HEAD')) {sendPoster(req,res,String(q.path||''));return null;}
    if (route === '/api/search' && req.method === 'GET') return search(String(q.q || ''));
    if (route === '/api/enable-search' && req.method === 'POST') return tsJSON('/settings', { action: 'get' }).then(function (s) { if (s.EnableRutorSearch) return { ok: true }; s.EnableRutorSearch = true; return ts('/settings', { action: 'set', sets: s }).then(function () { return { ok: true, message: 'Поиск включён. Первая загрузка индекса может занять несколько минут.' }; }); });
    if (route === '/api/torrents' && req.method === 'GET') return tsJSON('/torrents', { action: 'list' });
    if (route === '/api/add' && req.method === 'POST') return body(req).then(function (b) { return tsJSON('/torrents', { action: 'add', link: core.torrentLink(b.link), title: String(b.title || '').slice(0,500), save_to_db: true }); });
    if (route === '/api/status' && req.method === 'GET') return tsJSON('/torrents', { action: 'get', hash: core.hash(q.hash) }).then(function (s) { return { torrent: s, files: core.files(s) }; });
    if (route === '/api/preload' && req.method === 'POST') return body(req).then(function (b) { return ts(core.streamPath(b.hash, b.index, true), null, 45000).then(JSON.parse); });
    if (route === '/stream' && ['GET','HEAD'].indexOf(req.method) >= 0) { stream(req, res, q); return null; }
    if (route.indexOf('/api/') === 0) { json(res, 404, { error: 'Метод не найден' }); return null; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Метод не поддерживается' }); return null; }
    var assets = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/history.js': 'history.js', '/playback.js': 'playback.js', '/style.css': 'style.css', '/icon.png': 'icon.png' };
    var file = assets[route]; if (!file) { json(res, 404, { error: 'Не найдено' }); return null; }
    var mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self'; frame-ancestors 'none'" });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(path.join(APP, file)).pipe(res);
    return null;
  }).then(function (data) { if (data != null && !res.headersSent) json(res, 200, data); }).catch(function (e) { if (!res.headersSent) json(res, 400, { error: e.message }); });
});
if (config.torrserverMode === 'local') localTS.run(false);
process.once('exit', function () { localTS.kill(); });
['SIGTERM', 'SIGINT'].forEach(function (signal) { process.once(signal, function () { localTS.kill(); server.close(); process.exit(0); }); });
server.listen(PORT, HOST, function () { console.log('TorrMovie: http://' + HOST + ':' + PORT); });
module.exports = server;
