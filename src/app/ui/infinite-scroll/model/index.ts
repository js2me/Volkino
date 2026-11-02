import { reaction, type IReactionDisposer } from 'mobx';
import { VM } from '../../../../shared/lib/mobx';

export interface InfiniteScrollPayload {
  root: () => HTMLElement;
  count: number;
  hasMore: boolean;
  loading: boolean;
  error: string;
  onMore: () => void;
}

/** Observe the screen's scroll container, including scrolls caused by remote focus. */
export class InfiniteScrollVM extends VM<InfiniteScrollPayload> {
  private scrollRoot: HTMLElement | undefined;
  private stopWatching: IReactionDisposer | undefined;

  private check = () => {
    const props = this.payload;
    if (
      !this.isMounted ||
      !this.root ||
      !this.scrollRoot ||
      !props.hasMore ||
      props.loading ||
      props.error
    )
      return;
    if (
      this.root.getBoundingClientRect().top <=
      this.scrollRoot.getBoundingClientRect().bottom + 240
    )
      props.onMore();
  };

  protected didMount() {
    this.afterRender(() => {
      this.scrollRoot = this.payload.root();
      this.scrollRoot.addEventListener('scroll', this.check, { passive: true });
      window.addEventListener('resize', this.check);
      this.stopWatching = reaction(
        () => [
          this.payload.count,
          this.payload.loading,
          this.payload.hasMore,
          this.payload.error,
        ],
        () => this.afterRender(this.check),
        { fireImmediately: true },
      );
    });
  }

  protected willUnmount() {
    this.stopWatching?.();
    this.scrollRoot?.removeEventListener('scroll', this.check);
    window.removeEventListener('resize', this.check);
    this.scrollRoot = undefined;
  }
}
