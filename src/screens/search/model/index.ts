import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import type { ScreenAPI } from '../../../shared/types/screens';

export interface SearchResult {
  title: string;
  magnet: string;
  size: number | string;
  seeders: number;
  tracker: string;
  quality: string;
}
export interface SearchBridge {
  api: ScreenAPI;
  session: { query: string; results: SearchResult[]; sort: string; searchStatus: { text: string; error?: boolean } | null };
  bytes: (size: number | string) => string;
  sizeNumber: (size: number | string) => number;
  toast: (message: string) => void;
  open: (result: SearchResult) => void;
  filmix: (query: string) => void;
}
export class SearchVM extends ViewModelBase<{ bridge: SearchBridge }> {
  query: string;
  results: SearchResult[];
  sort: string;
  loading = false;
  searched: boolean;
  status = '';
  error = '';
  focusRevision = 0;
  private request = 0;
  constructor(params: ViewModelParams<{ bridge: SearchBridge }>) {
    super(params);
    const session = this.bridge.session;
    this.query = session.query;
    this.results = session.results;
    this.sort = session.sort;
    this.searched = session.results.length > 0 || !!session.searchStatus;
    this.status = session.searchStatus?.text || '';
    this.error = session.searchStatus?.error ? this.status : '';
    makeObservable(this, { query: observable, results: observable.ref, sort: observable, loading: observable,
      searched: observable, status: observable, error: observable, focusRevision: observable, sorted: computed,
      setQuery: action, setSort: action, search: action });
  }
  get bridge() { return this.payload.bridge; }
  get sorted() {
    return this.sort === 'size' ? this.results.slice().sort((a, b) => this.bridge.sizeNumber(a.size) - this.bridge.sizeNumber(b.size)) : this.results;
  }
  setQuery(query: string) { this.query = query; }
  setSort(sort: string) { this.sort = sort; this.bridge.session.sort = sort; }
  search(query = this.query) {
    this.query = query.trim();
    if (this.query.length < 2) { this.bridge.toast('Введите хотя бы два символа'); return; }
    const request = ++this.request;
    this.loading = true; this.searched = true; this.error = ''; this.status = 'Ищем раздачи…'; this.results = [];
    Object.assign(this.bridge.session, { query: this.query, results: [], searchStatus: { text: this.status } });
    this.bridge.api<{ results: SearchResult[]; hint?: string }>('search?q=' + encodeURIComponent(this.query), null, (error, data) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loading = false;
        if (error) { this.error = error.message; this.status = error.message; }
        else { this.results = data.results; this.status = data.hint || 'Раздачи не найдены.'; }
        Object.assign(this.bridge.session, { results: this.results, searchStatus: { text: this.status, error: !!error } });
        this.focusRevision++;
      });
    });
  }
  filmix() {
    this.bridge.session.query = this.query.trim();
    this.bridge.filmix(this.query.trim());
  }
  protected willUnmount() {
    this.request++;
    if (this.loading) this.bridge.session.searchStatus = null;
  }
}
