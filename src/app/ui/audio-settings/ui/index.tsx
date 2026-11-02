import { For, Show } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { AudioSettingsVM } from '../model';
import { Field } from '../../field';
import { audioFixNames, type AudioFixMode } from '../../../audio/graph';

export const AudioSettings = withViewModel(
  AudioSettingsVM,
  ({ model }) => (
    <section class="audio-settings">
      <h2>Звук</h2>
      <Field id="audio-fix" label="Автофикс звука">
        <select
          id="audio-fix"
          class="input"
          value={model.mode}
          onChange={(event) =>
            model.setMode(event.currentTarget.value as AudioFixMode)
          }
        >
          <For each={Object.keys(audioFixNames) as AudioFixMode[]}>
            {(mode) => (
              <option
                value={mode}
                disabled={!model.supported && mode !== 'off'}
              >
                {audioFixNames[mode]}
              </option>
            )}
          </For>
        </select>
      </Field>
      <p class="muted">
        Приглушает громкие эффекты и делает тихие сцены слышнее. «Ночной»
        сильнее сглаживает перепады. При обработке звук выводится в стерео.
        Сохраните настройки — режим включится при следующем открытии видео.
      </p>
      <Show
        when={model.supported}
        fallback={
          <p class="muted">
            На этом устройстве обработка недоступна. Воспроизводится
            оригинальный звук.
          </p>
        }
      >
        <p class="muted">
          На LG работа зависит от аудиодорожки и плеера. При сбое обработка
          отключается для текущего видео; для оригинального звука выберите
          «Выключен».
        </p>
      </Show>
    </section>
  ),
  { vmConfig: { observable: { viewModels: { useDecorators: false } } } },
);
