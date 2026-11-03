'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const filmixCatalog = require('../server/catalog-filmix');

test('Filmix home shows recent updates and filters the current year by type', async () => {
  const pages = {
    1: {items:[{id:'filmix:1',title:'Новый фильм',year:'2026',type:'movie'}, {id:'filmix:2',title:'Старый сериал',year:'2023',type:'tv'}]},
    2: {items:[{id:'filmix:3',title:'Новый сериал',year:'2026',type:'tv'}, {id:'filmix:1',title:'Дубль',year:'2026',type:'movie'}]},
    3: {items:[]}
  };
  const home = await filmixCatalog.home({latest: page => Promise.resolve(pages[page])}, () => Date.UTC(2026, 0, 1));
  assert.equal(home.sections[0].title, 'Последние добавления и обновления Filmix');
  assert.deepEqual(home.sections.map(s => s.items.map(c => c.id)), [['filmix:1','filmix:2','filmix:3'],['filmix:1'],['filmix:3']]);
  assert.equal(home.sections[0].items[0].poster, '/filmix-poster?id=1');
  assert.equal(home.sections[0].items[0].provider, 'filmix');
});

test('Filmix home preserves a partial result and rejects entirely unavailable data', async () => {
  const filmix = {latest: page => page === 1 ? Promise.resolve({items:[{id:'filmix:1',title:'Фильм',year:'2025'}]}) : Promise.reject(new Error('offline'))};
  const home = await filmixCatalog.home(filmix, () => Date.UTC(2026, 0, 1));
  assert.equal(home.partial, true);
  assert.equal(home.sections.length, 1);
  await assert.rejects(filmixCatalog.home({latest: () => Promise.reject(new Error('offline'))}), /недоступен/);
});

test('Filmix details validates ID and adapts the existing detail response', async () => {
  const filmix = {details: id => Promise.resolve({id, title:'Название', originalTitle:'Original', year:'2026', kpRating:'8.1', poster:'/filmix-poster?id=3', description:'Описание'})};
  const details = await filmixCatalog.details(filmix, 'filmix:3');
  assert.equal(details.searchTitle, 'Original');
  assert.equal(details.metadata, '2026 · Кинопоиск 8.1');
  assert.equal(details.provider, 'filmix');
  await assert.rejects(filmixCatalog.details(filmix, 'filmix:../../x'), /Некорректная/);
});
