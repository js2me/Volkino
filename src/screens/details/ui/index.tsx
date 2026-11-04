import { For, Show } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { DetailsVM } from '../model';
import { TorrentRow } from '../../../app/ui/torrent-row';
export const Details = withViewModel(DetailsVM, ({ model }) => {
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
    >
      <div id="detail-summary">
        <Show when={model.item}>
          {(item) => (
            <>
              <Show when={item().poster}>
                <div class="movie-backdrop" aria-hidden="true">
                  <img
                    alt=""
                    src={item().poster}
                    onError={(event) => {
                      event.currentTarget.parentElement!.style.display = 'none';
                    }}
                  />
                </div>
              </Show>
              <div class="movie-details">
                <div class="poster-art">
                  <span class="poster-fallback">
                    {item().title.slice(0, 1)}
                  </span>
                  <Show when={item().poster}>
                    <img
                      alt=""
                      src={item().poster}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  </Show>
                </div>
                <div class="movie-detail-body">
                  <div class="eyebrow">
                    {item().type === 'tv' ? 'СЕРИАЛ' : 'ФИЛЬМ'}
                  </div>
                  <h2 class="movie-name">{item().title}</h2>
                  <p class="movie-metadata">
                    {(item().metadata || '').replace(item().title, '').trim()}
                  </p>
                  <p class="movie-description">
                    {model.loading
                      ? 'Загружаем описание…'
                      : item().description || 'Описание пока недоступно.'}
                  </p>
                  <div class="detail-actions">
                    <button class="btn primary" onClick={model.filmix}>
                      Смотреть через Filmix
                    </button>
                    <button class="btn" onClick={model.back}>
                      {model.globals.detailOrigin === 'catalog'
                        ? 'В каталог'
                        : 'На главную'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </Show>
      </div>
      <section class="detail-torrents">
        <h2>Раздачи</h2>
        <Show
          when={
            model.item?.provider === 'filmix' &&
            !model.status &&
            !model.results.length
          }
        >
          <button class="btn" onClick={model.runSearch}>
            Найти раздачи
          </button>
        </Show>
        <div id="search-results">
          <Show
            when={
              !model.results.length &&
              (model.item?.provider !== 'filmix' || model.status)
            }
          >
            <p class={model.error ? 'error-text' : 'muted'}>
              {model.status || 'Ничего не найдено. Попробуйте другое название.'}
            </p>
            <Show when={model.error}>
              <button class="btn" onClick={model.runSearch}>
                Повторить поиск
              </button>
            </Show>
          </Show>
          <Show when={model.results.length}>
            <div class="section-head">
              <h2>{model.results.length} раздач</h2>
              <select
                id="torrent-sort"
                class="input sort"
                aria-label="Сортировка"
                value={model.sort}
                onChange={(event) => {
                  model.setSort(event.currentTarget.value);
                }}
              >
                <option value="seeders">Сначала больше сидов</option>
                <option value="size">Сначала меньше размер</option>
              </select>
            </div>
            <For each={model.sorted}>
              {(result, index) => (
                <TorrentRow
                  number={index() + 1}
                  title={result.title}
                  meta={[
                    { text: model.globals.bytes(result.size) },
                    { text: '↑ ' + result.seeders + ' сидов', cls: 'seed' },
                    { text: result.tracker },
                    { text: result.quality },
                  ]}
                  onOpen={() => model.openTorrent(result, index())}
                />
              )}
            </For>
          </Show>
        </div>
      </section>
    </div>
  );
});
