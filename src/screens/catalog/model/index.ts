import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import { type CatalogBridge, type CatalogData, type CatalogItem, type Filters, type Genres, sortNames } from '../../../globals/catalog';
import type { Globals } from '../../../globals';

interface Payload {
  globals: Globals;
  bridge: CatalogBridge;
}

export class CatalogVM extends ViewModelBase<Payload> {
  draft: Filters;
  genres: Genres;
  data: CatalogData | null = null;
  loading = false;
  error = '';
  loadingMore = false;
  moreError = '';
  focusRevision = 0;
  focusTarget: 'filters' | 'results' | 'restore' = 'filters';
  private request = 0;

  constructor(params: ViewModelParams<Payload>) {
    super(params);
    this.draft = { ...this.payload.globals.catalog.filters };
    this.genres = this.payload.globals.catalog.genres;
    makeObservable(this, {
      draft: observable.ref,
      genres: observable.ref,
      data: observable.ref,
      loading: observable,
      error: observable,
      focusRevision: observable,
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
    const genre = genres[f.type].find(g => g.id === f.genre);
    return `${f.type === 'tv' ? 'Сериалы' : 'Фильмы'} · ${genre?.name || 'Все жанры'} · ${f.minRating ? 'рейтинг от ' + f.minRating : 'Любой рейтинг'} · ${f.year || 'Все годы'} · ${sortNames[f.sort]} · ${items.length} загружено${stale ? ' · сохранённая подборка' : ''}`;
  }

  get selectedId() {
    return this.payload.globals.catalog.selectedId;
  }

  get scroll() {
    return this.payload.globals.catalog.scroll;
  }

  protected didMount() {
    this.start();
  }

  start() {
    const session = this.payload.globals.catalog;
    const cached = session.data;
    if (cached && Date.now() - cached.updatedAt < 3600000 &&
      (Object.keys(session.filters) as (keyof Filters)[]).every(key => cached.filters[key] === session.filters[key])) {
      this.data = cached;
      this.focusTarget = session.selectedId ? 'restore' : 'filters';
      this.focusRevision++;
    } else {
      this.focusTarget = 'filters';
      this.focusRevision++;
      this.load(!!session.selectedId);
    }
  }

  setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    this.draft = { ...this.draft, [key]: value, ...(key === 'type' ? { genre: '' } : {}) };
  }

  apply() {
    this.payload.globals.catalog.filters = { ...this.draft, page: 1 };
    this.draft = { ...this.payload.globals.catalog.filters };
    this.resetSelection();
    this.load(true);
  }

  private resetSelection() {
    Object.assign(this.payload.globals.catalog, { data: null, selectedId: null, scroll: 0 });
  }

  load(focus = true) {
    const request = ++this.request;
    const f = { ...this.payload.globals.catalog.filters, page: 1 };
    this.payload.globals.catalog.filters = f;
    this.loadingMore = false; this.moreError = '';
    this.loading = true;
    this.error = '';
    this.data = null;
    const query = (Object.keys(f) as (keyof Filters)[])
      .map(key => `${key}=${encodeURIComponent(f[key])}`).join('&');
    this.payload.bridge.api('catalog/browse?' + query, null, (error, data) => {
      if (this.unmountSignal.aborted || request !== this.request) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else {
          this.data = data;
          this.genres = data.genres;
          Object.assign(this.payload.globals.catalog, { data, genres: data.genres });
        }
        if (focus) {
          this.focusTarget = this.payload.globals.catalog.selectedId ? 'restore' : 'results';
          this.focusRevision++;
        }
      });
    });
  }

  loadMore() {
    if (this.loading || this.loadingMore || !this.data?.hasMore) return;
    const previous = this.data;
    const request = ++this.request;
    const filters = { ...previous.filters, page: previous.filters.page + 1 };
    const query = (Object.keys(filters) as (keyof Filters)[])
      .map(key => `${key}=${encodeURIComponent(filters[key])}`).join('&');
    this.loadingMore = true; this.moreError = '';
    this.payload.bridge.api('catalog/browse?' + query, null, (error, data) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loadingMore = false;
        if (error) { this.moreError = error.message; return; }
        const seen = new Set(previous.items.map(item => item.id));
        const added = data.items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
        this.data = { ...data, items: [...previous.items, ...added], hasMore: data.hasMore && added.length > 0 };
        Object.assign(this.payload.globals.catalog, { data: this.data, filters: data.filters, genres: data.genres });
      });
    });
  }

  open(item: CatalogItem, scroll: number) {
    Object.assign(this.payload.globals.catalog, { selectedId: item.id, scroll });
    this.payload.bridge.openItem(item);
  }

  protected willUnmount() {
    // Ignore callbacks even if a response arrives while Solid disposes the view.
    this.request++;
  }
}
