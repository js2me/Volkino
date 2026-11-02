import { For, Show } from 'solid-js';
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
            <button class="torrent file-card" onClick={() => model.play(file)}>
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
          )}
        </For>
      </Show>
    </div>
  );
});
