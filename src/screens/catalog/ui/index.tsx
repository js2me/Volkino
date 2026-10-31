import { For, Show, createEffect } from 'solid-js';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { CatalogVM } from '../model';
import { Pagination as PageNavigation } from '../../../app/ui/pagination';
import { Field } from '../../../app/ui/field';
import { type Filters, sortNames } from '../../../globals/catalog';

export const Catalog = withViewModel(CatalogVM, () => {
  const model = useViewModel<CatalogVM>();
  let root!: HTMLDivElement;
  const main = () => document.getElementById('main')!;
  const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => String(new Date().getFullYear() - i));

  createEffect(() => {
    const revision = model.focusRevision;
    const target = model.focusTarget;
    if (!revision) return;
    // Wait for Solid to insert the result cards before restoring remote focus.
    queueMicrotask(() => {
      if (!model.isMounted || revision !== model.focusRevision) return;
      const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-catalog-id]'));
      const selected = target === 'restore' && cards.find(card => card.dataset.catalogId === model.selectedId);
      const element = target === 'filters' ? root.querySelector<HTMLElement>('#catalog-type') :
        selected || cards[0] || root.querySelector<HTMLElement>('#catalog-results button') || root.querySelector<HTMLElement>('#catalog-apply');
      element?.focus();
      if (target !== 'filters') main().scrollTop = target === 'restore' ? model.scroll : 0;
    });
  });
  const Pagination = () => <Show when={model.data}>{data => <PageNavigation page={data().filters.page} hasMore={data().hasMore} onPage={page => model.page(page)} />}</Show>;

  return <div ref={root}>
    <form class="catalog-filters" onSubmit={event => { event.preventDefault(); model.apply(); }}>
      <Field id="catalog-type" label="Тип">
        <select id="catalog-type" class="input" value={model.draft.type} onChange={event => model.setFilter('type', event.currentTarget.value as Filters['type'])}>
          <option value="movie">Фильмы</option><option value="tv">Сериалы</option>
        </select>
      </Field>
      <Field id="catalog-genre" label="Жанр">
        <select id="catalog-genre" class="input" disabled={!model.genres[model.draft.type].length} onChange={event => model.setFilter('genre', event.currentTarget.value)}>
          <option value="" selected={model.draft.genre === ''}>Все жанры</option>
          <For each={model.genres[model.draft.type]}>{genre => <option value={genre.id} selected={model.draft.genre === genre.id}>{genre.name}</option>}</For>
        </select>
      </Field>
      <Field id="catalog-rating" label="Рейтинг от">
        <select id="catalog-rating" class="input" value={String(model.draft.minRating)} onChange={event => model.setFilter('minRating', Number(event.currentTarget.value))}>
          <option value="0">Любой</option>
          <For each={[5, 6, 7, 8, 9]}>{rating => <option value={String(rating)}>От {rating}</option>}</For>
        </select>
      </Field>
      <Field id="catalog-year" label="Год">
        <select id="catalog-year" class="input" value={model.draft.year} onChange={event => model.setFilter('year', event.currentTarget.value)}>
          <option value="">Все годы</option><For each={years}>{year => <option value={year}>{year}</option>}</For>
        </select>
      </Field>
      <Field id="catalog-sort" label="Сортировка">
        <select id="catalog-sort" class="input" value={model.draft.sort} onChange={event => model.setFilter('sort', event.currentTarget.value as Filters['sort'])}>
          <For each={Object.keys(sortNames) as Filters['sort'][]}>{sort => <option value={sort}>{sortNames[sort]}</option>}</For>
        </select>
      </Field>
      <button id="catalog-apply" type="submit" class="btn primary">Показать</button>
    </form>
    <p class="muted">Стрелки — переход между полями · OK — выбрать значение. Нажмите «Показать», чтобы применить фильтры. Сортировка — в пределах страницы.</p>
    <div id="catalog-results" aria-busy={model.loading}>
      <Show when={model.loading}><p class="muted">Загружаем каталог…</p></Show>
      <Show when={model.error}><p class="error-text">{model.error}</p><button class="btn" onClick={() => model.load()}>Повторить</button></Show>
      <Show when={model.data}>{data => <>
        <div class="catalog-summary">{model.summary}</div>
        <Pagination />
        <Show when={!data().items.length}><p class="muted">По этим фильтрам ничего не найдено. Попробуйте другой год, жанр или уменьшите рейтинг.</p></Show>
        <div class="catalog-grid">
          <For each={data().items}>{item => <button class="poster-card" data-catalog-id={item.id} aria-label={item.title + (item.year ? ' · ' + item.year : '')} onClick={() => model.open(item, main().scrollTop)}>
            <div class="poster-art">
              <span class="poster-fallback">{item.title.slice(0, 1)}</span>
              <Show when={item.poster}><img alt="" src={item.poster} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /></Show>
              <Show when={item.rating}><span class="poster-rating">{item.rating}</span></Show>
            </div>
            <span class="poster-name">{item.title}</span>
            <span class="poster-meta">{item.year || ''}{item.type === 'tv' ? ' · Сериал' : ' · Фильм'}</span>
          </button>}</For>
        </div>
        <Show when={data().items.length}><Pagination /></Show>
      </>}</Show>
    </div>
  </div>;
});
