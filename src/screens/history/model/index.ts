import { action, makeObservable, observable } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import type { HistoryItem } from '../../../shared/types/screens';

export interface HistoryBridge {
  items: HistoryItem[];
  limit: number;
  time: (seconds: number) => string;
  resume: (item: HistoryItem) => void;
  clear: () => void;
}
export class HistoryVM extends ViewModelBase<{ bridge: HistoryBridge }> {
  items: HistoryItem[];
  constructor(params: ViewModelParams<{ bridge: HistoryBridge }>) {
    super(params);
    this.items = this.payload.bridge.items;
    makeObservable(this, { items: observable.ref, clear: action });
  }
  get bridge() { return this.payload.bridge; }
  clear() {
    this.bridge.clear(); this.items = [];
    document.querySelector<HTMLButtonElement>('[data-view="history"]')?.focus();
  }
}
