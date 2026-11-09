import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browse, files, filmixDetails, filmixPost, genres, items, latest, poster, search, torrent } from './fixtures.mjs';
import catalogBrowse from '../server/catalog-browse.js';

const video = fileURLToPath(new URL('./assets/demo.mp4', import.meta.url));

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65536) throw new Error('Слишком большой запрос');
  }
  return body ? JSON.parse(body) : {};
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function streamVideo(req, res) {
  const { size } = await stat(video);
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = req.headers.range;
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start >= size || end < start) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); return; }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': end - start + 1 });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(video, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** In-memory dev API. No production helper, network calls or configuration files. */
export function createMockMiddleware() {
  let config = {
    seekStep: 30, audioFix: 'off', torrserverMode: 'external', torrserverUrl: 'http://mock-torrserver:8090', torrserverUsername: '',
    searchProvider: 'vilkadb', catalogProvider: 'vilkadb', catalogBrowseProvider: 'vilkadb', jacredUrl: '', hasPassword: false, hasApiKey: false, hasFilmixToken: false,
    filmixApiUrl: 'http://mock-filmix/api/v2', filmixSiteUrl: 'http://mock-filmix',
  };
  let localState = 'stopped';
  let currentTorrent = torrent();
  let downloads = [];
  let nextDownloadId = 0;

  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    if (!route.startsWith('/api/') && !route.startsWith('/mock/') && route !== '/stream') return next();
    try {
      if (route === '/stream' || route === '/mock/video.mp4') return await streamVideo(req, res);
      const image = /^\/mock\/poster\/(movie|tv)-(\d+)\.svg$/.exec(route);
      if (image) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
        res.end(poster(`${image[1]}-${image[2]}`)); return;
      }
      const scenario = new URL(req.headers.referer || '/', 'http://localhost').searchParams.get('mock');
      await new Promise(resolve => setTimeout(resolve, scenario === 'slow' ? 1800 : 120));
      const body = req.method === 'POST' ? await readBody(req) : {};
      const empty = scenario === 'empty';
      if (scenario === 'error' && (/\/catalog\/|\/search$|\/filmix\/post$/.test(route) || route === '/api/latest')) {
        return json(res, { error: 'Демонстрационная ошибка сервиса. Измените ?mock=error на ?mock=normal.' }, 503);
      }
      switch (route) {
        case '/api/updates': return json(res, {state:'idle', supported:false, current:'0.9.2', build:0, received:0, total:0, error:''});
        case '/api/updates/check': return json(res, {state:'latest', supported:false, current:'0.9.2', build:0, received:0, total:0, error:''});
        case '/api/session': return json(res, { token: 'local-mock-session' });
        case '/api/config': {
          if (body.seekStep !== undefined && (!Number.isInteger(body.seekStep) || body.seekStep < 1 || body.seekStep > 3600)) return json(res, { error: 'Шаг перемотки должен быть целым числом от 1 до 3600 секунд' }, 400);
          if (body.audioFix !== undefined && !['off', 'moderate', 'night'].includes(body.audioFix)) return json(res, { error: 'Неизвестный режим автофикса звука' }, 400);
          if (body.catalogProvider !== undefined && !['vilkadb', 'cub', 'filmix', 'cinemeta', 'yts'].includes(body.catalogProvider)) return json(res, { error: 'Неизвестный источник подборок' }, 400);
          if (req.method === 'POST') {
            const { filmixToken, torrserverPassword, jacredApiKey, ...settings } = body;
            config = { ...config, ...settings, ...(filmixToken ? { hasFilmixToken: true } : {}), ...(torrserverPassword ? { hasPassword: true } : {}), ...(jacredApiKey ? { hasApiKey: true } : {}) };
          }
          return json(res, config);
        }
        case '/api/health': return json(res, { version: 'TorrServer · локальные моки' });
        case '/api/latest': {
          const source = url.searchParams.get('source') || 'filmix', page = Number(url.searchParams.get('page') || 1);
          if (source !== 'filmix' || !Number.isInteger(page) || page < 1 || page > 500) return json(res, { error: 'Некорректный источник или страница' }, 400);
          return json(res, latest(page, empty));
        }
        case '/api/catalog/home': return json(res, {
          sections: empty ? [] : [
            { id: 'popular', title: 'Популярное сейчас', items: items.filter(item => item.type === 'movie').slice(0, 12) },
            { id: 'movies', title: 'Новые фильмы', items: items.filter(item => item.type === 'movie').slice(12, 24) },
            ...(config.catalogProvider === 'yts' ? [] : [{ id: 'series', title: 'Сериалы', items: items.filter(item => item.type === 'tv').slice(0, 12) }]),
          ], updatedAt: Date.now(), source: { vilkadb: 'VilkaDB', cub: 'CUB', filmix: 'Filmix', cinemeta: 'Cinemeta', yts: 'YTS' }[config.catalogProvider],
        });
        case '/api/catalog/sources': return json(res, {sources: catalogBrowse.definitions()});
        case '/api/catalog/browse': {
          const provider = url.searchParams.get('provider') || config.catalogBrowseProvider;
          const source = catalogBrowse.definitions().find(source => source.id === provider);
          if (!source) return json(res, {error: 'Неизвестный источник каталога'}, 400);
          const filters = catalogBrowse.normalize(source, Object.fromEntries(url.searchParams));
          const query = new URLSearchParams(filters);
          const aliases = {g3:'28',g1:'18',g13:'10765',g6:'35',Action:'28',Drama:'18','Sci-Fi':'10765',Comedy:'35'};
          if (aliases[filters.genre]) query.set('genre', aliases[filters.genre]);
          const result = browse(query, empty);
          const genre = source.fields.find(field => field.key === 'genre');
          return json(res, {...result,provider,source:source.name,filters,genres:genre?.optionsByType || {movie:[],tv:[]},items:result.items.map(item => ({...item,provider,...(provider==='filmix'?{id:'filmix:'+item.filmixId}:{})}))});
        }
        case '/api/catalog/item': {
          const filmixKey = /^filmix:(\d+)$/.exec(url.searchParams.get('key') || '');
          if (filmixKey) return json(res, {...filmixDetails(filmixKey[1]),id:'filmix:'+filmixKey[1],provider:'filmix'});
          const item = items.find(item => item.id === url.searchParams.get('key'));
          return item ? json(res, { ...item, metadata: `${item.year} · ${genres[item.type].find(genre => genre.id === item.genre).name} · TMDB ${item.rating}`, description: 'Демонстрационная история о путешествии, дружбе и неожиданных открытиях. Эти локальные данные позволяют проверить описание, поиск раздач, просмотр и возврат к выбранной карточке без подключения к внешним сервисам.' }) : json(res, { error: 'Карточка не найдена' }, 404);
        }
        case '/api/search': return json(res, search(url.searchParams.get('q'), empty));
        case '/api/torrents': return json(res, empty ? [] : [currentTorrent]);
        case '/api/add': currentTorrent = torrent(body.title || 'Торрент по ссылке'); return json(res, currentTorrent);
        case '/api/status': return json(res, { torrent: currentTorrent, files });
        case '/api/downloads': return json(res, { items: downloads });
        case '/api/downloads/save': {
          const file = body.source === 'filmix' ? filmixPost(body.id).files.find(file => file.id === body.fileId) : files.find(file => file.id === body.fileId);
          if (!file) return json(res, { error: 'Видео не найдено' }, 400);
          const identity = { hash: currentTorrent.hash, fileId: file.id, fileName: file.path, title: file.path.split('/').pop(), torrentTitle: currentTorrent.title, link: 'magnet:?xt=urn:btih:' + currentTorrent.hash,
            ...(body.source === 'filmix' ? { source: 'filmix', hash: '', filmixId: body.id, link: 'filmix:' + body.id, voice: file.voice, season: file.season, quality: body.quality } : {}) };
          let item = downloads.find(item => item.identity.link === identity.link && item.identity.fileId === identity.fileId);
          if (!item) {
            const { size } = await stat(video);
            item = { id: String(++nextDownloadId), identity, state: 'ready', received: size, total: size, created: Date.now(), error: '', url: '/mock/video.mp4' };
            downloads.unshift(item);
          }
          return json(res, item);
        }
        case '/api/downloads/remove': downloads = downloads.filter(item => item.id !== body.id); return json(res, { ok: true });
        case '/api/downloads/retry': return json(res, downloads.find(item => item.id === body.id));
        case '/api/preload': return json(res, { stat: 3 });
        case '/api/enable-search': return json(res, { message: 'Демонстрационный поиск включён' });
        case '/api/local-server': return json(res, { state: localState, version: 'MatriX.mock' });
        case '/api/local-server/start': localState = 'running'; config.torrserverMode = 'local'; return json(res, { state: localState });
        case '/api/local-server/stop': localState = 'stopped'; config.torrserverMode = 'external'; return json(res, { state: localState });
        case '/api/filmix/search': {
          const query = (url.searchParams.get('q') || '').toLocaleLowerCase();
          return json(res, { results: empty ? [] : items.filter(item => item.title.toLocaleLowerCase().includes(query)).slice(0, 12).map(item => ({ id: item.filmixId, title: item.title, year: item.year, originalTitle: 'Local demo' })) });
        }
        case '/api/filmix/post': return json(res, filmixPost(url.searchParams.get('id')));
        case '/api/filmix/details': return json(res, filmixDetails(url.searchParams.get('id')));
        case '/api/filmix/play': return json(res, { url: '/mock/video.mp4' });
        case '/api/filmix/auth/start': return json(res, { code: 'DEMO-1234', activationUrl: 'http://localhost (мок, ввод на сайте не нужен)' });
        case '/api/filmix/auth/check': config.hasFilmixToken = true; return json(res, { authenticated: true, login: 'Demo', plan: 'PRO', maxQuality: 1080 });
        case '/api/filmix/auth/disconnect': config.hasFilmixToken = false; return json(res, { authenticated: false, maxQuality: 480 });
        case '/api/filmix/profile': return json(res, { authenticated: config.hasFilmixToken, login: 'Demo', plan: 'PRO', maxQuality: config.hasFilmixToken ? 1080 : 480 });
        default: return json(res, { error: 'Нет мока для ' + route }, 404);
      }
    } catch (error) {
      if (!res.headersSent) json(res, { error: error.message }, 400);
      else res.destroy();
    }
  };
}
