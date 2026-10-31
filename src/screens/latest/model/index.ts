import { action, makeObservable, observable, runInAction } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import type { Globals } from '../../../globals';
import type { LatestBridge, LatestDetails, LatestItem, LatestPage } from '../../../globals/latest';

export class LatestVM extends ViewModelBase<{ globals: Globals; bridge: LatestBridge }> {
  data: LatestPage | null = null;
  loading = false;
  error = '';
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
      focusRevision: observable, load: action, page: action, select: action,
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

  page(page: number) {
    Object.assign(this.session, { page, selectedId: null, scroll: 0 });
    this.load(true);
  }

  load(focusResults = false, refresh = false) {
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
