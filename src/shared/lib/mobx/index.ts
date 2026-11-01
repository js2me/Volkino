import { ViewModelBase } from 'mobx-view-model';
import type { Globals } from '../../../globals';

export class VM<Payload extends object = {}> extends ViewModelBase<Payload> {
  readonly globals: Globals = this.vm.data.globals;
}
