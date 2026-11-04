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
  type CatalogPage,
  type CatalogSource,
  type Filters,
  type Genres,
  sortNames,
} from '../../../globals/catalog';

export class CatalogVM extends VM {
  provider: string;
  sources: CatalogSource[];
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
          ? root.querySelector<HTMLElement>(
              '.catalog-filters select:not(:disabled)',
            )
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
    this.provider =
      this.globals.catalog.provider ||
      this.globals.config.catalogBrowseProvider ||
      'filmix';
    this.sources = this.globals.catalog.sources;
    makeObservable(this, {
      draft: observable.ref,
      genres: observable.ref,
      data: observable.ref,
      loading: observable,
      error: observable,
      summary: computed,
      catalog: computed,
      provider: observable,
      sources: observable.ref,
      selectSource: action.bound,
      setFilter: action,
      apply: action,
      loadMore: action,
      loadingMore: observable,
      moreError: observable,
      load: action,
      start: action,
    });
  }

  get catalog(): CatalogPage {
    const source = this.sources.find((source) => source.id === this.provider);
    return {
      sources: this.sources,
      provider: this.provider,
      note: source?.note || '',
      filters: (source?.fields || []).map((field) => {
        const values = field.optionsByType
          ? this.data
            ? this.genres[this.draft.type]
            : field.optionsByType[this.draft.type]
          : field.options;
        const options = field.optionsByType
          ? [...field.options, ...values]
          : values;
        return {
          ...field,
          options,
          value: String(this.draft[field.key]),
          disabled: options.length < 2,
        };
      }),
      items: this.data?.items || [],
      ready: !!this.data,
      loading: this.loading,
      loadingMore: this.loadingMore,
      error: this.error,
      moreError: this.moreError,
      hasMore: !!this.data?.hasMore,
      summary: this.summary,
      selectSource: this.selectSource,
      setFilter: (key, value) =>
        this.setFilter(key, key === 'minRating' ? Number(value) : value),
      apply: () => this.apply(),
      retry: () => (this.sources.length ? this.load() : this.start()),
      loadMore: () => this.loadMore(),
      open: (item, scroll) => this.open(item, scroll),
    };
  }

  selectSource(provider: string) {
    const source = this.sources.find((source) => source.id === provider);
    if (!source || provider === this.provider) return;
    this.request++;
    this.provider = provider;
    const filters: Filters = {
      type: 'movie',
      genre: '',
      minRating: 0,
      year: '',
      sort: 'popular',
      page: 1,
    };
    for (const field of source.fields)
      Object.assign(filters, {
        [field.key]:
          field.key === 'minRating'
            ? Number(field.defaultValue)
            : field.defaultValue,
      });
    this.draft = filters;
    Object.assign(this.globals.catalog, {
      provider,
      filters,
      genres: { movie: [], tv: [] },
    });
    this.resetSelection();
    this.globals.config = {
      ...this.globals.config,
      catalogBrowseProvider: provider,
    };
    this.globals.api('config', { catalogBrowseProvider: provider }, (error) => {
      if (error && !this.unmountSignal.aborted)
        this.globals.toast(error.message);
    });
    this.load(false);
  }

  get summary() {
    if (!this.data) return '';
    const { filters: f, items, genres, stale } = this.data;
    const genre = genres[f.type].find((g) => g.id === f.genre);
    const source = this.sources.find((source) => source.id === this.provider);
    const labels = source?.fields.map((field) => {
      if (field.key === 'genre') return genre?.name || 'Все жанры';
      if (field.key === 'minRating')
        return f.minRating ? 'рейтинг от ' + f.minRating : 'Любой рейтинг';
      if (field.key === 'year') return f.year || 'Все годы';
      return (
        field.options.find((option) => option.id === String(f[field.key]))
          ?.name || ''
      );
    }) || [
      f.type === 'tv' ? 'Сериалы' : 'Фильмы',
      genre?.name || 'Все жанры',
      sortNames[f.sort],
    ];
    return `${source?.name || this.data.source || ''} · ${labels.join(' · ')} · ${items.length} загружено${stale ? ' · сохранённая подборка' : ''}`;
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
    if (!this.sources.length) {
      const request = ++this.request;
      this.loading = true;
      this.error = '';
      this.globals.api<{ sources: CatalogSource[] }>(
        'catalog/sources',
        null,
        (error, data) => {
          if (this.unmountSignal.aborted || request !== this.request) return;
          runInAction(() => {
            this.loading = false;
            if (error) {
              this.error = error.message;
              return;
            }
            if (!data.sources.length) {
              this.error = 'Нет доступных источников каталога';
              return;
            }
            this.sources = data.sources;
            this.globals.catalog.sources = data.sources;
            this.start();
          });
        },
      );
      return;
    }
    const source =
      this.sources.find((source) => source.id === this.provider) ||
      this.sources[0];
    if (!this.globals.catalog.provider) {
      this.provider = source.id;
      for (const field of source.fields) {
        if (
          !field.optionsByType &&
          !field.options.some(
            (option) => option.id === String(this.draft[field.key]),
          )
        )
          Object.assign(this.draft, {
            [field.key]:
              field.key === 'minRating'
                ? Number(field.defaultValue)
                : field.defaultValue,
          });
      }
      this.globals.catalog.provider = this.provider;
      this.globals.catalog.filters = { ...this.draft };
    }
    const session = this.globals.catalog;
    const cached = session.data;
    if (
      cached &&
      (!cached.provider || cached.provider === this.provider) &&
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
    const f: Filters = { ...this.globals.catalog.filters, page: 1 };
    this.globals.catalog.filters = f;
    this.loadingMore = false;
    this.moreError = '';
    this.loading = true;
    this.error = '';
    this.data = null;
    const main = document.getElementById('main');
    if (main) main.scrollTop = 0;
    const query =
      'provider=' +
      encodeURIComponent(this.provider) +
      '&' +
      (Object.keys(f) as (keyof Filters)[])
        .map((key) => `${key}=${encodeURIComponent(f[key])}`)
        .join('&');
    this.globals.api<CatalogData>(
      'catalog/browse?' + query,
      null,
      (error, data) => {
        if (this.unmountSignal.aborted || request !== this.request) return;
        runInAction(() => {
          this.loading = false;
          if (error) this.error = error.message;
          else {
            this.data = data;
            this.draft = { ...data.filters };
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
    const filters: Filters = {
      ...previous.filters,
      page: previous.filters.page + 1,
    };
    const query =
      'provider=' +
      encodeURIComponent(this.provider) +
      '&' +
      (Object.keys(filters) as (keyof Filters)[])
        .map((key) => `${key}=${encodeURIComponent(filters[key])}`)
        .join('&');
    this.loadingMore = true;
    this.moreError = '';
    this.globals.api<CatalogData>(
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
    this.globals.openItem(item, 'catalog');
  }

  protected willUnmount() {
    // Ignore callbacks even if a response arrives while Solid disposes the view.
    this.request++;
  }
}
