import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { HomeData } from '../../../shared/types/screens';

export class HomeVM extends VM {
  data: HomeData | null = null;
  loading = false;
  error = '';
  private request = 0;
  private restoreFocus() {
    this.afterRender((root) => {
      const cards = Array.from(
        root.querySelectorAll<HTMLButtonElement>('[data-catalog-id]'),
      );
      (
        cards.find(
          (card) =>
            card.dataset.catalogId === this.globals.app.state.lastHomeId,
        ) ||
        cards[0] ||
        root.querySelector<HTMLButtonElement>('button')
      )?.focus();
      const main = document.getElementById('main');
      if (main) main.scrollTop = this.globals.app.state.homeScroll || 0;
    });
  }

  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, {
      data: observable.ref,
      loading: observable,
      error: observable,
      load: action,
    });
  }
  protected didMount() {
    const cached = this.globals.app.state.homeData;
    if (cached && Date.now() - cached.updatedAt < 3 * 60 * 60 * 1000) {
      this.data = cached;
      this.restoreFocus();
    } else this.load();
  }
  load() {
    const request = ++this.request;
    this.loading = true;
    this.error = '';
    this.globals.app.api<HomeData>('catalog/home', null, (error, data) => {
      if (this.unmountSignal.aborted || request !== this.request) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else {
          this.data = data;
          this.globals.app.state.homeData = data;
        }
        this.restoreFocus();
      });
    });
  }
  protected willUnmount() {
    this.request++;
  }
}
