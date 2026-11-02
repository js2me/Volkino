import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type {
  LatestDetails,
  LatestItem,
  LatestPage,
} from '../../../globals/latest';

export class LatestVM extends VM {
  data: LatestPage | null = null;
  loading = false;
  error = '';
  loadingMore = false;
  moreError = '';
  private request = 0;
  selected: LatestItem | null = null;
  details: LatestDetails | null = null;
  detailsLoading = false;
  detailsError = '';
  private detailsEpoch = 0;
  private detailsQueue: LatestItem[] = [];
  private detailsInFlight = new Map<number, number>();
  private detailsFailed = new Set<number>();
  private posterCache = new Map<string, HTMLImageElement>();
  private detailsTimer: ReturnType<typeof setTimeout> | undefined;
  private detailsCache = new Map<number, LatestDetails>();

  private restoreFocus() {
    this.afterRender((root) => {
      const rows = Array.from(
        root.querySelectorAll<HTMLButtonElement>('[data-latest-id]'),
      );
      const selected = rows.find(
        (row) => row.dataset.latestId === this.session.selectedId,
      );
      (
        selected ||
        rows[0] ||
        root.querySelector<HTMLElement>('#latest-results button')
      )?.focus();
      const list = root.querySelector<HTMLElement>('.latest-list');
      if (list) list.scrollTop = selected ? this.session.scroll : 0;
    });
  }

  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, {
      data: observable.ref,
      loading: observable,
      error: observable,
      load: action,
      loadMore: action,
      select: action,
      loadingMore: observable,
      moreError: observable,
      selected: observable.ref,
      details: observable.ref,
      detailsLoading: observable,
      detailsError: observable,
    });
  }

  get session() {
    return this.globals.latest;
  }

  protected didMount() {
    if (!this.session.selectedId) {
      this.afterRender(() =>
        document.getElementById('latest-refresh')?.focus(),
      );
    }
    const cached = this.session.data;
    if (
      cached &&
      cached.source === 'filmix' &&
      cached.page === this.session.page &&
      Date.now() - cached.updatedAt < 300000
    ) {
      this.data = cached;
      this.select(
        cached.items.find((item) => item.id === this.session.selectedId) ||
          cached.items[0],
      );
      this.restoreFocus();
    } else this.load(true);
  }

  load(focusResults = false, refresh = false) {
    Object.assign(this.session, {
      page: 1,
      selectedId: null,
      scroll: 0,
      data: null,
    });
    this.loadingMore = false;
    this.moreError = '';
    const request = ++this.request;
    this.loading = true;
    this.error = '';
    this.data = null;
    this.detailsEpoch++;
    this.detailsFailed.clear();
    if (refresh) this.detailsCache.clear();
    this.select();
    this.globals.api<LatestPage>(
      `latest?page=${this.session.page}${refresh ? '&refresh=1' : ''}`,
      null,
      (error, data) => {
        if (request !== this.request || this.unmountSignal.aborted) return;
        runInAction(() => {
          this.loading = false;
          if (error) this.error = error.message;
          else {
            this.data = data;
            this.session.data = data;
            this.select(
              data.items.find((item) => item.id === this.session.selectedId) ||
                data.items[0],
            );
          }
          if (focusResults || this.session.selectedId) this.restoreFocus();
        });
      },
    );
  }

  loadMore() {
    if (this.loading || this.loadingMore || !this.data?.hasMore) return;
    const previous = this.data;
    const request = ++this.request;
    this.loadingMore = true;
    this.moreError = '';
    this.globals.api<LatestPage>(
      `latest?page=${previous.page + 1}`,
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
          Object.assign(this.session, { data: this.data, page: data.page });
          if (!this.detailsTimer) this.queueDetails();
        });
      },
    );
  }

  select(item?: LatestItem, force = false) {
    if (!force && item && this.selected?.id === item.id) return;
    clearTimeout(this.detailsTimer);
    this.detailsTimer = undefined;
    this.detailsQueue = [];
    if (item && force) this.detailsCache.delete(item.filmixId);
    if (item) this.detailsFailed.delete(item.filmixId);
    this.selected = item || null;
    this.details = (item && this.detailsCache.get(item.filmixId)) || null;
    this.detailsError = '';
    this.detailsLoading = !!item && !this.details;
    if (!item) return;
    // Cached details appear immediately; brief focus changes do not start new work.
    this.detailsTimer = setTimeout(() => {
      this.detailsTimer = undefined;
      this.queueDetails();
    }, 120);
  }

  private warmPoster(url?: string) {
    if (!url || this.posterCache.has(url)) return;
    const image = new Image();
    image.src = url;
    this.posterCache.set(url, image);
    // Retain only a small neighborhood of decoded posters on the TV.
    while (this.posterCache.size > 12)
      this.posterCache.delete(this.posterCache.keys().next().value!);
  }

  private queueDetails() {
    if (this.unmountSignal.aborted || !this.selected || !this.data) return;
    const index = this.data.items.findIndex(
      (item) => item.id === this.selected!.id,
    );
    if (index < 0) return;
    // Fetch the selected title first, then three ahead and one behind.
    const nearby = [
      this.selected,
      ...this.data.items.slice(index + 1, index + 4),
      ...this.data.items.slice(Math.max(0, index - 1), index),
    ];
    nearby.forEach((item) =>
      this.warmPoster(
        this.detailsCache.get(item.filmixId)?.poster || item.poster,
      ),
    );
    this.detailsQueue = nearby.filter(
      (item) =>
        !this.detailsCache.has(item.filmixId) &&
        !this.detailsInFlight.has(item.filmixId) &&
        !this.detailsFailed.has(item.filmixId),
    );
    this.pumpDetails();
  }

  private pumpDetails() {
    // At most two requests, including prefetches promoted by a focus change.
    while (
      !this.unmountSignal.aborted &&
      this.detailsInFlight.size < 2 &&
      this.detailsQueue.length
    ) {
      const item = this.detailsQueue.shift()!;
      if (this.detailsInFlight.has(item.filmixId)) continue;
      const epoch = this.detailsEpoch;
      this.detailsInFlight.set(item.filmixId, epoch);
      this.globals.api<LatestDetails>(
        'filmix/details?id=' + item.filmixId,
        null,
        (error, details) => {
          this.detailsInFlight.delete(item.filmixId);
          if (this.unmountSignal.aborted) return;
          runInAction(() => {
            if (epoch === this.detailsEpoch) {
              if (error) this.detailsFailed.add(item.filmixId);
              else {
                this.detailsCache.set(item.filmixId, details);
                while (this.detailsCache.size > 60)
                  this.detailsCache.delete(
                    this.detailsCache.keys().next().value!,
                  );
                this.warmPoster(details.poster);
              }
              if (this.selected?.filmixId === item.filmixId) {
                this.detailsLoading = false;
                this.detailsError = error ? 'Описание временно недоступно' : '';
                if (!error) this.details = details;
              }
            }
            // Rebuild around the latest selection, dropping obsolete queued work.
            if (!this.detailsTimer) this.queueDetails();
          });
        },
      );
    }
  }

  open(item: LatestItem, scroll: number) {
    Object.assign(this.session, { selectedId: item.id, scroll });
    this.globals.openFilmix(item.filmixId, item.title);
  }

  protected willUnmount() {
    this.request++;
    this.detailsEpoch++;
    clearTimeout(this.detailsTimer);
    this.detailsQueue = [];
    this.posterCache.clear();
  }
}
