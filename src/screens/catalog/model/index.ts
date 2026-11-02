import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import {
  type CatalogData,
  type CatalogItem,
  type Filters,
  type Genres,
  sortNames,
} from '../../../globals/catalog';

export class CatalogVM extends VM {
  draft: Filters;
  genres: Genres;
  data: CatalogData | null = null;
  loading = false;
  error = '';
  loadingMore = false;
  moreError = '';
  private request = 0;

  private restoreFocus(target: 'filters' | 'results' | 'restore') {
    this.afterRender((root) => {
      const cards = Array.from(
        root.querySelectorAll<HTMLButtonElement>('[data-catalog-id]'),
      );
      const selected =
        target === 'restore' &&
        cards.find((card) => card.dataset.catalogId === this.selectedId);
      const element =
        target === 'filters'
          ? root.querySelector<HTMLElement>('#catalog-type')
          : selected ||
            cards[0] ||
            root.querySelector<HTMLElement>('#catalog-results button') ||
            root.querySelector<HTMLElement>('#catalog-apply');
      element?.focus();
      const main = document.getElementById('main');
      if (main && target !== 'filters')
        main.scrollTop = target === 'restore' ? this.scroll : 0;
    });
  }

  constructor(params: ViewModelParams) {
    super(params);
    this.draft = { ...this.globals.catalog.filters };
    this.genres = this.globals.catalog.genres;
    makeObservable(this, {
      draft: observable.ref,
      genres: observable.ref,
      data: observable.ref,
      loading: observable,
      error: observable,
      summary: computed,
      setFilter: action,
      apply: action,
      loadMore: action,
      loadingMore: observable,
      moreError: observable,
      load: action,
      start: action,
    });
  }

  get summary() {
    if (!this.data) return '';
    const { filters: f, items, genres, stale } = this.data;
    const genre = genres[f.type].find((g) => g.id === f.genre);
    return `${f.type === 'tv' ? 'Сериалы' : 'Фильмы'} · ${genre?.name || 'Все жанры'} · ${f.minRating ? 'рейтинг от ' + f.minRating : 'Любой рейтинг'} · ${f.year || 'Все годы'} · ${sortNames[f.sort]} · ${items.length} загружено${stale ? ' · сохранённая подборка' : ''}`;
  }

  get selectedId() {
    return this.globals.catalog.selectedId;
  }

  get scroll() {
    return this.globals.catalog.scroll;
  }

  protected didMount() {
    this.start();
  }

  start() {
    const session = this.globals.catalog;
    const cached = session.data;
    if (
      cached &&
      Date.now() - cached.updatedAt < 3600000 &&
      (Object.keys(session.filters) as (keyof Filters)[]).every(
        (key) => cached.filters[key] === session.filters[key],
      )
    ) {
      this.data = cached;
      this.restoreFocus(session.selectedId ? 'restore' : 'filters');
    } else {
      this.restoreFocus('filters');
      this.load(!!session.selectedId);
    }
  }

  setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    this.draft = {
      ...this.draft,
      [key]: value,
      ...(key === 'type' ? { genre: '' } : {}),
    };
  }

  apply() {
    this.globals.catalog.filters = { ...this.draft, page: 1 };
    this.draft = { ...this.globals.catalog.filters };
    this.resetSelection();
    this.load(true);
  }

  private resetSelection() {
    Object.assign(this.globals.catalog, {
      data: null,
      selectedId: null,
      scroll: 0,
    });
  }

  load(focus = true) {
    const request = ++this.request;
    const f = { ...this.globals.catalog.filters, page: 1 };
    this.globals.catalog.filters = f;
    this.loadingMore = false;
    this.moreError = '';
    this.loading = true;
    this.error = '';
    this.data = null;
    const query = (Object.keys(f) as (keyof Filters)[])
      .map((key) => `${key}=${encodeURIComponent(f[key])}`)
      .join('&');
    this.globals.app.api<CatalogData>(
      'catalog/browse?' + query,
      null,
      (error, data) => {
        if (this.unmountSignal.aborted || request !== this.request) return;
        runInAction(() => {
          this.loading = false;
          if (error) this.error = error.message;
          else {
            this.data = data;
            this.genres = data.genres;
            Object.assign(this.globals.catalog, { data, genres: data.genres });
          }
          if (focus) {
            this.restoreFocus(
              this.globals.catalog.selectedId ? 'restore' : 'results',
            );
          }
        });
      },
    );
  }

  loadMore() {
    if (this.loading || this.loadingMore || !this.data?.hasMore) return;
    const previous = this.data;
    const request = ++this.request;
    const filters = { ...previous.filters, page: previous.filters.page + 1 };
    const query = (Object.keys(filters) as (keyof Filters)[])
      .map((key) => `${key}=${encodeURIComponent(filters[key])}`)
      .join('&');
    this.loadingMore = true;
    this.moreError = '';
    this.globals.app.api<CatalogData>(
      'catalog/browse?' + query,
      null,
      (error, data) => {
        if (request !== this.request || this.unmountSignal.aborted) return;
        runInAction(() => {
          this.loadingMore = false;
          if (error) {
            this.moreError = error.message;
            return;
          }
          const seen = new Set(previous.items.map((item) => item.id));
          const added = data.items.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
          this.data = {
            ...data,
            items: [...previous.items, ...added],
            hasMore: data.hasMore && added.length > 0,
          };
          Object.assign(this.globals.catalog, {
            data: this.data,
            filters: data.filters,
            genres: data.genres,
          });
        });
      },
    );
  }

  open(item: CatalogItem, scroll: number) {
    Object.assign(this.globals.catalog, { selectedId: item.id, scroll });
    this.globals.app.openItem(item, 'catalog');
  }

  protected willUnmount() {
    // Ignore callbacks even if a response arrives while Solid disposes the view.
    this.request++;
  }
}
