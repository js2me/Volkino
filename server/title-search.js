'use strict';

// Context belongs to the selected work, never to a previous free-text search.
function normalize(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е')
    .replace(/&/g, ' and ').replace(/[^a-zа-я0-9\u00c0-\u024f]+/g, ' ').trim();
}
function context(q) {
  var title = String(q.title || '').trim().slice(0, 160);
  if (!title) return null;
  return {title:title, originalTitle:String(q.originalTitle || '').trim().slice(0,160),
    searchTitle:String(q.q || '').trim().slice(0,160),
    year:/^(19|20)\d{2}$/.test(String(q.year)) ? Number(q.year) : 0,
    type:q.type === 'tv' ? 'tv' : 'movie'};
}
function titles(c) {
  var seen = Object.create(null);
  return [c.originalTitle, c.searchTitle, c.title].filter(function(t) {
    var key = normalize(t);
    if (key.length < 2 || seen[key]) return false;
    seen[key] = true; return true;
  });
}
function score(item, c, torrent) {
  var names = [item.originalTitle, item.title].filter(Boolean).map(normalize);
  var aliases = titles(c).map(normalize), best = 0;
  names.forEach(function(name) {
    aliases.forEach(function(alias) {
      if (name === alias) best = Math.max(best, 100);
      // Release names carry years, translations and codec tags after the title.
      else if (torrent && (' ' + name + ' ').indexOf(' ' + alias + ' ') >= 0) {
        // A title buried in a different work's name is not a reliable match.
        var raw = String(item.title || ''), parts = raw.split(/\s*\/\s*|\s*\|\s*/);
        if (parts.some(function(part) {
          var name = normalize(part);
          if (name === alias) return true;
          if (name.indexOf(alias + ' ') !== 0) return false;
          var suffix = name.slice(alias.length + 1);
          return /^(?:19\d{2}|20\d{2}|s\d{1,2}(?:e\d{1,3})?|сезон[а-я]*|сери[яий]*|фильм|web[ a-z]*|blu[ a-z]*|bdrip|brrip|dvdrip|hdtv|hdrip|remux|dvd[59]?|1080[pi]?|2160[pi]?|720p?|4k|hevc|x26[45]|h26[45]|avc|дб|д|пм|пд|лм|ло|ст|sub|rus|eng|d|p|l)(?: |$)/.test(suffix);
        })) best = Math.max(best, 80);
      }
    });
  });
  if (!best) return 0;
  var years = torrent ? (String(item.title).match(/\b(?:19|20)\d{2}\b/g) || []).map(Number) : [Number(item.year)||0];
  // Series packs can contain later seasons; the premiere year is not required.
  if (c.year && (!torrent || c.type !== 'tv') && years.some(Boolean) && years.indexOf(c.year) < 0) return 0;
  if (item.type && item.type !== c.type) return 0;
  if (c.type === 'movie' && torrent && /\bS\d{1,2}(?:E\d{1,3})?\b|сезон[а-я]*\s*\d|\d+\s*из\s*\d+/i.test(item.title)) return 0;
  if (c.year && years.indexOf(c.year) >= 0) best += 20;
  return best;
}
function find(c, load, torrent) {
  var queries = titles(c), failures = [], responses = [];
  return Promise.all(queries.map(function(query) {
    return Promise.resolve().then(function(){return load(query);}).then(function(data){responses.push(data);return data.results || [];},function(e){failures.push(e);return [];});
  })).then(function(lists) {
    if (!responses.length && failures.length) throw failures[0];
    var seen = Object.create(null), ranked = [];
    lists.forEach(function(list) { list.forEach(function(item) {
      var key = torrent ? item.magnet : item.id, rank = score(item,c,torrent);
      if (!rank || seen[key]) return;
      seen[key] = true; ranked.push({item:item, rank:rank});
    }); });
    ranked.sort(function(a,b){return b.rank-a.rank || (torrent ? Number(b.item.seeders||0)-Number(a.item.seeders||0) : 0);});
    return Object.assign({}, responses[0] || {}, {results:ranked.map(function(r){return r.item;}),hint:ranked.length?'':'Совпадений по названию и году не найдено.'});
  });
}
module.exports = {context:context, titles:titles, normalize:normalize, score:score, find:find};
