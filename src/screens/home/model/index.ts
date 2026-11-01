import { action, makeObservable, observable, runInAction } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import type { CatalogItem } from '../../../globals/catalog';
import type { HistoryItem, ScreenAPI } from '../../../shared/types/screens';

interface HomeData {
  sections: { id: string; title: string; items: CatalogItem[] }[];
  updatedAt: number;
  stale?: boolean;
  partial?: boolean;
}
export interface HomeBridge {
  api: ScreenAPI;
  session: { homeData: HomeData | null; homeScroll: number; lastHomeId: string | null };
  history: HistoryItem[];
  time: (seconds: number) => string;
  openItem: (item: CatalogItem) => void;
  search: () => void;
  resume: (item: HistoryItem) => void;
}

export class HomeVM extends ViewModelBase<{ bridge: HomeBridge }> {
  data: HomeData | null = null;
  loading = false;
  error = '';
  focusRevision = 0;
  private request = 0;
  constructor(params: ViewModelParams<{ bridge: HomeBridge }>) {
    super(params);
    makeObservable(this, { data: observable.ref, loading: observable, error: observable, focusRevision: observable, load: action });
  }
  get bridge() { return this.payload.bridge; }
  protected didMount() {
    const cached = this.bridge.session.homeData;
    if (cached && Date.now() - cached.updatedAt < 3 * 60 * 60 * 1000) {
      this.data = cached; this.focusRevision++;
    } else this.load();
  }
  load() {
    const request = ++this.request;
    this.loading = true; this.error = '';
    this.bridge.api<HomeData>('catalog/home', null, (error, data) => {
      if (this.unmountSignal.aborted || request !== this.request) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else { this.data = data; this.bridge.session.homeData = data; }
        this.focusRevision++;
      });
    });
  }
  protected willUnmount() { this.request++; }
}
