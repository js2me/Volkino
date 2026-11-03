export interface Filters {
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
  filters: Filters;
  items: CatalogItem[];
  genres: Genres;
  hasMore: boolean;
  stale?: boolean;
  updatedAt: number;
}

export interface CatalogSession {
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
