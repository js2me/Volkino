import { ViewModelBase } from 'mobx-view-model';
import type { Globals } from '../../../globals';

export class VM<Payload extends object = {}> extends ViewModelBase<Payload> {
  root: HTMLElement | undefined;
  private renderRevision = 0;

  /** Run DOM work after the view has rendered, discarding stale or unmounted work. */
  protected afterRender(callback: (root: HTMLElement) => void) {
    const revision = ++this.renderRevision;
    queueMicrotask(() => {
      if (this.isMounted && revision === this.renderRevision && this.root)
        callback(this.root);
    });
  }

  readonly globals: Globals = this.vm.data.globals;
}
