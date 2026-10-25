'use strict';
var url = require('url');
function clean(value) {
  return String(value == null ? '' : value).replace(/\\u([0-9a-f]{4})/gi, function (_, x) { return String.fromCharCode(parseInt(x, 16)); }).replace(/&amp;/g, '&').replace(/\\\//g, '/');
}
function validBase(value, empty) {
  if (!value && empty) return '';
  var parsed = url.parse(String(value || '').trim());
  if (!/^https?:$/.test(parsed.protocol || '') || !parsed.hostname || parsed.auth || parsed.query || parsed.hash) throw new Error('Укажите адрес http://IP:8090 без логина и пароля в URL');
  return url.format(parsed).replace(/\/+$/, '');
}
function torrentLink(value) {
  var link = clean(value).trim();
  if (/^magnet:\?/.test(link) && /[?&]xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})(?:&|$)/i.test(link)) return link;
  if (/^https?:\/\//i.test(link) && !url.parse(link).auth) return link;
  throw new Error('Нужна magnet-ссылка или HTTP(S)-ссылка на .torrent');
}
function normalize(items) {
  if (!Array.isArray(items)) throw new Error('Поиск вернул неизвестный формат данных');
  var seen = {};
  return items.map(function (r) {
    var link = clean(r.Magnet || r.magnet || r.magnetUri || r.magnet_uri || '');
    var hash = clean(r.Hash || r.hash || '');
    if (!link && /^[a-f0-9]{40}$/i.test(hash)) link = 'magnet:?xt=urn:btih:' + hash;
    var title = clean(r.Title || r.title || r.Name || r.name);
    if (!link || !title) return null;
    try { link = torrentLink(link); } catch (_) { return null; }
    var match = link.match(/btih:([a-f0-9]{40}|[a-z2-7]{32})/i);
    var key = match ? match[1].toLowerCase() : link;
    if (seen[key]) return null;
    seen[key] = true;
    return { title: title, magnet: link, hash: hash, size: r.Size || r.size || 0,
      seeders: Number(r.Seed || r.seeders || r.seed || 0), peers: Number(r.Peer || r.peers || r.leechers || 0),
      tracker: clean(r.Tracker || r.tracker || 'Torrent'), date: clean(r.CreateDate || r.createTime || r.publishDate || ''),
      quality: (title.match(/2160p|1080p|1080i|720p|4K|UHD/ig) || [])[0] || '' };
  }).filter(Boolean).sort(function (a, b) { return b.seeders - a.seeders; }).slice(0, 150);
}
function files(status) {
  return (status.file_stats || []).filter(function (f) { return /\.(mkv|mp4|m4v|avi|ts|m2ts|mov|webm|mpg|mpeg|vob|wmv)$/i.test(f.path || ''); }).map(function (f) {
    return { id: f.id, path: f.path, length: f.length };
  }).sort(function (a, b) { return a.path.localeCompare(b.path, undefined, { numeric: true }); });
}
function vilkaResults(page) {
  if (!page || !Array.isArray(page.channels)) throw new Error('VilkaDB вернул неизвестный формат страницы');
  return normalize(page.channels.filter(function (c) { return /^magnet:/i.test(c.stream_url || ''); }).map(function (c) {
    // FXML templates are untrusted presentation markup. Extract plain metadata only.
    var description = clean(c.description).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    var seed = description.match(/Раздают:\s*(\d+)/i), peer = description.match(/Качают:\s*(\d+)/i);
    var size = description.match(/([\d.,]+)\s*(ГБ|МБ|ТБ|GB|MB|TB)/i), tracker = description.match(/rutracker|rutor|kinozal|nnmclub|nnm-club|bitru|toloka/i);
    return { title: clean(c.title), magnet: c.stream_url, size: size ? size[0] : 0, seeders: seed ? Number(seed[1]) : 0, peers: peer ? Number(peer[1]) : 0, tracker: tracker ? tracker[0] : 'VilkaDB' };
  }));
}
function hash(value) {
  if (!/^[a-f0-9]{40}$/i.test(value || '')) throw new Error('Некорректный hash торрента');
  return value;
}
function streamPath(torrentHash, fileId, preload) {
  hash(torrentHash);
  if (!/^\d+$/.test(String(fileId)) || Number(fileId) < 1) throw new Error('Некорректный номер файла');
  return '/stream/video?link=' + encodeURIComponent(torrentHash) + '&index=' + Number(fileId) + (preload ? '&preload&stat' : '&play');
}
module.exports = { clean: clean, validBase: validBase, torrentLink: torrentLink, normalize: normalize, vilkaResults: vilkaResults, files: files, hash: hash, streamPath: streamPath };
