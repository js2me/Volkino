import { Show, createEffect, onCleanup, onMount } from 'solid-js';

/** Observe the screen's scroll container, including scrolls caused by remote focus. */
export function InfiniteScroll(props: {
  root: () => HTMLElement;
  count: number;
  hasMore: boolean;
  loading: boolean;
  error: string;
  onMore: () => void;
}) {
  let marker!: HTMLDivElement;
  let mounted = false;
  const check = () => {
    if (!mounted || !props.hasMore || props.loading || props.error) return;
    const root = props.root();
    if (marker.getBoundingClientRect().top <= root.getBoundingClientRect().bottom + 240) props.onMore();
  };
  onMount(() => {
    mounted = true;
    const root = props.root();
    root.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
    onCleanup(() => {
      mounted = false;
      root.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    });
  });
  createEffect(() => {
    void props.count; void props.loading; void props.hasMore;
    queueMicrotask(check);
  });
  return <div ref={marker} class="infinite-scroll-status" aria-live="polite" aria-busy={props.loading}>
    <Show when={props.loading}><span class="muted">Загружаем ещё…</span></Show>
    <Show when={props.error}><p class="error-text">{props.error}</p><button class="btn" onClick={props.onMore}>Повторить загрузку</button></Show>
    <Show when={!props.loading && !props.error && !props.hasMore && props.count > 0}><span class="muted">Всё загружено</span></Show>
  </div>;
}
