export interface ScreenAPI {
  <T>(route: string, body: null, done: (error: Error | null, data: T) => void): void;
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
