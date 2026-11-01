import type { CatalogItem } from './catalog';

export interface LatestItem extends CatalogItem {
  source: 'filmix';
  filmixId: number;
  updatedAt?: string;
  season?: number;
  episode?: number;
  quality?: string;
}
export interface LatestPage {
  source: 'filmix';
  items: LatestItem[];
  page: number;
  hasMore: boolean;
  note: string;
  updatedAt: number;
  stale?: boolean;
}
export interface LatestDetails {
  id: number;
  title: string;
  originalTitle: string;
  poster: string;
  description: string;
  year: string;
  duration: number;
  genres: string[];
  countries: string[];
  actors: string[];
  directors: string[];
  imdbRating: string;
  kpRating: string;
}
export function createLatestSession() {
  return { page: 1, data: null as LatestPage | null, selectedId: null as string | null, scroll: 0 };
}
