import type { HistoryItem, ServerTorrent } from '../../shared/types/screens';
import type { AudioFixMode } from '../audio/graph';

export type View =
  | 'home'
  | 'latest'
  | 'catalog'
  | 'search'
  | 'history'
  | 'torrents'
  | 'settings'
  | 'magnet'
  | 'details'
  | 'filmix-search'
  | 'files';
export interface Config {
  seekStep?: number;
  audioFix?: AudioFixMode;
  torrserverMode?: string;
  torrserverUrl?: string;
  torrserverUsername?: string;
  hasPassword?: boolean;
  searchProvider?: string;
  catalogProvider?: string;
  catalogBrowseProvider?: string;
  jacredUrl?: string;
  hasApiKey?: boolean;
  filmixTransport?: string;
  filmixApiUrl?: string;
  filmixSiteUrl?: string;
  hasFilmixToken?: boolean;
}
export interface MediaFile {
  id: number;
  path: string;
  length: number;
  voice?: string;
  season?: number;
  qualities?: number[];
}
export interface Torrent extends Partial<ServerTorrent> {
  download_speed?: number;
  active_peers?: number;
  connected_seeders?: number;
  preload_size?: number;
  preloaded_bytes?: number;
}
export interface FilmixPost {
  title: string;
  voices: string[];
  seasons: number[];
  maxQuality: number;
  isSeries: boolean;
  files: MediaFile[];
}
export interface FilmixResult {
  id: number;
  title: string;
  year?: string;
  originalTitle?: string;
}
export interface NativePlayback {
  token: string;
  position: number;
  duration: number;
  completed?: boolean;
  closed?: boolean;
  nextFileId?: number;
  error?: string;
}
export type SavedHistory = HistoryItem & { completed?: boolean };

export type FilesRequest =
  | { source: 'torrent'; link: string; title: string; resume?: HistoryItem }
  | { source: 'filmix'; id: number; title: string; resume?: HistoryItem };
