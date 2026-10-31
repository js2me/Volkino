import { action, makeObservable, observable } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';

export interface RemoteSelectPayload {
  select: HTMLSelectElement;
  close(): void;
  ready(model: RemoteSelectVM): void;
}

export class RemoteSelectVM extends ViewModelBase<RemoteSelectPayload> {
  readonly options: { label: string; index: number; disabled: boolean }[];
  readonly title: string;
  activeIndex: number;

  constructor(params: ViewModelParams<RemoteSelectPayload>) {
    super(params);
    const select = this.payload.select;
    this.options = Array.from(select.options).map((option, index) => ({
      label: option.text, index, disabled: option.disabled,
    }));
    this.title = (select.id && document.querySelector<HTMLLabelElement>('label[for="' + select.id + '"]')?.textContent) ||
      select.getAttribute('aria-label') || 'Выберите значение';
    this.activeIndex = select.selectedIndex;
    if (!this.options[this.activeIndex] || this.options[this.activeIndex].disabled) {
      this.activeIndex = this.options.find(option => !option.disabled)?.index ?? -1;
    }
    makeObservable(this, { activeIndex: observable, move: action, edge: action });
  }

  protected didMount() {
    this.payload.ready(this);
  }

  move(direction: number) {
    const enabled = this.options.filter(option => !option.disabled);
    const current = enabled.findIndex(option => option.index === this.activeIndex);
    const option = enabled[Math.max(0, Math.min(enabled.length - 1, current + direction))];
    if (option) this.activeIndex = option.index;
  }

  edge(last: boolean) {
    const enabled = this.options.filter(option => !option.disabled);
    const option = enabled[last ? enabled.length - 1 : 0];
    if (option) this.activeIndex = option.index;
  }

  choose(index = this.activeIndex) {
    if (!this.options[index] || this.options[index].disabled) return;
    const select = this.payload.select;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    this.payload.close();
  }
}
