import type { SavedHistory } from './types';
export const limit = 100;
var LIMIT = 100,
  KEY = 'tw-history';
export function key(item: {
  source?: string;
  filmixId?: number;
  hash?: string;
  fileId: number;
}) {
  return (
    (item.source === 'filmix'
      ? 'filmix:' + Number(item.filmixId)
      : String(item.hash).toLowerCase()) +
    ':' +
    Number(item.fileId)
  );
}
export function normalize(items: unknown): SavedHistory[] {
  if (!Array.isArray(items)) return [];
  var seen: Record<string, boolean> = {};
  return items
    .filter(function (h) {
      if (!h || !(Number(h.fileId) >= 1) || !h.link || !h.title) return false;
      if (h.source === 'filmix') {
        if (!/^\d+$/.test(String(h.filmixId)) || Number(h.filmixId) < 1)
          return false;
      } else if (!/^[a-f0-9]{40}$/i.test(h.hash || '')) return false;
      var id = key(h);
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    })
    .slice(0, LIMIT);
}
export function upsert(items: SavedHistory[], item: SavedHistory) {
  var id = key(item),
    previous: SavedHistory | null = null;
  var rest = normalize(items).filter(function (h) {
    if (key(h) === id) {
      previous = h;
      return false;
    }
    return true;
  });
  rest.unshift(Object.assign({}, previous || {}, item));
  return normalize(rest);
}
export function load(storage: Storage) {
  try {
    return normalize(JSON.parse(storage.getItem(KEY) || '[]'));
  } catch (_) {
    return [];
  }
}
export function save(storage: Storage, items: SavedHistory[]) {
  var result = normalize(items);
  storage.setItem(KEY, JSON.stringify(result));
  return result;
}
export function progress(item?: {
  completed?: boolean;
  position: number;
  duration: number;
}) {
  if (!item) return 0;
  if (item.completed) return 100;
  var position = Number(item.position),
    duration = Number(item.duration);
  if (
    !isFinite(position) ||
    !isFinite(duration) ||
    duration <= 0 ||
    position <= 0
  )
    return 0;
  var percent = Math.max(0, Math.min(100, (100 * position) / duration));
  return percent >= 95 ? 100 : percent;
}
