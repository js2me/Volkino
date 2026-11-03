'use strict';

// The existing Filmix adapter owns authentication and its poster proxy.
var catalog = require('./catalog');

function card(item) {
  if (!item || !/^filmix:\d{1,10}$/.test(String(item.id))) return null;
  var id = Number(String(item.id).slice(7));
  if (id < 1 || id > 2147483647) return null;
  var title = catalog.text(item.title).slice(0, 500);
  if (!title) return null;
  return {
    id: 'filmix:' + id,
    provider: 'filmix',
    title: title,
    poster: '/filmix-poster?id=' + id,
    rating: '',
    year: /^\d{4}$/.test(String(item.year)) ? String(item.year) : '',
    type: item.type === 'tv' ? 'tv' : 'movie',
    metadata: ''
  };
}

function home(filmix, now) {
  now = now || Date.now;
  var time = now(), year = String(new Date(time).getUTCFullYear()), failures = 0;
  // Recent publications include updates to older titles; check year locally.
  return Promise.all([1, 2, 3].map(function(page) {
    return Promise.resolve().then(function(){ return filmix.latest(page); }).catch(function(){
      failures++;
      return {items: []};
    });
  })).then(function(pages) {
    var seen = {}, all = [];
    pages.forEach(function(page) {
      (Array.isArray(page.items) ? page.items : []).forEach(function(item) {
        var c = card(item);
        if (c && !seen[c.id]) { seen[c.id] = true; all.push(c); }
      });
    });
    var sections = [
      {id:'popular', title:'Последние добавления и обновления Filmix', items:all.slice(0, 18)},
      {id:'movies', title:'Фильмы ' + year + ' · обновления Filmix', items:all.filter(function(c){return c.type === 'movie' && c.year === year;}).slice(0, 18)},
      {id:'series', title:'Сериалы ' + year + ' · обновления Filmix', items:all.filter(function(c){return c.type === 'tv' && c.year === year;}).slice(0, 18)}
    ].filter(function(section){ return section.items.length; });
    if (!sections.length) throw new Error('Каталог Filmix временно недоступен.');
    return {sections:sections, updatedAt:time, partial:failures > 0 || pages.some(function(p){return !!p.stale;}), source:'Filmix'};
  });
}

function details(filmix, key) {
  var match = String(key || '').match(/^filmix:(\d{1,10})$/), id = match && Number(match[1]);
  if (!id || id > 2147483647) return Promise.reject(new Error('Некорректная карточка Filmix'));
  return filmix.details(id).then(function(d) {
    if (!d || !d.title) throw new Error('Filmix не вернул описание фильма');
    var metadata = [d.year, d.kpRating ? 'Кинопоиск ' + d.kpRating : '', d.imdbRating ? 'IMDb ' + d.imdbRating : ''].filter(Boolean).join(' · ');
    return {id:'filmix:' + id, provider:'filmix', title:catalog.text(d.title), searchTitle:catalog.text(d.originalTitle || d.title), poster:d.poster || '', description:catalog.text(d.description), year:String(d.year || ''), metadata:metadata};
  });
}

module.exports = {card:card, home:home, details:details};
