import { action, makeObservable, observable } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { HistoryItem } from '../../../shared/types/screens';

export class HistoryVM extends VM {
  items: HistoryItem[];
  constructor(params: ViewModelParams) {
    super(params);
    this.items = this.globals.app.history();
    makeObservable(this, { items: observable.ref, clear: action });
  }
  clear() {
    this.globals.app.clearHistory(); this.items = [];
    document.querySelector<HTMLButtonElement>('[data-view="history"]')?.focus();
  }
}
