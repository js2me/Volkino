import { action, makeObservable, observable, runInAction } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import type { ScreenAPI } from '../../../shared/types/screens';

export interface ServerTorrent {
  hash: string;
  title?: string;
  name?: string;
  torrent_size: number;
  stat_string: string;
}
export interface TorrentsBridge {
  api: ScreenAPI;
  bytes: (size: number) => string;
  open: (torrent: ServerTorrent) => void;
}
export class TorrentsVM extends ViewModelBase<{ bridge: TorrentsBridge }> {
  items: ServerTorrent[] = [];
  loading = false;
  error = '';
  focusRevision = 0;
  private request = 0;
  constructor(params: ViewModelParams<{ bridge: TorrentsBridge }>) {
    super(params);
    makeObservable(this, { items: observable.ref, loading: observable, error: observable, focusRevision: observable, load: action });
  }
  get bridge() { return this.payload.bridge; }
  protected didMount() { this.load(); }
  load() {
    const request = ++this.request;
    this.loading = true; this.error = '';
    this.bridge.api<ServerTorrent[]>('torrents', null, (error, items) => {
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
