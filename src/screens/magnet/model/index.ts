import { action, makeObservable, observable } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';

export class MagnetVM extends VM {
  link = '';
  constructor(params: ViewModelParams) {
    super(params);
    makeObservable(this, {
      link: observable,
      setLink: action.bound,
      submit: action.bound,
    });
  }
  protected didMount() {
    this.afterRender((root) =>
      root.querySelector<HTMLInputElement>('input')?.focus(),
    );
  }
  setLink(link: string) {
    this.link = link;
  }
  submit() {
    this.globals.openTorrentLink(this.link.trim(), 'Торрент по ссылке');
  }
}
