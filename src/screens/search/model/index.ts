import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { SearchResult } from '../../../shared/types/screens';

export class SearchVM extends VM {
  query: string;
  results: SearchResult[];
  sort: string;
  loading = false;
  searched: boolean;
  status = '';
  error = '';
  focusRevision = 0;
  private request = 0;
  constructor(params: ViewModelParams) {
    super(params);
    const session = this.globals.app.state;
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
  get sorted() {
    return this.sort === 'size' ? this.results.slice().sort((a, b) => this.globals.app.sizeNumber(a.size) - this.globals.app.sizeNumber(b.size)) : this.results;
  }
  setQuery(query: string) { this.query = query; }
  setSort(sort: string) { this.sort = sort; this.globals.app.state.sort = sort; }
  search(query = this.query) {
    this.query = query.trim();
    if (this.query.length < 2) { this.globals.app.toast('Введите хотя бы два символа'); return; }
    const request = ++this.request;
    this.loading = true; this.searched = true; this.error = ''; this.status = 'Ищем раздачи…'; this.results = [];
    Object.assign(this.globals.app.state, { query: this.query, results: [], searchStatus: { text: this.status } });
    this.globals.app.api<{ results: SearchResult[]; hint?: string }>('search?q=' + encodeURIComponent(this.query), null, (error, data) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loading = false;
        if (error) { this.error = error.message; this.status = error.message; }
        else { this.results = data.results; this.status = data.hint || 'Раздачи не найдены.'; }
        Object.assign(this.globals.app.state, { results: this.results, searchStatus: { text: this.status, error: !!error } });
        this.focusRevision++;
      });
    });
  }
  filmix() {
    this.globals.app.state.query = this.query.trim();
    this.globals.app.filmix(this.query.trim());
  }
  protected willUnmount() {
    this.request++;
    if (this.loading) this.globals.app.state.searchStatus = null;
  }
}
