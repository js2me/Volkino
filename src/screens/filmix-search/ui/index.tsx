import { For, Show } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { FilmixSearchVM } from '../model';
import { ScreenMessage } from '../../../app/ui/screen-message';
import { TorrentRow } from '../../../app/ui/torrent-row';
export const FilmixSearch = withViewModel(FilmixSearchVM, ({ model }) => {
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
    >
      <Show when={model.loading}>
        <ScreenMessage title="Ищем в Filmix…" text={model.query} busy />
      </Show>
      <Show when={model.error}>
        <ScreenMessage title="Filmix недоступен" text={model.error}>
          <button class="btn" onClick={model.load}>
            Повторить
          </button>
          <button class="btn" onClick={model.back}>
            Назад
          </button>
        </ScreenMessage>
      </Show>
      <Show when={!model.loading && !model.error}>
        <button class="btn" onClick={model.back}>
          ← Назад
        </button>
        <p class="muted">
          Filmix · {model.query} · выберите нужный фильм или сериал
        </p>
        <Show when={!model.results.length}>
          <p class="muted">
            Ничего не найдено. Попробуйте другое название через поиск.
          </p>
        </Show>
        <For each={model.results}>
          {(item, index) => (
            <TorrentRow
              number={index() + 1}
              title={item.title}
              meta={[
                { text: item.year || '' },
                { text: item.originalTitle || '' },
              ]}
              onOpen={() => model.open(item)}
            />
          )}
        </For>
      </Show>
    </div>
  );
});
