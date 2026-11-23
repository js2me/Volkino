import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { SearchResult } from '../../../shared/types/screens';

import type { FilmixResult } from '../../../app/services/types';

export class SearchVM extends VM {
  query: string;
  results: SearchResult[];
  sort: string;
  loading = false;
  searched: boolean;
  status = '';
  error = '';
  suggestions: string[] = [];
  private suggestionTimer?: ReturnType<typeof setTimeout>;
  private suggestionRequest = 0;
  private request = 0;
  protected didMount() {
    this.afterRender((root) =>
      root.querySelector<HTMLInputElement>('#query')?.focus(),
    );
  }
  private restoreFocus() {
    this.afterRender((root) =>
      root
        .querySelector<HTMLButtonElement>(
          '#search-results .torrent, #search-results button',
        )
        ?.focus(),
    );
  }

  constructor(params: ViewModelParams) {
    super(params);
    const session = this.globals.state;
    this.query = session.query;
    this.results = session.results;
    this.sort = session.sort;
    this.searched = session.results.length > 0 || !!session.searchStatus;
    this.status = session.searchStatus?.text || '';
    this.error = session.searchStatus?.error ? this.status : '';
    makeObservable(this, {
      query: observable,
      results: observable.ref,
      sort: observable,
      loading: observable,
      searched: observable,
      status: observable,
      error: observable,
      sorted: computed,
      suggestions: observable.ref,
      dismissSuggestions: action,
      setQuery: action,
      setSort: action,
      search: action,
    });
  }
  get sorted() {
    return this.sort === 'size'
      ? this.results
          .slice()
          .sort(
            (a, b) =>
              this.globals.sizeNumber(a.size) - this.globals.sizeNumber(b.size),
          )
      : this.results;
  }
  setQuery(query: string) {
    this.query = query;
    this.dismissSuggestions();
    const term = query.trim();
    if (term.length < 2) return;
    const request = this.suggestionRequest;
    this.suggestionTimer = setTimeout(() => {
      this.globals.api<{ results: FilmixResult[] }>(
        'filmix/search?q=' + encodeURIComponent(term),
        null,
        (error, data) => {
          if (error || request !== this.suggestionRequest) return;
          const titles = data.results
            .map((item) => item.title.trim())
            .filter(Boolean);
          runInAction(() => {
            this.suggestions = Array.from(new Set(titles)).slice(0, 5);
          });
        },
      );
    }, 300);
  }
  dismissSuggestions() {
    clearTimeout(this.suggestionTimer);
    this.suggestionRequest++;
    this.suggestions = [];
  }
  setSort(sort: string) {
    this.sort = sort;
    this.globals.state.sort = sort;
  }
  search(query = this.query) {
    this.dismissSuggestions();
    this.query = query.trim();
    if (this.query.length < 2) {
      this.globals.toast('Введите хотя бы два символа');
      return;
    }
    const request = ++this.request;
    const submittedQuery = this.query;
    this.loading = true;
    this.searched = true;
    this.error = '';
    this.status = 'Ищем раздачи…';
    this.results = [];
    Object.assign(this.globals.state, {
      query: this.query,
      results: [],
      searchStatus: { text: this.status },
    });
    this.globals.api<{ results: SearchResult[]; hint?: string }>(
      'search?q=' + encodeURIComponent(this.query),
      null,
      (error, data) => {
        if (request !== this.request || this.unmountSignal.aborted) return;
        runInAction(() => {
          this.loading = false;
          if (error) {
            this.error = error.message;
            this.status = error.message;
          } else {
            this.results = data.results;
            this.status = data.hint || 'Раздачи не найдены.';
          }
          Object.assign(this.globals.state, {
            results: this.results,
            searchStatus: { text: this.status, error: !!error },
          });
          if (submittedQuery === this.query) this.restoreFocus();
        });
      },
    );
  }
  filmix() {
    this.globals.state.query = this.query.trim();
    this.globals.filmixSearch(this.query.trim());
  }
  protected willUnmount() {
    this.dismissSuggestions();
    this.request++;
    if (this.loading) this.globals.state.searchStatus = null;
  }
}
