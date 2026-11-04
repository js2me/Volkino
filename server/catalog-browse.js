'use strict';
// Each adapter owns its filter vocabulary and pagination. The page consumes only this contract.
var catalog = require('./catalog'),
  filmixCards = require('./catalog-filmix'),
  external = require('./catalog-providers');
function options(rows) {
  return rows.map(function (row) {
    return { id: String(row[0]), name: row[1] };
  });
}
var types = options([
  ['movie', 'Фильмы'],
  ['tv', 'Сериалы'],
]);
var filmixGenres = options([
  ['g3', 'Боевик'],
  ['g6', 'Комедия'],
  ['g1', 'Драма'],
  ['g8', 'Триллер'],
  ['g2', 'Ужасы'],
  ['g13', 'Фантастика'],
  ['g4', 'Фэнтези'],
  ['g18', 'Детектив'],
  ['g74', 'Приключения'],
  ['g73', 'Семейный'],
  ['g12', 'Мелодрама'],
  ['g15', 'Документальный'],
  ['g76', 'Биография'],
  ['g75', 'Исторический'],
  ['g20', 'Военный'],
  ['g81', 'Вестерн'],
  ['g77', 'Спорт'],
  ['g80', 'Короткометражка'],
  ['g21', 'Аниме'],
]);
var namedGenres = options([
  ['Action', 'Боевик'],
  ['Adventure', 'Приключения'],
  ['Animation', 'Мультфильм'],
  ['Biography', 'Биография'],
  ['Comedy', 'Комедия'],
  ['Crime', 'Криминал'],
  ['Documentary', 'Документальный'],
  ['Drama', 'Драма'],
  ['Family', 'Семейный'],
  ['Fantasy', 'Фэнтези'],
  ['History', 'Исторический'],
  ['Horror', 'Ужасы'],
  ['Mystery', 'Детектив'],
  ['Romance', 'Мелодрама'],
  ['Sci-Fi', 'Фантастика'],
  ['Sport', 'Спорт'],
  ['Thriller', 'Триллер'],
  ['War', 'Военный'],
  ['Western', 'Вестерн'],
]);
function field(key, label, values, value) {
  return {
    key: key,
    label: label,
    options: values,
    defaultValue: value === undefined ? '' : String(value),
  };
}
function genre(values) {
  return Object.assign(
    field('genre', 'Жанр', [{ id: '', name: 'Все жанры' }]),
    { optionsByType: values },
  );
}
function years() {
  var result = [{ id: '', name: 'Все годы' }];
  for (var y = new Date().getUTCFullYear(); y >= 1900; y--)
    result.push({ id: String(y), name: String(y) });
  return field('year', 'Год', result);
}
function sorts(rows) {
  return field('sort', 'Сортировка', options(rows), rows[0][0]);
}
function minimum() {
  return field(
    'minRating',
    'Рейтинг от',
    options([
      [0, 'Любой'],
      [5, 'От 5'],
      [6, 'От 6'],
      [7, 'От 7'],
      [8, 'От 8'],
      [9, 'От 9'],
    ]),
    0,
  );
}
function definitions() {
  return [
    {
      id: 'filmix',
      name: 'Filmix',
      note: 'Фильмы и сериалы с прямым просмотром через Filmix.',
      fields: [
        field('type', 'Тип', types, 'movie'),
        genre({ movie: filmixGenres, tv: filmixGenres }),
        years(),
        sorts([
          ['popular', 'Популярное'],
          ['newest', 'Новее'],
        ]),
      ],
    },
    {
      id: 'vilkadb',
      name: 'VilkaDB',
      note: 'Сортировка — в пределах загруженной страницы.',
      fields: [
        field('type', 'Тип', types, 'movie'),
        genre(catalog.genreOptions()),
        minimum(),
        years(),
        sorts([
          ['popular', 'Популярное'],
          ['newest', 'Новее'],
          ['rating', 'По рейтингу'],
        ]),
      ],
    },
    {
      id: 'cub',
      name: 'CUB',
      note: 'Последние добавления CUB с выбором типа и года.',
      fields: [
        field('type', 'Тип', types, 'movie'),
        years(),
        sorts([['newest', 'Последние добавления']]),
      ],
    },
    {
      id: 'cinemeta',
      name: 'Cinemeta',
      note: 'Международный каталог. Названия преимущественно на английском языке.',
      fields: [
        field('type', 'Тип', types, 'movie'),
        genre({
          movie: namedGenres,
          tv: namedGenres.concat(
            options([
              ['Reality-TV', 'Реалити-шоу'],
              ['Talk-Show', 'Ток-шоу'],
              ['Game-Show', 'Телеигра'],
            ]),
          ),
        }),
        sorts([
          ['popular', 'Популярное'],
          ['rating', 'По рейтингу IMDb'],
        ]),
      ],
    },
    {
      id: 'yts',
      name: 'YTS',
      note: 'Каталог фильмов YTS. Популярность — по числу загрузок.',
      fields: [
        field('type', 'Тип', types.slice(0, 1), 'movie'),
        genre({ movie: namedGenres, tv: [] }),
        minimum(),
        sorts([
          ['popular', 'Популярное'],
          ['newest', 'Новее'],
          ['rating', 'По рейтингу IMDb'],
        ]),
      ],
    },
  ];
}
function normalize(source, query) {
  var f = {
    type: 'movie',
    genre: '',
    minRating: 0,
    year: '',
    sort: 'popular',
    page: query.page === undefined ? 1 : Number(query.page),
  };
  if (
    !isFinite(f.page) ||
    Math.floor(f.page) !== f.page ||
    f.page < 1 ||
    f.page > 500
  )
    throw new Error('Некорректная страница каталога');
  source.fields.forEach(function (control) {
    var values = control.optionsByType
      ? control.options.concat(control.optionsByType[f.type])
      : control.options;
    var value =
      query[control.key] === undefined
        ? control.defaultValue
        : String(query[control.key]);
    if (
      !values.some(function (option) {
        return option.id === value;
      })
    )
      throw new Error('Некорректный фильтр: ' + control.label);
    f[control.key] = control.key === 'minRating' ? Number(value) : value;
  });
  return f;
}
function create(options) {
  var definitionsList = options.sources || definitions(),
    cache = {},
    pending = {};
  var loaders = {
    vilkadb: function (f) {
      return options.vilkadb.browse(f);
    },
    filmix: function (f) {
      var filter =
        (f.type === 'tv' ? 's7' : 's0') +
        (f.genre ? '-' + f.genre : '') +
        (f.year ? '-y' + f.year : '');
      return options.filmix
        .catalog({
          filter: filter,
          orderby: f.sort === 'newest' ? 'year' : 'rating',
          orderdir: 'desc',
          page: f.page,
        })
        .then(function (rows) {
          if (!Array.isArray(rows)) throw new Error('Filmix не вернул каталог');
          return {
            items: rows
              .map(function (row) {
                if (!row || typeof row !== 'object') return null;
                var item = filmixCards.card({
                  id: 'filmix:' + row.id,
                  title: row.title,
                  year: row.year,
                  type: f.type,
                });
                if (item)
                  item.searchTitle = catalog
                    .text(row.original_title || row.title || '')
                    .slice(0, 500);
                return item;
              })
              .filter(Boolean),
            hasMore: rows.length >= 50,
          };
        });
    },
    cub: function (f) {
      return options
        .fetchJSON(
          'https://tmdb.cub.best/?cat=' +
            f.type +
            '&sort=now&page=' +
            f.page +
            (f.year ? '&airdate=' + f.year : ''),
        )
        .then(function (data) {
          return {
            items: external.cards('cub', data, f.type, f.year),
            hasMore: f.page < Number(data.total_pages || data.total || 0),
          };
        });
    },
    cinemeta: function (f) {
      var extras =
        (f.genre ? 'genre=' + encodeURIComponent(f.genre) + '&' : '') +
        'skip=' +
        (f.page - 1) * 50;
      return options
        .fetchJSON(
          'https://v3-cinemeta.strem.io/catalog/' +
            (f.type === 'tv' ? 'series' : 'movie') +
            '/' +
            (f.sort === 'rating' ? 'imdbRating' : 'top') +
            '/' +
            extras +
            '.json',
        )
        .then(function (data) {
          return {
            items: external.cards('cinemeta', data, f.type),
            hasMore: data.metas.length >= 50,
          };
        });
    },
    yts: function (f) {
      return options
        .fetchJSON(
          'https://yts.lt/api/v2/list_movies.json?limit=40&page=' +
            f.page +
            '&sort_by=' +
            { popular: 'download_count', newest: 'year', rating: 'rating' }[
              f.sort
            ] +
            '&order_by=desc' +
            (f.genre ? '&genre=' + encodeURIComponent(f.genre) : '') +
            '&minimum_rating=' +
            f.minRating,
        )
        .then(function (data) {
          var empty =
            data &&
            data.data &&
            Number(data.data.movie_count) === 0 &&
            !data.data.movies;
          return {
            items: empty ? [] : external.cards('yts', data, 'movie'),
            hasMore: f.page * 40 < Number(data.data.movie_count || 0),
          };
        });
    },
  };
  Object.keys(options.adapters || {}).forEach(function (id) {
    loaders[id] = options.adapters[id];
  });
  function browse(provider, query) {
    var source = definitionsList.filter(function (s) {
      return s.id === provider;
    })[0];
    if (!source || !loaders[provider])
      throw new Error('Неизвестный источник каталога');
    var f = normalize(source, query),
      key =
        provider +
        '|' +
        JSON.stringify(f) +
        '|' +
        (options.identity ? options.identity(provider) : ''),
      old = cache[key],
      time = Date.now();
    if (old && time - old.updatedAt < 300000) return Promise.resolve(old);
    if (pending[key]) return pending[key];
    pending[key] = Promise.resolve()
      .then(function () {
        return loaders[provider](f);
      })
      .then(
        function (page) {
          var seen = {},
            genres = { movie: [], tv: [] },
            control = source.fields.filter(function (c) {
              return c.key === 'genre';
            })[0];
          if (control) genres = control.optionsByType;
          var result = Object.assign({}, page, {
            provider: provider,
            source: source.name,
            filters: f,
            genres: genres,
            items: page.items.filter(function (item) {
              if (seen[item.id]) return false;
              seen[item.id] = true;
              return true;
            }),
            hasMore: !!page.hasMore && f.page < 500,
            updatedAt: Date.now(),
          });
          cache[key] = result;
          Object.keys(cache)
            .slice(0, -64)
            .forEach(function (k) {
              delete cache[k];
            });
          return result;
        },
        function (error) {
          if (old) return Object.assign({}, old, { stale: true });
          throw error;
        },
      )
      .then(
        function (result) {
          delete pending[key];
          return result;
        },
        function (error) {
          delete pending[key];
          throw error;
        },
      );
    return pending[key];
  }
  return {
    sources: function () {
      return definitionsList;
    },
    browse: browse,
  };
}
module.exports = {
  create: create,
  definitions: definitions,
  normalize: normalize,
};
