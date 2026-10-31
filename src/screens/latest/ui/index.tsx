import { For, Show, createEffect, onMount } from 'solid-js';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { LatestVM } from '../model';
import { Portal } from 'solid-js/web';
import { Pagination as PageNavigation } from '../../../app/ui/pagination';
import type { LatestItem } from '../../../globals/latest';

function updated(item: LatestItem) {
  if (!item.updatedAt) return '';
  const date = new Date(item.updatedAt);
  return isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const Latest = withViewModel(LatestVM, () => {
  const model = useViewModel<LatestVM>();
  let root!: HTMLDivElement;
  onMount(() => { if (!model.session.selectedId) root.querySelector<HTMLElement>('#latest-refresh')?.focus(); });
  createEffect(() => {
    const revision = model.focusRevision;
    if (!revision) return;
    queueMicrotask(() => {
      if (!model.isMounted || revision !== model.focusRevision) return;
      const rows = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-latest-id]'));
      const selected = rows.find(row => row.dataset.latestId === model.session.selectedId);
      (selected || rows[0] || root.querySelector<HTMLElement>('#latest-results button'))?.focus();
      const list = root.querySelector<HTMLElement>('.latest-list');
      if (list) list.scrollTop = selected ? model.session.scroll : 0;
    });
  });
  const Pagination = () => <Show when={model.data}>{data => <PageNavigation compact page={data().page} hasMore={data().hasMore} onPage={page => model.page(page)} />}</Show>;
  return <div ref={root} class="latest-screen">
    <Portal mount={document.getElementById('screen-header-tools')!}>
      <button id="latest-refresh" class="btn" onClick={() => model.load(false, true)}>Обновить список</button>
      <Pagination />
    </Portal>
    <div id="latest-results" aria-busy={model.loading}>
      <Show when={model.loading}><p class="muted">Загружаем последние добавления…</p></Show>
      <Show when={model.error}><p class="error-text">{model.error}</p><button class="btn" onClick={() => model.load(false, true)}>Повторить</button></Show>
      <Show when={model.data}>{data => <>
        <Show when={!data().items.length}><p class="muted">На этой странице пока нет добавлений.</p></Show>
        <div class="latest-layout">
        <div class="latest-list" aria-label="Последние добавления">
          <For each={data().items}>{(item, index) => <button class="torrent latest-row" data-latest-id={item.id}
            classList={{ 'latest-selected': model.selected?.id === item.id }}
            onFocus={() => model.select(item)}
            onClick={event => model.open(item, event.currentTarget.parentElement!.scrollTop)}>
            <span class="torrent-number">{index() + 1}</span>
            <span class="torrent-body"><span class="torrent-title">{item.title}</span>
              <span class="torrent-meta"><span>{item.type === 'tv' ? 'Сериал' : 'Фильм'}</span><span>{item.year}</span>
                <Show when={item.episode}><span>Сезон {item.season}, серия {item.episode}</span></Show>
                <Show when={item.updatedAt}><span class="latest-date">{updated(item)}</span></Show>
              </span>
            </span>
          </button>}</For>
        </div>
        <section class="latest-preview" aria-label="Карточка фильма или сериала" aria-busy={model.detailsLoading}>
          <Show when={model.selected}>{item => <>
            <div class="latest-preview-top">
              <div class="latest-preview-poster">
                <span class="poster-fallback">{item().title.slice(0, 1)}</span>
                <Show when={model.details?.poster || item().poster} keyed>{poster => <img src={poster} alt={'Постер: ' + item().title} onError={event => { event.currentTarget.style.display = 'none'; }} />}</Show>
              </div>
              <div class="latest-preview-heading">
                <span class="eyebrow">{item().type === 'tv' ? 'Сериал' : 'Фильм'}</span>
                <h2>{model.details?.title || item().title}</h2>
                <Show when={model.details?.originalTitle}><p class="latest-original">{model.details?.originalTitle}</p></Show>
                <p class="latest-preview-meta">{model.details?.year || item().year}{model.details?.duration ? ' · ' + model.details.duration + ' мин' : ''}</p>
                <div class="latest-ratings">
                  <Show when={model.details?.imdbRating}><span>IMDb <strong>{model.details?.imdbRating}</strong></span></Show>
                  <Show when={model.details?.kpRating}><span>Кинопоиск <strong>{model.details?.kpRating}</strong></span></Show>
                </div>
                <Show when={item().quality}><p class="latest-quality">{item().quality}</p></Show>
                <Show when={item().episode}><p class="latest-quality">Сезон {item().season}, серия {item().episode}</p></Show>
              </div>
            </div>
            <Show when={model.detailsLoading}><p class="muted">Загружаем описание…</p></Show>
            <Show when={model.detailsError}><p class="muted">{model.detailsError}</p></Show>
            <Show when={model.details}>{details => <>
              <p class="latest-genres">{details().genres.join(' · ')}{details().countries.length ? ' / ' + details().countries.join(', ') : ''}</p>
              <p class="latest-description">{details().description || 'Описание пока отсутствует.'}</p>
              <Show when={details().directors.length}><p class="latest-credits">Режиссёр: {details().directors.join(', ')}</p></Show>
              <Show when={details().actors.length}><p class="latest-credits">В ролях: {details().actors.slice(0, 5).join(', ')}</p></Show>
            </>}</Show>
            <p class="latest-preview-hint">↑ ↓ — выбрать · OK — смотреть</p>
          </>}</Show>
        </section>
        </div>
        <Show when={data().items.length}><Pagination /></Show>
        <p class="latest-note">{data().note}{data().stale ? ' · Источник недоступен, показан сохранённый список.' : ''}</p>
      </>}</Show>
    </div>
  </div>;
});
