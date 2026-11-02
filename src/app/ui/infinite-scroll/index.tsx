import { Show } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { InfiniteScrollVM, type InfiniteScrollPayload } from './model';

const InfiniteScrollView = withViewModel(InfiniteScrollVM, ({ model }) => {
  const props = model.payload;
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
      class="infinite-scroll-status"
      aria-live="polite"
      aria-busy={props.loading}
    >
      <Show when={props.loading}>
        <span class="muted">Загружаем ещё…</span>
      </Show>
      <Show when={props.error}>
        <p class="error-text">{props.error}</p>
        <button class="btn" onClick={props.onMore}>
          Повторить загрузку
        </button>
      </Show>
      <Show
        when={
          !props.loading && !props.error && !props.hasMore && props.count > 0
        }
      >
        <span class="muted">Всё загружено</span>
      </Show>
    </div>
  );
});

export function InfiniteScroll(props: InfiniteScrollPayload) {
  return <InfiniteScrollView payload={props} />;
}
