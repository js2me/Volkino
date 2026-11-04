'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const browse = require('../server/catalog-browse');

test('Filmix owns genre/year filters, forwards pagination and never calls VilkaDB', async () => {
  let query;
  const api = browse.create({
    vilkadb: {
      browse() {
        throw Error('VilkaDB must not be called');
      },
    },
    filmix: {
      catalog(q) {
        query = q;
        return Promise.resolve([
          {
            id: 12,
            title: 'Фильм',
            year: 2024,
            rating: 12000,
            original_title: 'Movie',
          },
        ]);
      },
    },
  });
  const result = await api.browse('filmix', {
    type: 'tv',
    genre: 'g13',
    year: '2024',
    sort: 'newest',
    page: 2,
  });
  assert.deepEqual(query, {
    filter: 's7-g13-y2024',
    orderby: 'year',
    orderdir: 'desc',
    page: 2,
  });
  assert.equal(result.items[0].id, 'filmix:12');
  assert.equal(result.items[0].type, 'tv');
  assert.equal(result.items[0].rating, '');
  assert.equal(result.items[0].searchTitle, 'Movie');
  assert.equal(result.provider, 'filmix');
  assert.equal(result.hasMore, false);
  assert.throws(() => api.browse('filmix', { genre: '28' }), /фильтр/);
  assert.throws(
    () => api.browse('filmix', { year: '2024&host=evil' }),
    /фильтр/,
  );
});

test('external adapters use their native capabilities and page sizes', async () => {
  const urls = [];
  const api = browse.create({
    fetchJSON: async (url) => {
      urls.push(new URL(url));
      if (url.includes('cub.best'))
        return {
          results: [{ id: 10, title: 'Movie', release_date: '2024-01-01' }],
          total: 3,
        };
      if (url.includes('strem.io'))
        return {
          metas: Array.from({ length: 50 }, (_, i) => ({
            id: 'tt' + (i + 1),
            name: 'Movie',
          })),
        };
      return {
        data: {
          movies: [
            { imdb_code: 'tt123', title: 'Movie', year: 2024, rating: 8 },
          ],
          movie_count: 100,
        },
      };
    },
  });
  const cub = await api.browse('cub', { year: '2024', page: 2 });
  assert.equal(urls[0].searchParams.get('airdate'), '2024');
  assert.equal(urls[0].searchParams.get('sort'), 'now');
  assert.equal(cub.hasMore, true);
  const cinemeta = await api.browse('cinemeta', {
    type: 'tv',
    genre: 'Action',
    sort: 'rating',
    page: 2,
  });
  assert.match(
    urls[1].pathname,
    /series\/imdbRating\/genre=Action&skip=50\.json$/,
  );
  assert.equal(cinemeta.hasMore, true);
  const yts = await api.browse('yts', {
    genre: 'Action',
    minRating: 7,
    sort: 'rating',
    page: 2,
  });
  assert.equal(urls[2].searchParams.get('minimum_rating'), '7');
  assert.equal(urls[2].searchParams.get('page'), '2');
  assert.equal(yts.hasMore, true);
  assert.throws(() => api.browse('yts', { type: 'tv' }), /фильтр/);
  assert.throws(() => api.browse('cub', { sort: 'rating' }), /фильтр/);
  assert.throws(() => api.browse('missing', {}), /источник/);
});

test('a new adapter can add a filter without changing the page contract; caches are isolated', async () => {
  let identity = 'account-a',
    calls = 0;
  const source = {
    id: 'new-provider',
    name: 'New provider',
    note: '',
    fields: [
      {
        key: 'country',
        label: 'Страна',
        options: [
          { id: 'us', name: 'США' },
          { id: 'fr', name: 'Франция' },
        ],
        defaultValue: 'us',
      },
    ],
  };
  const api = browse.create({
    sources: [source],
    identity: () => identity,
    adapters: {
      'new-provider': async (filters) => {
        calls++;
        return {
          items: [{ id: filters.country, title: 'Movie' }],
          hasMore: true,
        };
      },
    },
  });
  const [a, b] = await Promise.all([
    api.browse('new-provider', {}),
    api.browse('new-provider', {}),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a.filters.country, 'us');
  await api.browse('new-provider', { country: 'fr' });
  assert.equal(calls, 2);
  identity = 'account-b';
  await api.browse('new-provider', {});
  assert.equal(calls, 3);
  assert.equal(api.sources()[0].fields[0].key, 'country');
});

test('YTS can report an empty catalogue without a movies array', async () => {
  const api = browse.create({
    fetchJSON: async () => ({ status: 'ok', data: { movie_count: 0 } }),
  });
  const result = await api.browse('yts', { genre: 'Action', minRating: 9 });
  assert.deepEqual(result.items, []);
  assert.equal(result.hasMore, false);
});
