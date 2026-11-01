import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { ServerTorrent } from '../../../shared/types/screens';

export class TorrentsVM extends VM {
  items: ServerTorrent[] = [];
  loading = false;
  error = '';
  focusRevision = 0;
  private request = 0;
  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, { items: observable.ref, loading: observable, error: observable, focusRevision: observable, load: action });
  }
  protected didMount() { this.load(); }
  load() {
    const request = ++this.request;
    this.loading = true; this.error = '';
    this.globals.app.api<ServerTorrent[]>('torrents', null, (error, items) => {
      if (request !== this.request || this.unmountSignal.aborted) return;
      runInAction(() => {
        this.loading = false;
        if (error) this.error = error.message;
        else this.items = items;
        this.focusRevision++;
      });
    });
  }
  protected willUnmount() { this.request++; }
}
