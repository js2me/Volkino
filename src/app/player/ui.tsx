import { For } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { PlayerVM } from './model';

export const Player = withViewModel(PlayerVM, ({ model }) => (
  <div
    id="player"
    ref={(element) => {
      model.root = element;
    }}
    class={model.visible ? '' : 'hidden'}
    onPointerDown={model.onPointer}
    onMouseMove={model.onMouseMove}
    onClick={model.onVideoClick}
  >
    <video
      id="video"
      ref={(element) => {
        model.video = element;
      }}
      tabIndex={-1}
      playsinline
    />
    <div id="player-top" class={model.overlay ? '' : 'hidden'}>
      <div
        id="player-options"
        class={model.optionsOpen ? '' : 'hidden'}
        role="group"
        aria-label="Настройки воспроизведения"
      >
        <div class="player-options-actions">
          <button
            id="player-audio"
            class="btn"
            disabled={model.audioDisabled}
            onClick={model.audioTrack}
          >
            {model.audioLabel}
          </button>
          <button id="player-fit" class="btn" onClick={model.cycleFit}>
            Изображение: {model.fitLabel}
          </button>
          <button
            id="player-options-close"
            class="btn"
            onClick={model.closeOptions}
          >
            Готово
          </button>
        </div>
        <p class="player-options-hint">
          ← → — выбрать · OK — переключить · ↓ / BACK — закрыть
        </p>
      </div>
      <span class="eyebrow">СЕЙЧАС НА ЭКРАНЕ</span>
      <h2 id="playing-title">{model.title}</h2>
      <p id="playing-status">{model.status}</p>
      <p id="audio-mode-status" class="audio-mode-status" aria-live="polite">
        {model.audioStatus}
      </p>
      <button
        id="player-back"
        class={model.backVisible ? 'btn' : 'hidden'}
        onClick={model.stop}
      >
        Назад к файлам
      </button>
    </div>
    <div id="player-controls" class={model.overlay ? '' : 'hidden'}>
      <div class="touch-controls" aria-label="Управление воспроизведением">
        <button id="touch-exit" class="btn" onClick={model.stop}>
          Назад
        </button>
        <button
          id="touch-rewind"
          class="btn"
          aria-label="Перемотать назад"
          onClick={() => model.seek(-model.step)}
        >
          −{model.step} сек
        </button>
        <button
          id="touch-pause"
          class="btn"
          aria-label="Пауза или продолжение"
          onClick={model.toggle}
        >
          {model.paused ? 'Продолжить' : 'Пауза'}
        </button>
        <button
          id="touch-forward"
          class="btn"
          aria-label="Перемотать вперёд"
          onClick={() => model.seek(model.step)}
        >
          +{model.step} сек
        </button>
        <button
          id="touch-episodes"
          class="btn"
          onClick={() =>
            model.episodesOpen ? model.closeEpisodes() : model.openEpisodes()
          }
        >
          Серии
        </button>
        <button id="touch-audio" class="btn" onClick={model.openOptions}>
          Звук и изображение
        </button>
      </div>
      <div
        id="player-timeline"
        role="slider"
        tabIndex={0}
        aria-label="Позиция просмотра"
        aria-valuemin={0}
        aria-valuemax={Math.floor(model.duration)}
        aria-valuenow={Math.floor(model.position)}
        aria-valuetext={
          model.globals.time(model.position) +
          ' из ' +
          model.globals.time(model.duration)
        }
        onClick={(event) => model.onTimelineClick(event)}
        onPointerDown={model.onPointer}
        onPointerMove={model.onPointer}
        onPointerUp={model.onPointer}
        onPointerCancel={model.onPointer}
        onLostPointerCapture={model.onPointer}
      >
        <div
          id="player-progress"
          style={{
            width:
              (model.duration ? (100 * model.position) / model.duration : 0) +
              '%',
          }}
        />
      </div>
      <div class="player-control-row">
        <span id="player-time">
          {model.globals.time(model.position)} /{' '}
          {model.globals.time(model.duration)}
        </span>
        <span>
          Нажмите или перетащите ползунок — перемотка · OK — пауза · ← → —{' '}
          <span id="player-seek-step">{model.step} сек</span> · ↓ — серии · ↑ —
          звук и изображение · Жёлтая — аудио · BACK — выйти
        </span>
      </div>
      <div id="player-episodes" class={model.episodesOpen ? '' : 'hidden'}>
        <h2>Файлы в этой папке</h2>
        <div id="episode-list" aria-label="Файлы в этой папке">
          <For each={model.episodeFiles}>
            {(file, index) => (
              <button
                class={
                  'episode-card' +
                  (model.playing?.file.id === file.id ? ' episode-current' : '')
                }
                aria-current={
                  model.playing?.file.id === file.id ? 'true' : undefined
                }
                onClick={() => model.selectEpisode(file)}
                onFocus={() => {
                  model.episodeIndex = index();
                  model.showOverlay();
                }}
              >
                <span class="episode-name">
                  {file.path.replace(/\\/g, '/').split('/').pop()}
                </span>
                <span class="episode-meta">
                  {model.playing?.file.id === file.id
                    ? 'Сейчас смотрите'
                    : model.globals.source === 'filmix'
                      ? file.voice
                      : model.globals.bytes(file.length)}
                </span>
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
        </div>
        <div class="episode-hint">
          ← → — выбрать · OK — открыть · ↑ / BACK — закрыть список
        </div>
      </div>
    </div>
  </div>
));
