import { For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { withViewModel } from 'mobx-view-model-solid';
import { FilesVM } from '../model';
import { ScreenMessage } from '../../../app/ui/screen-message';
import { Field } from '../../../app/ui/field';
export const Files = withViewModel(FilesVM, ({ model }) => {
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
    >
      <Portal mount={document.getElementById('screen-header-tools')!}>
        <button class="btn mobile-back" onClick={model.back}>
          ← Назад
        </button>
      </Portal>
      <Show when={model.loading}>
        <ScreenMessage
          title={
            model.globals.source === 'filmix'
              ? 'Получаем видео Filmix…'
              : 'Получаем список файлов…'
          }
          text={
            model.globals.source === 'filmix'
              ? 'Загружаем озвучки, сезоны и доступное качество.'
              : 'TorrServer ищет участников раздачи и метаданные. Это может занять до двух минут.'
          }
          busy
        />
      </Show>
      <Show when={model.error || model.timedOut}>
        <ScreenMessage
          title={
            model.timedOut
              ? 'Метаданные пока не получены'
              : model.globals.source === 'filmix'
                ? 'Не удалось открыть Filmix'
                : 'Не удалось получить файлы'
          }
          text={
            model.error ||
            'Возможно, у раздачи нет доступных участников. Попробуйте другую раздачу или повторите запрос.'
          }
        >
          <button class="btn" onClick={() => model.load()}>
            {model.timedOut ? 'Подождать ещё' : 'Повторить'}
          </button>
          <button class="btn" onClick={model.back}>
            Назад
          </button>
        </ScreenMessage>
      </Show>
      <Show when={!model.loading && !model.error && !model.timedOut}>
        <Show
          when={model.globals.source === 'filmix' && model.post}
          fallback={
            <div class="statusbar">
              <span>
                ↓ {model.globals.bytes(model.globals.torrent?.download_speed)}/с
              </span>
              <span>Пиры: {model.globals.torrent?.active_peers || 0}</span>
              <span>Сиды: {model.globals.torrent?.connected_seeders || 0}</span>
              <span>
                Размер:{' '}
                {model.globals.bytes(model.globals.torrent?.torrent_size)}
              </span>
            </div>
          }
        >
          {(post) => (
            <>
              <div class="filmix-filters">
                <Field id="filmix-voice" label="Озвучка">
                  <select
                    id="filmix-voice"
                    class="input"
                    value={model.globals.filmixVoice}
                    onChange={(event) =>
                      model.setFilter('voice', event.currentTarget.value)
                    }
                  >
                    <For each={post().voices}>
                      {(voice) => <option value={voice}>{voice}</option>}
                    </For>
                  </select>
                </Field>
                <Field id="filmix-season" label="Сезон">
                  <select
                    id="filmix-season"
                    class="input"
                    value={String(model.globals.filmixSeason)}
                    onChange={(event) =>
                      model.setFilter('season', event.currentTarget.value)
                    }
                  >
                    <For each={post().seasons}>
                      {(season) => (
                        <option value={String(season)}>
                          {season
                            ? 'Сезон ' + season
                            : post().isSeries
                              ? 'Спецвыпуски'
                              : 'Фильм'}
                        </option>
                      )}
                    </For>
                  </select>
                </Field>
                <Field id="filmix-quality" label="Качество до">
                  <select
                    id="filmix-quality"
                    class="input"
                    value={String(model.globals.filmixQuality)}
                    onChange={(event) =>
                      model.setFilter('quality', event.currentTarget.value)
                    }
                  >
                    <For each={model.qualityLevels}>
                      {(quality) => (
                        <option value={String(quality)}>{quality}p</option>
                      )}
                    </For>
                  </select>
                </Field>
              </div>
              <p class="muted">
                Filmix · до {post().maxQuality}p для текущего аккаунта · позиция
                и просмотренные серии сохраняются на этом ТВ.
              </p>
            </>
          )}
        </Show>
        <p class="muted">
          Выберите видео. Плеер поддерживает перемотку, паузу и продолжение
          просмотра.
        </p>
        <For each={model.globals.files}>
          {(file, index) => (
            <div class="download-file-row">
              <button
                class="torrent file-card"
                onClick={() => model.play(file)}
              >
                <span class="torrent-number">
                  {String(index() + 1).padStart(2, '0')}
                </span>
                <span class="torrent-body">
                  <span class="torrent-title">{file.path}</span>
                  <span class="torrent-meta">
                    <span>
                      {model.globals.source === 'filmix'
                        ? file.voice + ' · ' + file.qualities?.join(' / ') + 'p'
                        : model.globals.bytes(file.length)}
                    </span>
                  </span>
                </span>
                <span class="torrent-arrow">→</span>
                <span
                  class="file-watch-track"
                  role="img"
                  aria-label={
                    model.globals.fileProgress(file) >= 100
                      ? 'Просмотрено'
                      : 'Просмотрено ' +
                        Math.floor(model.globals.fileProgress(file)) +
                        '%'
                  }
                >
                  <span
                    class="file-watch-fill"
                    data-file-id={file.id}
                    style={{ width: model.globals.fileProgress(file) + '%' }}
                  />
                </span>
              </button>
              <button
                class="save-video"
                classList={{ 'is-saved': model.saved.includes(file.id) }}
                disabled={
                  model.saving.includes(file.id) ||
                  model.saved.includes(file.id)
                }
                onClick={() => model.save(file)}
                aria-label={
                  (model.saving.includes(file.id)
                    ? 'Добавляем… '
                    : model.saved.includes(file.id)
                      ? 'В скачанном: '
                      : 'Сохранить ') + file.path
                }
                aria-busy={model.saving.includes(file.id)}
                title={
                  model.saving.includes(file.id)
                    ? 'Добавляем…'
                    : model.saved.includes(file.id)
                      ? 'В скачанном'
                      : 'Сохранить'
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <Show
                    when={model.saving.includes(file.id)}
                    fallback={
                      <path
                        d={
                          model.saved.includes(file.id)
                            ? 'M5 12l4 4L19 6'
                            : 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4'
                        }
                      />
                    }
                  >
                    <circle cx="5" cy="12" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                  </Show>
                </svg>
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
});
