import { createCatalogSession } from './catalog';
import { createLatestSession } from './latest';
import { audioProcessor } from '../app/audio/processor';
import type { NavigationVM } from '../app/navigation/model';
import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from 'mobx';
import { ViewModelStoreBase } from 'mobx-view-model';
import type {
  AppSession,
  HistoryItem,
  SearchResult,
  ServerTorrent,
} from '../shared/types/screens';
import type { CatalogItem } from './catalog';
import { APIClient } from '../app/services/api';
import * as watchHistory from '../app/services/history';
import type {
  Config,
  FilesRequest,
  FilmixResult,
  MediaFile,
  SavedHistory,
  Torrent,
  View,
} from '../app/services/types';
import type { PlayerVM } from '../app/player/model';

const titles: Record<View, string> = {
  home: 'Что посмотрим сегодня?',
  latest: 'Последние добавления',
  catalog: 'Каталог',
  search: 'Что посмотрим?',
  history: 'История просмотров',
  torrents: 'Торренты на сервере',
  settings: 'Настройки',
  magnet: 'Открыть торрент',
  details: 'О фильме',
  'filmix-search': 'Смотреть через Filmix',
  files: 'Выберите файл',
};

export class Globals {
  root: HTMLElement | undefined;
  navigation?: NavigationVM;
  readonly audio = audioProcessor;
  readonly catalog = createCatalogSession();
  readonly latest = createLatestSession();
  readonly stores = {
    viewModels: new ViewModelStoreBase({
      vmConfig: {
        observable: {
          viewModels: { useDecorators: false },
          viewModelStores: { useDecorators: false },
        },
        resource: { read: () => ({ globals: this }) },
      },
    }),
  };
  private lifecycle = new AbortController();
  private renderRevision = 0;
  get unmountSignal() {
    return this.lifecycle.signal;
  }
  private afterRender(callback: (root: HTMLElement) => void) {
    const revision = ++this.renderRevision;
    queueMicrotask(() => {
      if (
        !this.unmountSignal.aborted &&
        revision === this.renderRevision &&
        this.root
      )
        callback(this.root);
    });
  }

  view: View | null = null;
  routeRevision = 0;
  config: Config = {};
  startupError = '';
  private startupPending = false;
  private requestedStartView: View | null = null;
  toastText = '';
  connection = 'Проверяем сервер';
  connected: boolean | null = null;
  pageTitle = '';
  source: 'torrent' | 'filmix' = 'torrent';
  state: AppSession = {
    homeData: null,
    homeScroll: 0,
    lastHomeId: null,
    query: '',
    results: [],
    sort: 'seeders',
    searchStatus: null,
  };
  historyItems: SavedHistory[] = [];
  readonly historyLimit = watchHistory.limit;
  detailItem:
    | (CatalogItem & { metadata?: string; description?: string })
    | null = null;
  detailsNeedsLoad = false;
  detailOrigin: 'home' | 'catalog' = 'home';
  detailScroll = 0;
  detailTorrentIndex = 0;
  searchFromDetail = false;
  filmixOrigin: 'latest' | 'details' | 'direct-details' | 'search' = 'search';
  private filesOrigin: View | null = null;
  filmixQuery = '';
  filmixResults: FilmixResult[] | null = null;
  filmixId = 0;
  filmixVoice = '';
  filmixSeason = 0;
  filmixQuality = 0;
  hash = '';
  originalLink = '';
  torrent: Torrent | null = null;
  files: MediaFile[] = [];
  filesRequest: FilesRequest | null = null;
  player?: PlayerVM;
  private client = new APIClient();
  private toastTimer?: ReturnType<typeof setTimeout>;
  private healthTimer?: ReturnType<typeof setTimeout>;
  private healthEpoch = 0;
  private historyWarning = false;

  constructor() {
    makeObservable(this, {
      view: observable,
      routeRevision: observable,
      config: observable.ref,
      startupError: observable,
      toastText: observable,
      connection: observable,
      connected: observable,
      pageTitle: observable,
      state: observable,
      historyItems: observable.ref,
      detailItem: observable.ref,
      source: observable,
      filmixResults: observable.ref,
      filmixVoice: observable,
      filmixSeason: observable,
      filmixQuality: observable,
      torrent: observable.ref,
      files: observable.ref,
      title: computed,
      menuView: computed,
      openDetails: action.bound,
      openTorrentLink: action.bound,
      navigate: action.bound,
      back: action.bound,
      start: action.bound,
      dispose: action.bound,
      change: action.bound,
      toast: action.bound,
      openItem: action.bound,
      search: action.bound,
      openFilmix: action.bound,
      filmixSearch: action.bound,
      openSearch: action.bound,
      openTorrent: action.bound,
      resume: action.bound,
      clearHistory: action.bound,
      returnToResults: action.bound,
      leaveFilmix: action.bound,
      saveHistory: action.bound,
    });
  }
  start() {
    this.startupPending = true;
    if (this.lifecycle.signal.aborted) this.lifecycle = new AbortController();
    this.historyItems = watchHistory.load(localStorage);
    this.api<{ token: string }>('session', null, (error) => {
      if (this.unmountSignal.aborted) return;
      if (error) {
        runInAction(() => {
          this.startupError = error.message;
        });
        return;
      }
      this.api<Config>('config', null, (error, config) => {
        if (this.unmountSignal.aborted) return;
        runInAction(() => {
          if (error) {
            this.startupError = error.message;
            return;
          }
          this.config = config;
          this.persistHistory();
          this.startupPending = false;
          const view = this.requestedStartView || this.view || 'home';
          this.requestedStartView = null;
          this.change(view);
          this.health();
        });
      });
    });
  }
  dispose() {
    this.lifecycle.abort();
    this.healthEpoch++;
    clearTimeout(this.toastTimer);
    clearTimeout(this.healthTimer);
  }
  api<T>(
    route: string,
    body: object | null,
    done: (error: Error | null, data: T) => void,
  ) {
    this.client.request(route, body, done);
  }
  get title() {
    return (
      this.pageTitle ||
      (this.view === 'details' && this.detailItem?.type === 'tv'
        ? 'О сериале'
        : this.view
          ? titles[this.view]
          : 'VolKino')
    );
  }
  get menuView() {
    if (
      this.view === 'files' &&
      this.filesOrigin &&
      this.filesOrigin !== 'filmix-search'
    )
      return this.filesOrigin === 'details'
        ? this.detailOrigin
        : this.filesOrigin;
    if (this.view === 'details') return this.detailOrigin;
    if (
      this.view === 'filmix-search' ||
      (this.view === 'files' && this.source === 'filmix')
    )
      return this.filmixOrigin === 'latest'
        ? 'latest'
        : this.filmixOrigin === 'details' ||
            this.filmixOrigin === 'direct-details'
          ? this.detailOrigin
          : 'search';
    return this.view;
  }
  change(view: View) {
    // Routing must not leave a player writing progress against the next page's data.
    if (this.player?.playing) this.player.stop();
    this.routeRevision++;
    this.navigation?.close(false);
    this.view = view;
    this.pageTitle = '';
    this.afterRender(() => {
      const main = document.getElementById('main');
      if (main) main.scrollTop = 0;
    });
  }
  navigate(view: View) {
    this.searchFromDetail = false;
    if (this.startupPending) {
      this.requestedStartView = view;
      return;
    }
    this.change(view);
  }
  focusFirst() {
    document
      .getElementById('content')
      ?.querySelector<HTMLElement>('input,button,select')
      ?.focus();
  }
  toast(message: string) {
    this.toastText = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(
      action(() => {
        this.toastText = '';
      }),
      6500,
    );
  }
  history() {
    return this.historyItems;
  }
  clearHistory() {
    this.historyItems = [];
    this.persistHistory();
  }
  saveHistory(item: SavedHistory) {
    this.historyItems = watchHistory.upsert(this.historyItems, item);
    this.persistHistory();
  }
  private persistHistory() {
    try {
      this.historyItems = watchHistory.save(localStorage, this.historyItems);
    } catch {
      if (!this.historyWarning) {
        this.historyWarning = true;
        this.toast(
          'Не удалось сохранить историю на телевизоре: хранилище недоступно или заполнено',
        );
      }
    }
  }
  watchedFile(file: MediaFile) {
    const key = watchHistory.key({
      source: this.source,
      hash: this.hash,
      filmixId: this.filmixId,
      fileId: file.id,
    });
    return this.historyItems.find((item) => watchHistory.key(item) === key);
  }
  fileProgress(file: MediaFile) {
    return watchHistory.progress(this.watchedFile(file));
  }
  search() {
    this.searchFromDetail = false;
    this.change('search');
  }
  openItem(item: CatalogItem, origin: 'home' | 'catalog') {
    this.detailOrigin = origin;
    if (origin === 'home') {
      this.state.homeScroll = document.getElementById('main')?.scrollTop || 0;
      this.state.lastHomeId = item.id;
    }
    this.openDetails(item);
  }
  openDetails(item: CatalogItem) {
    this.detailItem = item;
    this.searchFromDetail = true;
    this.state.query = item.searchTitle || item.title;
    this.state.results = [];
    this.state.searchStatus = null;
    this.detailScroll = 0;
    this.detailTorrentIndex = 0;
    this.detailsNeedsLoad = true;
    this.change('details');
  }
  openSearch(result: SearchResult) {
    this.searchFromDetail = false;
    this.openTorrentLink(result.magnet, result.title);
  }
  openTorrent(torrent: ServerTorrent) {
    this.openTorrentLink(
      'magnet:?xt=urn:btih:' + torrent.hash,
      torrent.title || torrent.name || torrent.hash,
    );
  }
  returnToResults() {
    if (this.view === 'files' && this.filesOrigin) {
      this.change(this.filesOrigin);
      return;
    }
    if (this.source === 'filmix') {
      if (this.filmixOrigin === 'latest') {
        this.source = 'torrent';
        this.change('latest');
      } else if (this.filmixOrigin === 'direct-details') this.change('details');
      else this.change('filmix-search');
    } else
      this.change(
        this.searchFromDetail && this.detailItem ? 'details' : 'search',
      );
  }
  filmixSearch(query: string) {
    query = query.trim();
    if (query.length < 2) {
      this.toast('Введите хотя бы два символа');
      return;
    }
    if (this.view !== 'filmix-search' && this.view !== 'files')
      this.filmixOrigin = this.view === 'details' ? 'details' : 'search';
    this.filmixQuery = query;
    this.filmixResults = null;
    this.change('filmix-search');
  }
  leaveFilmix() {
    this.source = 'torrent';
    if (this.filmixOrigin === 'details' && this.detailItem)
      this.returnToResults();
    else this.change('search');
  }
  openFilmix(id: number, title: string, resume?: HistoryItem) {
    if (this.view !== 'files') this.filesOrigin = this.view;
    if (this.view === 'details') this.filmixOrigin = 'direct-details';
    if (this.view === 'latest') {
      this.filmixOrigin = 'latest';
      this.searchFromDetail = false;
    }
    this.source = 'filmix';
    this.filesRequest = {
      source: 'filmix',
      id: Number(id),
      title: title || 'Filmix',
      resume,
    };
    this.change('files');
  }
  resume(item: HistoryItem) {
    if (item.source === 'filmix') {
      this.filmixOrigin = 'search';
      this.openFilmix(item.filmixId!, item.torrentTitle, item);
    } else this.openTorrentLink(item.link, item.torrentTitle, item);
  }
  openTorrentLink(link: string, title: string, resume?: HistoryItem) {
    if (this.view !== 'files') this.filesOrigin = this.view;
    this.source = 'torrent';
    this.filesRequest = { source: 'torrent', link, title, resume };
    this.change('files');
  }
  health(show = false) {
    clearTimeout(this.healthTimer);
    const epoch = ++this.healthEpoch;
    if (this.config.torrserverMode !== 'local' && !this.config.torrserverUrl) {
      runInAction(() => {
        this.connected = null;
        this.connection = 'Онлайн-просмотр · Filmix';
      });
      return;
    }
    this.api<{ version: string }>('health', null, (error, data) => {
      if (epoch !== this.healthEpoch || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.connected = !error;
        this.connection = error
          ? 'TorrServer недоступен · переподключаемся…'
          : data.version;
        if (show)
          this.toast(
            error ? error.message : 'Соединение работает: ' + data.version,
          );
      });
      this.healthTimer = setTimeout(() => this.health(), 5000);
    });
  }
  back() {
    if (this.view === 'filmix-search') this.leaveFilmix();
    else if (this.view === 'details') this.change(this.detailOrigin);
    else if (this.view === 'files') this.returnToResults();
    else if (this.view !== 'home') this.change('home');
    else if (document.activeElement !== document.getElementById('nav-home'))
      document.getElementById('nav-home')?.focus();
    else window.PalmSystem?.platformBack();
  }
  time(n: number) {
    n = Math.max(0, Math.floor(n || 0));
    const h = Math.floor(n / 3600),
      m = Math.floor(n / 60) % 60,
      s = n % 60;
    return (
      (h ? h + ':' + String(m).padStart(2, '0') : m) +
      ':' +
      String(s).padStart(2, '0')
    );
  }
  bytes(value: number | string | undefined) {
    if (typeof value === 'string' && !/^\d+$/.test(value)) return value;
    const n = Number(value || 0);
    if (!n) return '—';
    const i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
    return (
      (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) +
      ' ' +
      ['Б', 'КиБ', 'МиБ', 'ГиБ', 'ТиБ'][i]
    );
  }
  sizeNumber(value: number | string) {
    if (typeof value === 'number') return value;
    const m = String(value)
      .replace(',', '.')
      .match(/([\d.]+)\s*(TB|GB|MB|KB|ТБ|ГБ|МБ|КБ|ТиБ|ГиБ|МиБ|КиБ)/i);
    if (!m) return Number(value) || 0;
    const unit = m[2].toUpperCase();
    return (
      Number(m[1]) *
      Math.pow(
        1024,
        /^(T|Т)/.test(unit)
          ? 4
          : /^(G|Г)/.test(unit)
            ? 3
            : /^(M|М)/.test(unit)
              ? 2
              : 1,
      )
    );
  }
}

declare global {
  interface Window {
    PalmSystem?: { platformBack(): void };
  }
}
