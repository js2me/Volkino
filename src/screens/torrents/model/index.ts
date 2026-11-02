import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { ServerTorrent } from '../../../shared/types/screens';

export class TorrentsVM extends VM {
  items: ServerTorrent[] = [];
  loading = false;
  error = '';
  private request = 0;
  private restoreFocus() {
    this.afterRender((root) =>
      root.querySelector<HTMLButtonElement>('button')?.focus(),
    );
  }

  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, {
      items: observable.ref,
      loading: observable,
      error: observable,
      load: action,
    });
  }
  protected didMount() {
    this.load();
  }
  load() {
    const request = ++this.request;
    this.loading = true;
    this.error = '';
    this.globals.api<ServerTorrent[]>('torrents', null, (error, items) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else this.items = items;
        this.restoreFocus();
      });
    });
  }
  protected willUnmount() {
    this.request++;
  }
}
