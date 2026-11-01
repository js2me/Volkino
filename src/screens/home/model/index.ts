import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { HomeData } from '../../../shared/types/screens';

export class HomeVM extends VM {
  data: HomeData | null = null;
  loading = false;
  error = '';
  focusRevision = 0;
  private request = 0;
  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, { data: observable.ref, loading: observable, error: observable, focusRevision: observable, load: action });
  }
  protected didMount() {
    const cached = this.globals.app.state.homeData;
    if (cached && Date.now() - cached.updatedAt < 3 * 60 * 60 * 1000) {
      this.data = cached; this.focusRevision++;
    } else this.load();
  }
  load() {
    const request = ++this.request;
    this.loading = true; this.error = '';
    this.globals.app.api<HomeData>('catalog/home', null, (error, data) => {
      if (this.unmountSignal.aborted || request !== this.request) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else { this.data = data; this.globals.app.state.homeData = data; }
        this.focusRevision++;
      });
    });
  }
  protected willUnmount() { this.request++; }
}
