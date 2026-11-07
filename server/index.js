'use strict';
// Node 8.12-compatible; no runtime dependencies. The TV runs this helper locally.
var http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), URL = require('url'), crypto = require('crypto');
var core = require('./core'),catalogModule=require('./catalog'),filmixModule=require('./filmix'),catalogHttp=require('./catalog-http'),providerModule=require('./catalog-providers'),catalogFilmix=require('./catalog-filmix');
var PORT = Number(process.env.PORT || 32190), HOST = process.env.HOST || '127.0.0.1';
var APP = path.resolve(__dirname, '../app');
if (!fs.existsSync(path.join(APP, 'index.html'))) APP = path.resolve(__dirname, '..');
var CONFIG = process.env.TW_CONFIG || path.resolve(__dirname, '../config.json');
var defaults = { seekStep: 30, audioFix: 'off', torrserverMode: 'local', torrserverUrl: '', torrserverUsername: '', torrserverPassword: '', searchProvider: 'vilkadb', catalogProvider:'vilkadb', jacredUrl: '', jacredApiKey: '', filmixApiUrl: filmixModule.defaultApi, filmixSiteUrl: filmixModule.defaultSite, filmixToken: '', filmixDeviceId: '' };
Object.assign(defaults,{filmixTransport:'mobile',filmixWebHash:'',filmixWebAccessToken:'',filmixWebRefreshToken:'',filmixWebUserAgent:''});
var localSettingRanges = {localCacheSize: [32, 8, 2048, 'Размер кэша (МиБ)'], localPreloadCache: [50, 1, 100, 'Предзагрузка (%)'], localConnectionsLimit: [20, 1, 500, 'Лимит соединений']};
Object.keys(localSettingRanges).forEach(function (key) { defaults[key] = localSettingRanges[key][0]; });
var config=Object.assign({},defaults);
var savedConfig = {};
try { savedConfig = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) || {}; config = Object.assign(config, savedConfig); } catch (e) { if (e.code !== 'ENOENT') console.error('Cannot load config:', e.message); }
// Older configurations and TORRSERVER_URL may specify an external address without a mode.
if (!Object.prototype.hasOwnProperty.call(savedConfig, 'torrserverMode') && (savedConfig.torrserverUrl || process.env.TORRSERVER_URL)) config.torrserverMode = 'external';
if (!validSeekStep(config.seekStep)) config.seekStep=30;
if (['off','moderate','night'].indexOf(config.audioFix)<0) config.audioFix='off';
if (['vilkadb','cub','filmix','cinemeta','yts'].indexOf(config.catalogProvider)<0) config.catalogProvider='vilkadb';
if (process.env.TORRSERVER_URL) config.torrserverUrl = core.validBase(process.env.TORRSERVER_URL);
Object.keys(localSettingRanges).forEach(function (key) { if (!validLocalSetting(key, config[key])) config[key] = defaults[key]; });
var localTS = require('./local-torrserver').create({directory: path.dirname(CONFIG), port: process.env.TW_TORRSERVER_PORT, getSettings: function () { return config; }});
function tsBase() { return config.torrserverMode === 'local' ? localTS.base : config.torrserverUrl; }
function tsAuth() { return config.torrserverMode === 'local' ? null : {username: config.torrserverUsername, password: config.torrserverPassword}; }
var token = crypto.randomBytes(24).toString('hex');
var catalog=catalogModule.create({cacheFile:path.join(path.dirname(CONFIG),'catalog-cache.json'),fetchPage:function(endpoint){return request(catalogModule.origin,endpoint,null,null,14000).then(JSON.parse);}});
var filmix=filmixModule.create({getConfig:function(){return config;},saveConfig:saveConfig});
var providers=providerModule.create({fetchJSON:catalogHttp.json});
var catalogBrowse=require('./catalog-browse').create({vilkadb:catalog,filmix:filmix,fetchJSON:catalogHttp.json,identity:function(provider){return provider==='filmix'?(config.filmixApiUrl||'')+'|'+(config.filmixToken||''):'';}});
if(!catalogBrowse.sources().some(function(source){return source.id===config.catalogBrowseProvider;}))config.catalogBrowseProvider='filmix';
var downloads = require('./downloads').create({
  directory:path.join(path.dirname(CONFIG), 'downloads'),
  base:function () { return 'http://127.0.0.1:' + server.address().port; },
  resolve:function (spec) {
    if (spec.source === 'filmix') return filmix.grant(spec).then(function (grant) { return grant.url; });
    return Promise.resolve('/stream?hash=' + spec.hash + '&index=' + spec.fileId);
  }
});
function saveDownload(b) {
  var spec, identity;
  if (b.source === 'filmix') {
    spec = {source:'filmix', id:Number(b.id), fileId:Number(b.fileId), voice:String(b.voice || ''), quality:Number(b.quality)};
    return filmix.post(spec.id).then(function (post) {
      var file = post.files.find(function (file) { return file.id === spec.fileId && file.voice === spec.voice; });
      if (!file) throw new Error('Видео не найдено');
      spec.quality = (file.qualities || []).filter(function (q) { return q <= spec.quality; }).sort(function (a,b) { return b-a; })[0];
      if (!spec.quality) throw new Error('Выберите доступное качество');
      identity = {source:'filmix', hash:'', filmixId:spec.id, fileId:file.id, fileName:file.path, title:file.path.split('/').pop(), torrentTitle:post.title, link:'filmix:' + spec.id, voice:file.voice, season:file.season, quality:spec.quality};
      return downloads.add(spec, identity);
    });
  }
  spec = {source:'torrent', hash:core.hash(b.hash), fileId:Number(b.fileId)};
  return tsJSON('/torrents', {action:'get', hash:spec.hash}).then(function (torrent) {
    var file = core.files(torrent).find(function (file) { return file.id === spec.fileId; });
    if (!file) throw new Error('Видео не найдено');
    identity = {hash:spec.hash, fileId:file.id, fileName:file.path, title:file.path.split('/').pop(), torrentTitle:torrent.title || torrent.name || '', link:'magnet:?xt=urn:btih:' + spec.hash};
    return downloads.add(spec, identity);
  });
}
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
function publicConfig() { var out = Object.assign({}, config); delete out.torrserverPassword; delete out.jacredApiKey; delete out.filmixToken; delete out.filmixDeviceId; delete out.filmixWebHash; delete out.filmixWebAccessToken; delete out.filmixWebRefreshToken; out.hasFilmixToken=config.filmixTransport==='web'?!!config.filmixWebAccessToken:!!config.filmixToken; out.hasPassword = !!config.torrserverPassword; out.hasApiKey = !!config.jacredApiKey; return out; }
function validSeekStep(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 1 && value <= 3600; }
function validLocalSetting(key, value) { var range = localSettingRanges[key]; return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= range[1] && value <= range[2]; }
function validateConfig(data) {
  var next = Object.assign({}, config);
  Object.keys(localSettingRanges).forEach(function (key) {
    if (data[key] === undefined) return;
    var range = localSettingRanges[key];
    if (!validLocalSetting(key, data[key])) throw new Error(range[3] + ': введите целое число от ' + range[1] + ' до ' + range[2]);
    next[key] = data[key];
  });
  if (data.seekStep !== undefined) {
    if (!validSeekStep(data.seekStep)) throw new Error('Шаг перемотки должен быть целым числом от 1 до 3600 секунд');
    next.seekStep = data.seekStep;
  }
  ['audioFix','torrserverMode','torrserverUrl','torrserverUsername','torrserverPassword','searchProvider','catalogProvider','catalogBrowseProvider','jacredUrl','jacredApiKey','filmixApiUrl','filmixSiteUrl','filmixToken','filmixDeviceId'].forEach(function (key) { if (typeof data[key] === 'string') next[key] = key === 'torrserverPassword' || key === 'jacredApiKey' ? data[key] : data[key].trim(); });
  if(!catalogBrowse.sources().some(function(source){return source.id===next.catalogBrowseProvider;}))throw new Error('Неизвестный источник каталога');
  ['filmixTransport','filmixWebHash','filmixWebAccessToken','filmixWebRefreshToken','filmixWebUserAgent'].forEach(function(key){if(typeof data[key]==='string')next[key]=data[key].trim();});
  if(['web','mobile'].indexOf(next.filmixTransport)<0)throw new Error('Неизвестный способ подключения Filmix');
  ['filmixWebHash','filmixWebAccessToken','filmixWebRefreshToken','filmixWebUserAgent'].forEach(function(key){if(next[key].length>16384||/[\r\n]/.test(next[key]))throw new Error('Некорректная сессия Filmix TV');});
  if ((data.audioFix!==undefined&&typeof data.audioFix!=='string')||['off','moderate','night'].indexOf(next.audioFix)<0) throw new Error('Неизвестный режим автофикса звука');
  if (['external', 'local'].indexOf(next.torrserverMode) < 0) throw new Error('Неизвестный режим TorrServer');
  next.torrserverUrl = core.validBase(next.torrserverUrl, true); next.jacredUrl = core.validBase(next.jacredUrl, true);
  next.filmixApiUrl=core.validBase(next.filmixApiUrl||filmixModule.defaultApi); next.filmixSiteUrl=core.validBase(next.filmixSiteUrl||filmixModule.defaultSite);
  if(next.filmixToken.length>512||next.filmixDeviceId&&!/^[a-f0-9]{16}$/.test(next.filmixDeviceId))throw new Error('Некорректные настройки Filmix');
  if (['vilkadb','torrserver','torznab','jacred'].indexOf(next.searchProvider) < 0) throw new Error('Неизвестный источник поиска');
  if ((data.catalogProvider!==undefined&&typeof data.catalogProvider!=='string')||['vilkadb','cub','filmix','cinemeta','yts'].indexOf(next.catalogProvider)<0) throw new Error('Неизвестный источник подборок');
  return next;
}
function saveConfig(data) {
  var next = validateConfig(data);
  var clearFilmix = next.filmixApiUrl!==config.filmixApiUrl || next.filmixToken!==config.filmixToken || next.filmixTransport!==config.filmixTransport || next.filmixWebAccessToken!==config.filmixWebAccessToken;
  // Credentials stay in the helper config, outside the app's browser storage.
  fs.writeFileSync(CONFIG + '.tmp', JSON.stringify(next, null, 2), { mode: 384 }); fs.renameSync(CONFIG + '.tmp', CONFIG); config = next;
  if(clearFilmix && catalog)catalog.clearHome('filmix');
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
  if (route.indexOf('/api/') === 0 && req.headers['x-app-token'] !== token) return json(res, 403, { code: 'SESSION_EXPIRED', error: 'Сессия устарела. Откройте приложение заново.' });
  Promise.resolve().then(function () {
    if (route === '/api/downloads' && req.method === 'GET') return {items:downloads.list()};
    if (route === '/api/downloads/save' && req.method === 'POST') return body(req).then(saveDownload);
    if (route === '/api/downloads/remove' && req.method === 'POST') return body(req).then(function (b) { return downloads.remove(b.id); });
    if (route === '/api/downloads/retry' && req.method === 'POST') return body(req).then(function (b) { return downloads.retry(b.id); });
    if (route.indexOf('/download-media/') === 0 && ['GET','HEAD'].indexOf(req.method) >= 0) {
      var parts = route.split('/'); downloads.serve(req, res, parts[2], parts[3]); return null;
    }
    if (route === '/api/config' && req.method === 'GET') return publicConfig();
    if (route === '/api/config' && req.method === 'POST') return body(req).then(function (b) {
      var next = validateConfig(b);
      var changed = Object.keys(localSettingRanges).some(function (key) { return next[key] !== config[key]; });
      var switching = next.torrserverMode !== config.torrserverMode;
      if (localTS.busy() && (changed || switching)) throw new Error('Дождитесь установки или запуска TorrServer');
      var restart = changed && config.torrserverMode === 'local' && localTS.status().state === 'running';
      var previous = config;
      return (switching || restart ? localTS.stop() : Promise.resolve()).then(function () {
        saveConfig(b);
        if (next.torrserverMode !== 'local' || !(switching || restart)) return publicConfig();
        return localTS.start().then(publicConfig, function (e) {
          return localTS.stop().then(function () { saveConfig(previous); if (previous.torrserverMode === 'local') localTS.run(false); throw e; });
        });
      });
    });
    if (route === '/api/local-server' && req.method === 'GET') return localTS.status();
    if (route === '/api/local-server/start' && req.method === 'POST') { saveConfig({torrserverMode: 'local'}); return localTS.run(true); }
    if (route === '/api/local-server/stop' && req.method === 'POST') {
      return localTS.stop().then(function () { saveConfig({torrserverMode: 'external'}); return localTS.status(); });
    }
    if (route === '/api/filmix/search' && req.method === 'GET') return filmix.search(q.q);
    if (route === '/api/latest' && req.method === 'GET') {
      if(q.source&&q.source!=='filmix')throw new Error('Последние добавления доступны только для Filmix');
      return filmix.latest(q.page,q.refresh==='1');
    }
    if (route === '/api/filmix/post' && req.method === 'GET') return filmix.post(q.id);
    if (route === '/api/filmix/details' && req.method === 'GET') return filmix.details(q.id);
    if (route === '/filmix-poster' && (req.method === 'GET'||req.method === 'HEAD')) {filmix.poster(req,res,q.id);return null;}
    if (route === '/api/filmix/play' && req.method === 'POST') return body(req).then(function(b){return filmix.grant({id:b.id,fileId:b.fileId,voice:String(b.voice||''),quality:b.quality});});
    if (route === '/api/filmix/profile' && req.method === 'GET') return filmix.profile(true);
    if (route === '/api/filmix/auth/start' && req.method === 'POST') return filmix.authStart();
    if (route === '/api/filmix/auth/login' && req.method === 'POST') return body(req).then(function(b){return filmix.login(b.name,b.password);});
    if (route === '/api/filmix/auth/check' && req.method === 'POST') return filmix.authCheck();
    if (route === '/api/filmix/auth/disconnect' && req.method === 'POST') return filmix.disconnect();
    if (route.indexOf('/filmix-stream/')===0 && ['GET','HEAD'].indexOf(req.method)>=0) { filmix.stream(req,res,route.slice('/filmix-stream/'.length)); return null; }
    if (route === '/api/health' && req.method === 'GET') return ts('/echo', null, 6000).then(function (v) { return { ok: true, version: v.trim(), url: tsBase() }; });
    if (route === '/api/catalog/sources' && req.method === 'GET') return {sources:catalogBrowse.sources()};
    if (route === '/api/catalog/browse' && req.method === 'GET') return catalogBrowse.browse(q.provider||config.catalogBrowseProvider,q);
    if (route === '/api/catalog/home' && req.method === 'GET') {var provider=config.catalogProvider;return provider==='vilkadb'?catalog.home():catalog.externalHome(provider,function(){return provider==='filmix'?catalogFilmix.home(filmix):providers.home(provider);});}
    if (route === '/api/catalog/item' && req.method === 'GET') {var key=String(q.key||'');return /^filmix:/.test(key)?catalogFilmix.details(filmix,key):catalog.item(key);}
    if (route === '/catalog-poster' && (req.method === 'GET'||req.method === 'HEAD')) return catalogHttp.poster(req,res,String(q.url||''));
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
    var assets = { '/': 'index.html', '/index.html': 'index.html', '/catalog.js': 'catalog.js', '/catalog.css': 'catalog.css', '/icon.png': 'icon.png', '/wolf.png': 'wolf.png' };
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
server.listen(PORT, HOST, function () { console.log('VolKino: http://' + HOST + ':' + PORT); });
module.exports = server;
