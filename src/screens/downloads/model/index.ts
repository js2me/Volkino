import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type {
  DownloadItem,
  DownloadStorage,
} from '../../../app/services/types';

export class DownloadsVM extends VM {
  items: DownloadItem[] = [];
  storage: DownloadStorage | null = null;
  loading = true;
  error = '';
  busy: string[] = [];
  private request = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, {
      items: observable.ref,
      storage: observable.ref,
      loading: observable,
      error: observable,
      busy: observable.ref,
      load: action.bound,
      remove: action.bound,
      retry: action.bound,
    });
  }
  protected didMount() {
    this.load();
  }
  protected willUnmount() {
    clearTimeout(this.timer);
  }
  load() {
    clearTimeout(this.timer);
    const request = ++this.request;
    this.globals.api<{
      items: DownloadItem[];
      storage?: DownloadStorage | null;
    }>('downloads', null, (error, data) => {
      if (this.unmountSignal.aborted || request !== this.request) return;
      runInAction(() => {
        const first = this.loading;
        this.loading = false;
        this.error = error?.message || '';
        this.storage = error ? null : data.storage || null;
        if (!error)
          this.items = data.items.map((item) => {
            const previous = this.items.find((entry) => entry.id === item.id);
            return previous ? Object.assign(previous, item) : observable(item);
          });
        if (first)
          this.afterRender((root) =>
            root.querySelector<HTMLElement>('button')?.focus(),
          );
        this.timer = setTimeout(this.load, 2000);
      });
    });
  }
  private mutate(item: DownloadItem, route: 'remove' | 'retry') {
    if (this.busy.includes(item.id)) return;
    this.busy = [...this.busy, item.id];
    this.request++;
    clearTimeout(this.timer);
    this.globals.api('downloads/' + route, { id: item.id }, (error) => {
      if (this.unmountSignal.aborted) return;
      runInAction(() => {
        this.busy = this.busy.filter((id) => id !== item.id);
        if (error) {
          this.globals.toast(error.message);
          this.load();
        } else {
          if (route === 'remove')
            this.items = this.items.filter((entry) => entry.id !== item.id);
          this.load();
          this.afterRender((root) => {
            const button = root.querySelector<HTMLElement>('button');
            if (button) button.focus();
            else
              document
                .querySelector<HTMLElement>('[data-view="downloads"]')
                ?.focus();
          });
        }
      });
    });
  }
  remove(item: DownloadItem) {
    this.mutate(item, 'remove');
  }
  retry(item: DownloadItem) {
    this.mutate(item, 'retry');
  }
  status(item: DownloadItem) {
    if (item.state === 'error') return item.error;
    if (item.state === 'queued') return 'В очереди';
    if (item.state === 'ready')
      return 'Доступно без интернета · ' + this.globals.bytes(item.received);
    return (
      'Скачиваем · ' +
      this.globals.bytes(item.received) +
      (item.total
        ? ' / ' +
          this.globals.bytes(item.total) +
          ' · ' +
          Math.min(99, Math.floor((100 * item.received) / item.total)) +
          '%'
        : '')
    );
  }
}
