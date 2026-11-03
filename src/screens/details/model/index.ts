import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { CatalogItem } from '../../../globals/catalog';
import type { SearchResult } from '../../../shared/types/screens';

type Details = CatalogItem & { metadata?: string; description?: string };
export class DetailsVM extends VM {
  item: Details | null;
  loading = false;
  results: SearchResult[];
  status: string;
  error: boolean;
  sort: string;
  private request = 0;
  constructor(params: ViewModelParams) {
    super(params);
    this.item = this.globals.detailItem;
    this.results = this.globals.state.results;
    this.status = this.globals.state.searchStatus?.text || '';
    this.error = !!this.globals.state.searchStatus?.error;
    this.sort = this.globals.state.sort;
    makeObservable(this, {
      item: observable.ref,
      loading: observable,
      results: observable.ref,
      status: observable,
      error: observable,
      sort: observable,
      sorted: computed,
      runSearch: action.bound,
      setSort: action.bound,
      openTorrent: action.bound,
      filmix: action.bound,
      back: action.bound,
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
  protected didMount() {
    if (this.globals.detailsNeedsLoad && this.item) {
      this.globals.detailsNeedsLoad = false;
      const item = this.item;
      this.runSearch();
      if (
        item.provider &&
        item.provider !== 'filmix' &&
        item.provider !== 'vilkadb'
      ) {
        this.afterRender((root) =>
          root.querySelector<HTMLButtonElement>('button')?.focus(),
        );
        return;
      }
      this.loading = true;
      this.globals.api<Details>(
        'catalog/item?key=' + encodeURIComponent(item.id),
        null,
        (error, data) => {
          if (this.unmountSignal.aborted) return;
          runInAction(() => {
            this.loading = false;
            if (error) return;
            this.item = {
              ...item,
              ...data,
              type: data.type || item.type,
              poster: data.poster || item.poster,
            };
            this.globals.detailItem = this.item;
            const query = data.searchTitle || data.title;
            if (query !== this.globals.state.query) {
              this.globals.state.query = query;
              this.runSearch();
            }
          });
        },
      );
      this.afterRender((root) =>
        root.querySelector<HTMLButtonElement>('button')?.focus(),
      );
    } else {
      this.afterRender((root) => {
        const rows = root.querySelectorAll<HTMLButtonElement>(
          '#search-results .torrent',
        );
        (
          rows[Math.min(this.globals.detailTorrentIndex, rows.length - 1)] ||
          root.querySelector<HTMLButtonElement>('button')
        )?.focus();
        const main = document.getElementById('main');
        if (main) main.scrollTop = this.globals.detailScroll;
      });
    }
  }
  runSearch() {
    const request = ++this.request;
    this.results = [];
    this.status = 'Ищем раздачи…';
    this.error = false;
    this.saveResults();
    this.globals.api<{ results: SearchResult[]; hint?: string }>(
      'search?q=' + encodeURIComponent(this.globals.state.query),
      null,
      (error, data) => {
        if (this.unmountSignal.aborted || request !== this.request) return;
        runInAction(() => {
          this.results = error ? [] : data.results;
          this.status = error?.message || data.hint || 'Раздачи не найдены.';
          this.error = !!error;
          this.saveResults();
        });
      },
    );
  }
  private saveResults() {
    this.globals.state.results = this.results;
    this.globals.state.searchStatus = { text: this.status, error: this.error };
  }
  setSort(sort: string) {
    this.sort = sort;
    this.globals.state.sort = sort;
  }
  openTorrent(result: SearchResult, index: number) {
    this.globals.detailScroll = document.getElementById('main')?.scrollTop || 0;
    this.globals.detailTorrentIndex = index;
    this.globals.openTorrentLink(result.magnet, result.title);
  }
  filmix() {
    if (this.item)
      this.globals.filmixSearch(this.item.searchTitle || this.item.title);
  }
  back() {
    this.globals.change(this.globals.detailOrigin);
  }
}
