import { For, Show } from 'solid-js';
import { ratingStyle } from '../../../shared/lib/rating-color';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { LatestVM } from '../model';
import { Portal } from 'solid-js/web';
import { InfiniteScroll } from '../../../app/ui/infinite-scroll';
import type { LatestItem } from '../../../globals/latest';

function updated(item: LatestItem) {
  if (!item.updatedAt) return '';
  const date = new Date(item.updatedAt);
  return isNaN(date.getTime())
    ? ''
    : date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export const Latest = withViewModel(LatestVM, () => {
  const model = useViewModel<LatestVM>();
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
      class="latest-screen"
    >
      <Portal mount={document.getElementById('screen-header-tools')!}>
        <button
          id="latest-refresh"
          class="btn"
          onClick={() => model.load(false, true)}
        >
          Обновить список
        </button>
      </Portal>
      <div id="latest-results" aria-busy={model.loading || model.loadingMore}>
        <Show when={model.loading}>
          <p class="muted">Загружаем последние добавления…</p>
        </Show>
        <Show when={model.error}>
          <p class="error-text">{model.error}</p>
          <button class="btn" onClick={() => model.load(false, true)}>
            Повторить
          </button>
        </Show>
        <Show when={model.data}>
          {(data) => (
            <>
              <Show when={!data().items.length}>
                <p class="muted">На этой странице пока нет добавлений.</p>
              </Show>
              <div class="latest-layout">
                <div class="latest-list" aria-label="Последние добавления">
                  <For each={data().items}>
                    {(item, index) => (
                      <button
                        class="torrent latest-row"
                        data-latest-id={item.id}
                        data-media-type={item.type}
                        classList={{
                          'latest-selected': model.selected?.id === item.id,
                        }}
                        onFocus={() => {
                          model.select(item);
                          if (
                            index() >= data().items.length - 3 &&
                            !model.moreError
                          )
                            model.loadMore();
                        }}
                        onClick={(event) =>
                          model.open(
                            item,
                            event.currentTarget.parentElement!.scrollTop,
                          )
                        }
                      >
                        <span class="torrent-number">{index() + 1}</span>
                        <span class="torrent-body">
                          <span class="torrent-title">{item.title}</span>
                          <span class="torrent-meta">
                            <span>
                              {item.type === 'tv' ? 'Сериал' : 'Фильм'}
                            </span>
                            <span>{item.year}</span>
                            <Show when={item.episode}>
                              <span>
                                Сезон {item.season}, серия {item.episode}
                              </span>
                            </Show>
                            <Show when={item.updatedAt}>
                              <span class="latest-date">{updated(item)}</span>
                            </Show>
                          </span>
                        </span>
                      </button>
                    )}
                  </For>
                  <InfiniteScroll
                    root={() =>
                      model.root!.querySelector<HTMLElement>('.latest-list')!
                    }
                    count={data().items.length}
                    hasMore={data().hasMore}
                    loading={model.loadingMore}
                    error={model.moreError}
                    onMore={() => model.loadMore()}
                  />
                </div>
                <section
                  class="latest-preview"
                  data-media-type={model.selected?.type}
                  aria-label="Карточка фильма или сериала"
                  aria-busy={model.detailsLoading}
                >
                  <Show when={model.selected}>
                    {(item) => (
                      <>
                        <div class="latest-preview-top">
                          <div class="latest-preview-poster">
                            <span class="poster-fallback">
                              {item().title.slice(0, 1)}
                            </span>
                            <Show
                              when={model.details?.poster || item().poster}
                              keyed
                            >
                              {(poster) => (
                                <img
                                  src={poster}
                                  alt={'Постер: ' + item().title}
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                            </Show>
                          </div>
                          <div class="latest-preview-body">
                            <span class="eyebrow">
                              {item().type === 'tv' ? 'Сериал' : 'Фильм'}
                            </span>
                            <h2>{model.details?.title || item().title}</h2>
                            <Show when={model.details?.originalTitle}>
                              <p class="latest-original">
                                {model.details?.originalTitle}
                              </p>
                            </Show>
                            <p class="latest-preview-meta">
                              {model.details?.year || item().year}
                              {model.details?.duration
                                ? ' · ' + model.details.duration + ' мин'
                                : ''}
                            </p>
                            <div class="latest-ratings">
                              <Show when={model.details?.imdbRating}>
                                <span
                                  style={ratingStyle(model.details?.imdbRating)}
                                >
                                  IMDb{' '}
                                  <strong>{model.details?.imdbRating}</strong>
                                </span>
                              </Show>
                              <Show when={model.details?.kpRating}>
                                <span
                                  style={ratingStyle(model.details?.kpRating)}
                                >
                                  Кинопоиск{' '}
                                  <strong>{model.details?.kpRating}</strong>
                                </span>
                              </Show>
                            </div>
                            <Show when={item().quality}>
                              <p class="latest-quality">{item().quality}</p>
                            </Show>
                            <Show when={item().episode}>
                              <p class="latest-quality">
                                Сезон {item().season}, серия {item().episode}
                              </p>
                            </Show>
                            <Show when={model.detailsLoading}>
                              <p class="muted">Загружаем описание…</p>
                            </Show>
                            <Show when={model.detailsError}>
                              <p class="muted">{model.detailsError}</p>
                            </Show>
                            <Show when={model.details}>
                              {(details) => (
                                <>
                                  <p class="latest-genres">
                                    {details().genres.join(' · ')}
                                    {details().countries.length
                                      ? ' / ' + details().countries.join(', ')
                                      : ''}
                                  </p>
                                  <p class="latest-description">
                                    {details().description ||
                                      'Описание пока отсутствует.'}
                                  </p>
                                  <Show when={details().directors.length}>
                                    <p class="latest-credits">
                                      Режиссёр: {details().directors.join(', ')}
                                    </p>
                                  </Show>
                                  <Show when={details().actors.length}>
                                    <p class="latest-credits">
                                      В ролях:{' '}
                                      {details().actors.slice(0, 5).join(', ')}
                                    </p>
                                  </Show>
                                </>
                              )}
                            </Show>
                            <p class="latest-preview-hint">
                              ↑ ↓ — выбрать · OK — смотреть
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </Show>
                </section>
              </div>
              <p class="latest-note">
                {data().note}
                {data().stale
                  ? ' · Источник недоступен, показан сохранённый список.'
                  : ''}
              </p>
            </>
          )}
        </Show>
      </div>
    </div>
  );
});
