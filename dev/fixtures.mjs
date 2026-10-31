export const hash = '0123456789abcdef0123456789abcdef01234567';
export const genres = {
  movie: [{ id: '28', name: 'Боевик' }, { id: '12', name: 'Приключения' }, { id: '18', name: 'Драма' }],
  tv: [{ id: '10765', name: 'Фантастика' }, { id: '18', name: 'Драма' }, { id: '35', name: 'Комедия' }],
};

const titles = ['За горизонтом', 'Ночной экспресс', 'Лунная станция', 'Северный ветер', 'Тайна океана', 'Последний маяк', 'Город будущего', 'Забытый остров', 'Письма домой', 'Большое путешествие', 'Свет далёкой звезды', 'Тихая гавань'];
export const items = ['movie', 'tv'].flatMap(type => Array.from({ length: 72 }, (_, i) => ({
  id: `tmdb:${type}:${i + 1}`,
  title: `${titles[i % titles.length]}${i >= titles.length ? ' — ' + (Math.floor(i / titles.length) + 1) : ''}${type === 'tv' ? ' (сериал)' : ''}`,
  searchTitle: titles[i % titles.length],
  type,
  year: String(2026 - i % 7),
  rating: (6 + i % 40 / 10).toFixed(1),
  poster: `/mock/poster/${type}-${i + 1}.svg`,
  genre: genres[type][i % genres[type].length].id,
  filmixId: i + 1 + (type === 'tv' ? 100 : 0),
})));

export function browse(query, empty = false) {
  const filters = {
    type: query.get('type') === 'tv' ? 'tv' : 'movie',
    genre: query.get('genre') || '',
    minRating: Number(query.get('minRating')) || 0,
    year: query.get('year') || '',
    sort: query.get('sort') || 'popular',
    page: Math.max(1, Number(query.get('page')) || 1),
  };
  let matches = empty ? [] : items.filter(item => item.type === filters.type &&
    (!filters.genre || item.genre === filters.genre) && Number(item.rating) >= filters.minRating &&
    (!filters.year || item.year === filters.year));
  if (filters.sort === 'rating') matches = matches.toSorted((a, b) => Number(b.rating) - Number(a.rating));
  if (filters.sort === 'newest') matches = matches.toSorted((a, b) => Number(b.year) - Number(a.year));
  const start = (filters.page - 1) * 36;
  return { filters, genres, items: matches.slice(start, start + 36), hasMore: start + 36 < matches.length, updatedAt: Date.now() };
}

export function latest(page, empty = false) {
  const mixed = Array.from({ length: 72 }, (_, i) => [items[i], items[i + 72]]).flat();
  const start = (page - 1) * 50;
  return {
    source: 'filmix', page, hasMore: !empty && start + 50 < mixed.length, updatedAt: Date.now(),
    note: 'По дате публикации и обновления Filmix. Новые серии тоже поднимают сериал в списке.',
    items: empty ? [] : mixed.slice(start, start + 50).map((item, i) => ({
      ...item, id: 'filmix:' + item.filmixId, source: 'filmix',
      updatedAt: new Date(Date.now() - (start + i) * 3600000).toISOString(),
      episode: item.type === 'tv' ? 8 : 0, season: item.type === 'tv' ? 1 : 0, quality: 'WEB-DL 1080p',
    })),
  };
}

export function torrent(title = titles[0]) {
  return { hash, title, torrent_size: 3 * 1024 ** 3, stat_string: 'Готов к просмотру', download_speed: 4 * 1024 ** 2, connected_seeders: 24, active_peers: 12, preload_size: 1024, preloaded_bytes: 1024 };
}

export const files = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, path: `Демонстрационный сезон/Серия ${i + 1}.mp4`, length: 700 * 1024 ** 2 }));

export function search(query, empty = false) {
  return { results: empty ? [] : ['1080p', '720p', '2160p'].map((quality, i) => ({
    title: `${query || titles[0]} (2026) · ${quality}`,
    magnet: 'magnet:?xt=urn:btih:' + hash,
    size: (i + 1) * 1024 ** 3,
    seeders: 24 - i * 7,
    tracker: 'DemoTracker',
    quality,
  })) };
}

export function filmixPost(id) {
  const item = items.find(item => item.filmixId === Number(id)) || items[0];
  const isSeries = item.type === 'tv';
  const voices = ['Дубляж', 'Оригинал'];
  const seasons = isSeries ? [1, 2] : [0];
  return {
    id: Number(id), title: item.title, isSeries, maxQuality: 1080, voices, seasons,
    files: seasons.flatMap(season => voices.flatMap(voice => Array.from({ length: isSeries ? 4 : 1 }, (_, i) => ({
      id: season * 10000 + i + 1, season, episode: i + 1, voice, qualities: [1080, 720, 480],
      path: isSeries ? `Сезон ${season}/Серия ${i + 1}` : item.title,
    })))),
  };
}

export function filmixDetails(id) {
  const item = items.find(item => item.filmixId === Number(id)) || items[0];
  return { id: Number(id), title: item.title, originalTitle: 'The Last Lighthouse', poster: item.poster,
    description: 'На далёком острове гаснет старый маяк. Его новый смотритель находит письма, которые много лет хранили тайну исчезнувшей экспедиции. Чтобы вернуть свет и спасти тех, кто остался в море, ему придётся разобраться в прошлом и сделать непростой выбор.',
    year: item.year, duration: 104, genres: ['Драма', 'Приключения'], countries: ['Россия'],
    actors: ['Александр Петров', 'Юлия Пересильд'], directors: ['Андрей Соколов'], imdbRating: '7.8', kpRating: '8.1' };
}

export function poster(key) {
  const [type, id] = key.split('-');
  const item = items.find(item => item.id === `tmdb:${type}:${id}`) || items[0];
  const hue = 185 + Number(id) * 11 % 35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="hsl(${hue},45%,32%)"/><stop offset="1" stop-color="#030e23"/></linearGradient></defs>
    <rect width="400" height="600" fill="url(#bg)"/>
    <circle cx="290" cy="170" r="90" fill="hsl(${hue},70%,70%)" opacity=".7"/>
    <path d="M0 440 130 190 260 440 330 300 400 440V600H0Z" fill="#030e23" opacity=".65"/>
    <text x="28" y="480" fill="#fff" font-family="Arial,sans-serif" font-size="22">${item.title.split(' — ')[0].replace(' (сериал)', '')}</text>
    <text x="28" y="525" fill="#a1c4d7" font-family="Arial,sans-serif" font-size="18">${type === 'tv' ? 'СЕРИАЛ' : 'ФИЛЬМ'} · ${item.year}</text>
  </svg>`;
}
