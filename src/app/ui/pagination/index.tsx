import { Show } from 'solid-js';

export function Pagination(props: {
  compact?: boolean;
  page: number;
  hasMore: boolean;
  onPage(page: number): void;
}) {
  return (
    <div class="catalog-pagination" aria-label="Страницы">
      <Show when={props.page > 1}>
        <button
          class="btn"
          aria-label="← Предыдущая"
          onClick={() => props.onPage(props.page - 1)}
        >
          {props.compact ? '←' : '← Предыдущая'}
        </button>
      </Show>
      <span class="muted">Страница {props.page}</span>
      <Show when={props.hasMore}>
        <button
          class="btn"
          aria-label="Следующая →"
          onClick={() => props.onPage(props.page + 1)}
        >
          {props.compact ? '→' : 'Следующая →'}
        </button>
      </Show>
    </div>
  );
}
