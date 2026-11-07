import { For, Show } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { DownloadsVM } from '../model';
import { ScreenMessage } from '../../../app/ui/screen-message';

export const Downloads = withViewModel(DownloadsVM, ({ model }) => (
  <div
    ref={(element) => {
      model.root = element;
    }}
    class="downloads-screen"
  >
    <p class="muted">
      Сохранённые видео доступны без интернета. Дождитесь завершения загрузки
      перед отключением сети. Для скачивания приложение должно оставаться
      открытым.
    </p>
    <Show when={model.loading}>
      <ScreenMessage
        title="Открываем скачанное…"
        text="Загружаем список сохранённых видео."
        busy
      />
    </Show>
    <Show when={model.error}>
      <ScreenMessage title="Не удалось получить скачанное" text={model.error}>
        <button class="btn" onClick={model.load}>
          Повторить
        </button>
      </ScreenMessage>
    </Show>
    <Show when={!model.loading && !model.error && !model.items.length}>
      <ScreenMessage
        title="Пока ничего не скачано"
        text="Выберите видео и нажмите «Сохранить» рядом с файлом. Здесь появятся загрузки и готовые видео."
      />
    </Show>
    <For each={model.items}>
      {(item) => (
        <div class="download-card">
          <div class="download-info">
            <h2>{item.identity.title}</h2>
            <p class="muted">
              {item.identity.torrentTitle}
              {item.identity.quality ? ' · ' + item.identity.quality + 'p' : ''}
              {item.identity.voice ? ' · ' + item.identity.voice : ''}
            </p>
            <p role="status" classList={{ error: item.state === 'error' }}>
              {model.status(item)}
            </p>
            <Show when={item.state === 'downloading'}>
              <progress
                aria-label={'Скачивание ' + item.identity.title}
                max={item.total || undefined}
                value={item.total ? item.received : undefined}
              />
            </Show>
          </div>
          <div class="download-actions">
            <Show when={item.state === 'ready'}>
              <button
                class="btn primary"
                onClick={() => model.globals.playDownload(item)}
              >
                Смотреть
              </button>
            </Show>
            <Show when={item.state === 'error'}>
              <button
                class="btn"
                disabled={model.busy.includes(item.id)}
                onClick={() => model.retry(item)}
              >
                Повторить
              </button>
            </Show>
            <button
              class="btn"
              disabled={model.busy.includes(item.id)}
              onClick={() => model.remove(item)}
            >
              {item.state === 'queued' || item.state === 'downloading'
                ? 'Отменить'
                : 'Удалить'}
            </button>
          </div>
        </div>
      )}
    </For>
  </div>
));
