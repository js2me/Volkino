import type { CatalogItem } from '../../globals/catalog';

export interface ScreenAPI {
  <T>(
    route: string,
    body: null,
    done: (error: Error | null, data: T) => void,
  ): void;
}

export interface HistoryItem {
  hash: string;
  fileId: number;
  title: string;
  fileName: string;
  torrentTitle: string;
  link: string;
  position: number;
  duration: number;
  updated: number;
  source?: 'filmix';
  filmixId?: number;
  season?: number;
  voice?: string;
  quality?: number;
}

export interface HomeData {
  sections: { id: string; title: string; items: CatalogItem[] }[];
  updatedAt: number;
  stale?: boolean;
  partial?: boolean;
}

export interface SearchResult {
  title: string;
  magnet: string;
  size: number | string;
  seeders: number;
  tracker: string;
  quality: string;
}

export interface ServerTorrent {
  hash: string;
  title?: string;
  name?: string;
  torrent_size: number;
  stat_string: string;
}

export interface AppSession {
  homeData: HomeData | null;
  homeScroll: number;
  lastHomeId: string | null;
  query: string;
  results: SearchResult[];
  sort: string;
  searchStatus: { text: string; error?: boolean } | null;
}
