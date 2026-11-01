import { action, makeObservable, observable, runInAction } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import type { Globals } from '../../../globals';
import type { LatestBridge, LatestDetails, LatestItem, LatestPage } from '../../../globals/latest';

export class LatestVM extends ViewModelBase<{ globals: Globals; bridge: LatestBridge }> {
  data: LatestPage | null = null;
  loading = false;
  error = '';
  loadingMore = false;
  moreError = '';
  focusRevision = 0;
  private request = 0;
  selected: LatestItem | null = null;
  details: LatestDetails | null = null;
  detailsLoading = false;
  detailsError = '';
  private detailsRequest = 0;
  private detailsTimer: ReturnType<typeof setTimeout> | undefined;
  private detailsCache = new Map<number, LatestDetails>();

  constructor(params: ViewModelParams<{ globals: Globals; bridge: LatestBridge }>) {
    super(params);
    makeObservable(this, { data: observable.ref, loading: observable, error: observable,
      focusRevision: observable, load: action, loadMore: action, select: action,
      loadingMore: observable, moreError: observable,
      selected: observable.ref, details: observable.ref, detailsLoading: observable, detailsError: observable });
  }

  get session() { return this.payload.globals.latest; }

  protected didMount() {
    const cached = this.session.data;
    if (cached && cached.source === 'filmix' && cached.page === this.session.page && Date.now() - cached.updatedAt < 300000) {
      this.data = cached;
      this.select(cached.items.find(item => item.id === this.session.selectedId) || cached.items[0]);
      this.focusRevision++;
    } else this.load(true);
  }

  load(focusResults = false, refresh = false) {
    Object.assign(this.session, { page: 1, selectedId: null, scroll: 0, data: null });
    this.loadingMore = false; this.moreError = '';
    const request = ++this.request;
    this.loading = true; this.error = ''; this.data = null;
    this.select();
    this.payload.bridge.api(`latest?page=${this.session.page}${refresh ? '&refresh=1' : ''}`, null, (error, data) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else {
          this.data = data; this.session.data = data;
          this.select(data.items.find(item => item.id === this.session.selectedId) || data.items[0]);
        }
        if (focusResults || this.session.selectedId) this.focusRevision++;
      });
    });
  }

  loadMore() {
    if (this.loading || this.loadingMore || !this.data?.hasMore) return;
    const previous = this.data;
    const request = ++this.request;
    this.loadingMore = true; this.moreError = '';
    this.payload.bridge.api(`latest?page=${previous.page + 1}`, null, (error, data) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loadingMore = false;
        if (error) { this.moreError = error.message; return; }
        const seen = new Set(previous.items.map(item => item.id));
        const added = data.items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
        this.data = { ...data, items: [...previous.items, ...added], hasMore: data.hasMore && added.length > 0 };
        Object.assign(this.session, { data: this.data, page: data.page });
      });
    });
  }

  select(item?: LatestItem, force = false) {
    if (!force && item && this.selected?.id === item.id) return;
    clearTimeout(this.detailsTimer);
    const request = ++this.detailsRequest;
    this.selected = item || null;
    this.details = item && this.detailsCache.get(item.filmixId) || null;
    this.detailsError = '';
    this.detailsLoading = !!item && !this.details;
    if (!item || this.details && !force) return;
    this.detailsTimer = setTimeout(() => {
      this.payload.bridge.api<LatestDetails>('filmix/details?id=' + item.filmixId, null, (error, details) => {
        if (request !== this.detailsRequest || this.unmountSignal.aborted) return;
        runInAction(() => {
          this.detailsLoading = false;
          if (error) this.detailsError = 'Описание временно недоступно';
          else {
            this.details = details;
            this.detailsCache.set(item.filmixId, details);
          }
        });
      });
    }, 180);
  }

  open(item: LatestItem, scroll: number) {
    Object.assign(this.session, { selectedId: item.id, scroll });
    this.payload.bridge.openFilmix(item.filmixId, item.title);
  }

  protected willUnmount() { this.request++; this.detailsRequest++; clearTimeout(this.detailsTimer); }
}
