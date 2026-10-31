/* ES5: bounded, most-recently-opened watch history, shared with regression tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TWHistory = api;
}(this, function () {
  'use strict';
  var LIMIT = 100, KEY = 'tw-history';
  function key(item) { return String(item.hash).toLowerCase() + ':' + Number(item.fileId); }
  function normalize(items) {
    if (!Array.isArray(items)) return [];
    var seen = {};
    return items.filter(function (h) {
      if (!h || !/^[a-f0-9]{40}$/i.test(h.hash || '') || !(Number(h.fileId) >= 1) || !h.link || !h.title) return false;
      var id = key(h); if (seen[id]) return false; seen[id] = true; return true;
    }).slice(0, LIMIT);
  }
  function upsert(items, item) {
    var id = key(item), previous = null;
    var rest = normalize(items).filter(function (h) { if (key(h) === id) { previous = h; return false; } return true; });
    rest.unshift(Object.assign({}, previous || {}, item));
    return normalize(rest);
  }
  function load(storage) {
    try { return normalize(JSON.parse(storage.getItem(KEY) || '[]')); } catch (_) { return []; }
  }
  function save(storage, items) {
    var result = normalize(items);
    storage.setItem(KEY, JSON.stringify(result));
    return result;
  }
  function progress(item) {
    if(!item)return 0;if(item.completed)return 100;
    var position=Number(item.position),duration=Number(item.duration);
    if(!isFinite(position)||!isFinite(duration)||duration<=0||position<=0)return 0;
    var percent=Math.max(0,Math.min(100,100*position/duration));return percent>=95?100:percent;
  }
  return { progress: progress, limit: LIMIT, normalize: normalize, upsert: upsert, load: load, save: save };
}));
