import { For, Show } from 'solid-js';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { SearchVM } from '../model';
import { ScreenMessage } from '../../../app/ui/screen-message';
import { TorrentRow } from '../../../app/ui/torrent-row';

export const Search = withViewModel(SearchVM, () => {
  const model = useViewModel<SearchVM>();
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
      class="search-screen"
    >
      <form
        class="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          model.search();
        }}
      >
        <input
          id="query"
          class="input"
          placeholder="Название фильма или сериала"
          value={model.query}
          maxLength={160}
          autocomplete="off"
          aria-label="Название фильма или сериала"
          onInput={(event) => model.setQuery(event.currentTarget.value)}
        />
        <button class="btn primary" type="submit">
          Найти →
        </button>
        <button class="btn" type="button" onClick={() => model.filmix()}>
          Filmix
        </button>
      </form>
      <div class="muted">
        Поиск раздач · VilkaDB / Rutor / Torznab / Jacred · Воспроизведение
        через ваш TorrServer
      </div>
      <div id="search-results" aria-busy={model.loading}>
        <Show when={!model.searched}>
          <ScreenMessage
            title="От названия до первого кадра."
            text="Найдите раздачу, выберите подходящий размер и качество. TorrServer подготовит поток, а телевизор начнёт просмотр."
          >
            <button class="btn" onClick={() => model.search('Big Buck Bunny')}>
              Попробовать Big Buck Bunny
            </button>
            <div class="steps">
              <span>01 Найдите фильм</span>
              <span>02 Выберите раздачу</span>
              <span>03 Смотрите на ТВ</span>
            </div>
          </ScreenMessage>
        </Show>
        <Show when={model.searched && !model.results.length}>
          <p class={model.error ? 'error-text' : 'muted'}>{model.status}</p>
          <Show when={model.error}>
            <button class="btn" onClick={() => model.search()}>
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
              onChange={(event) => model.setSort(event.currentTarget.value)}
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
                onOpen={() => model.globals.openSearch(result)}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  );
});
