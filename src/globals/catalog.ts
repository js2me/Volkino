export interface Filters {
  [key: string]: string | number;
  type: 'movie' | 'tv';
  genre: string;
  minRating: number;
  year: string;
  sort: 'popular' | 'newest' | 'rating';
  page: number;
}

export interface CatalogItem {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  year?: string;
  rating?: string;
  poster?: string;
  searchTitle?: string;
  provider?: string;
  metadata?: string;
  description?: string;
}

export type Genres = Record<Filters['type'], { id: string; name: string }[]>;

export interface CatalogData {
  provider?: string;
  source?: string;
  filters: Filters;
  items: CatalogItem[];
  genres: Genres;
  hasMore: boolean;
  stale?: boolean;
  updatedAt: number;
}

export interface CatalogSession {
  provider: string;
  sources: CatalogSource[];
  filters: Filters;
  genres: Genres;
  data: CatalogData | null;
  selectedId: string | null;
  scroll: number;
}

export const sortNames = {
  popular: 'Популярное',
  newest: 'Новее',
  rating: 'По рейтингу',
};

export function createCatalogSession(): CatalogSession {
  return {
    provider: '',
    sources: [],
    filters: {
      type: 'movie',
      genre: '',
      minRating: 0,
      year: '',
      sort: 'popular',
      page: 1,
    },
    genres: { movie: [], tv: [] },
    data: null,
    selectedId: null,
    scroll: 0,
  };
}

export interface CatalogOption {
  id: string;
  name: string;
}
export interface CatalogField {
  key: string;
  label: string;
  options: CatalogOption[];
  optionsByType?: Genres;
  defaultValue: string;
}
export interface CatalogSource {
  id: string;
  name: string;
  note: string;
  fields: CatalogField[];
}
/** The provider-independent contract consumed by the catalogue page. */
export interface CatalogPage {
  sources: CatalogSource[];
  provider: string;
  note: string;
  filters: (CatalogField & { value: string; disabled: boolean })[];
  items: CatalogItem[];
  ready: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  moreError: string;
  hasMore: boolean;
  summary: string;
  selectSource(provider: string): void;
  setFilter(key: CatalogField['key'], value: string): void;
  apply(): void;
  retry(): void;
  loadMore(): void;
  open(item: CatalogItem, scroll: number): void;
}
