import { For, Show } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { SettingsVM } from '../model';
import { Field } from '../../../app/ui/field';
import { AudioSettings } from '../../../app/ui/audio-settings/ui';

export const Settings = withViewModel(SettingsVM, ({ model }) => {
  const input = (
    id: string,
    label: string,
    key: keyof SettingsVM['draft'],
    type = 'text',
    placeholder = '',
    min = 1,
    max = 3600,
  ) => (
    <Field id={id} label={label}>
      <input
        id={id}
        class="input"
        type={type}
        value={String(model.draft[key] || '')}
        placeholder={placeholder}
        autocomplete="off"
        onInput={(event) =>
          model.set(
            key,
            type === 'number'
              ? Number(event.currentTarget.value)
              : event.currentTarget.value,
          )
        }
        min={type === 'number' ? min : undefined}
        max={type === 'number' ? max : undefined}
        step={type === 'number' ? 1 : undefined}
      />
    </Field>
  );
  return (
    <div
      class="panel"
      ref={(element) => {
        model.root = element;
      }}
    >
      <AudioSettings payload={{ mode: model.draft.audioFix || 'off' }} />
      <p class="muted">
        Выберите TorrServer на этом устройстве или подключите внешний сервер.
      </p>
      {input(
        'seek-step',
        'Шаг перемотки плеера (секунды)',
        'seekStep',
        'number',
      )}
      <Field id="ts-mode" label="Где запускать TorrServer">
        <select
          id="ts-mode"
          class="input"
          value={model.draft.torrserverMode || 'local'}
          onChange={(event) =>
            model.set('torrserverMode', event.currentTarget.value)
          }
        >
          <option value="external">Внешний сервер</option>
          <option value="local">На этом устройстве</option>
        </select>
      </Field>
      <div
        style={{
          display: model.draft.torrserverMode === 'local' ? 'block' : 'none',
        }}
      >
        {input(
          'local-cache-size',
          'Размер кэша в памяти (МиБ)',
          'localCacheSize',
          'number',
          '',
          8,
          2048,
        )}
        {input(
          'local-preload-cache',
          'Предзагрузка кэша (%)',
          'localPreloadCache',
          'number',
          '',
          1,
          100,
        )}
        {input(
          'local-connections-limit',
          'Лимит соединений',
          'localConnectionsLimit',
          'number',
          '',
          1,
          500,
        )}
        <p class="muted">
          Нажмите «Сохранить», чтобы применить параметры. Работающий сервер
          перезапустится, воспроизведение прервётся. Больший кэш требует больше
          оперативной памяти; предзагрузка задаёт долю кэша до начала просмотра.
        </p>
        <p id="local-server-status" class="muted">
          {model.localStatus}
        </p>
        <button class="btn primary" onClick={() => model.localAction('start')}>
          {model.android ? 'Запустить' : 'Установить и запустить'}
        </button>
        <button class="btn" onClick={() => model.localAction('stop')}>
          Остановить
        </button>
        <p class="muted">
          {model.android
            ? 'TorrServer включён в APK. Сервер останавливается при выходе из приложения кнопкой «Назад».'
            : 'При первой установке нужен интернет: TorrServer загружается с GitHub. Локальный режим запускается вместе с помощником, даже если окно приложения закрыто.'}
        </p>
      </div>
      <div
        style={{
          display: model.draft.torrserverMode === 'external' ? 'block' : 'none',
        }}
      >
        {input(
          'ts-url',
          'Адрес TorrServer',
          'torrserverUrl',
          'url',
          'http://192.168.1.100:8090',
        )}
        <div class="two-columns">
          {input('ts-user', 'Логин (если установлен)', 'torrserverUsername')}
          {input(
            'ts-password',
            'Пароль',
            'torrserverPassword',
            'password',
            model.globals.config.hasPassword
              ? 'Сохранён · пустое поле оставит пароль'
              : '',
          )}
        </div>
      </div>
      <Field id="catalog-provider" label="Источник подборок на главной">
        <select
          id="catalog-provider"
          class="input"
          value={model.draft.catalogProvider || 'vilkadb'}
          onChange={(event) =>
            model.set('catalogProvider', event.currentTarget.value)
          }
        >
          <option value="vilkadb">VilkaDB</option>
          <option value="cub">CUB / Lampa</option>
          <option value="filmix">Filmix</option>
          <option value="cinemeta">Cinemeta</option>
          <option value="yts">YTS</option>
        </select>
      </Field>
      <p class="muted">
        {model.draft.catalogProvider === 'filmix'
          ? 'Filmix показывает последние добавления и обновления, в том числе старые фильмы и сериалы.'
          : model.draft.catalogProvider === 'cinemeta'
            ? 'Названия Cinemeta могут быть на английском языке.'
            : model.draft.catalogProvider === 'yts'
              ? 'YTS содержит только фильмы; названия могут быть на английском языке.'
              : 'Выбор влияет на подборки главной и не меняет источник поиска раздач.'}
      </p>
      <Field id="search-provider" label="Источник поиска">
        <select
          id="search-provider"
          class="input"
          value={model.draft.searchProvider}
          onChange={(event) =>
            model.set('searchProvider', event.currentTarget.value)
          }
        >
          <For
            each={[
              ['vilkadb', 'VilkaDB — как в ForkPlayer'],
              ['torrserver', 'Rutor — индекс TorrServer'],
              ['torznab', 'Torznab — индексаторы TorrServer'],
              ['jacred', 'Jacred — внешний агрегатор'],
            ]}
          >
            {(item) => <option value={item[0]}>{item[1]}</option>}
          </For>
        </select>
      </Field>
      <div
        style={{
          display: model.draft.searchProvider === 'jacred' ? 'block' : 'none',
        }}
      >
        {input('jacred-url', 'Адрес Jacred', 'jacredUrl', 'url')}
        {input(
          'jacred-key',
          'API-ключ Jacred (если нужен)',
          'jacredApiKey',
          'password',
          model.globals.config.hasApiKey ? 'Сохранён' : '',
        )}
      </div>
      <div class="settings-actions">
        <button class="btn primary" onClick={() => model.save()}>
          Сохранить
        </button>
        <button
          class="btn"
          onClick={() => model.save(() => model.globals.health(true))}
        >
          Проверить сервер
        </button>
        <button class="btn" onClick={() => model.enableSearch()}>
          Включить поиск Rutor
        </button>
      </div>
      <section class="filmix-settings">
        <h2>Filmix — онлайн-просмотр</h2>
        <Field id="filmix-transport" label="Подключение Filmix">
          <select
            id="filmix-transport"
            class="input"
            value={model.draft.filmixTransport || 'mobile'}
            onChange={(event) => model.transport(event.currentTarget.value)}
          >
            <option value="mobile">Мобильный API</option>
            <option value="web">Filmix TV — как в Media Station X</option>
          </select>
        </Field>
        <Show
          when={model.draft.filmixTransport === 'web'}
          fallback={
            <>
              <p class="muted">
                Без TorrServer. Доступное качество зависит от аккаунта и
                подписки Filmix. Для входа получите код и введите его на сайте
                со своего телефона.
              </p>
              {input(
                'filmix-api',
                'Адрес API Filmix',
                'filmixApiUrl',
                'url',
                'http://filmixapp.cyou/api/v2',
              )}
              {input(
                'filmix-site',
                'Сайт Filmix для подключения устройства',
                'filmixSiteUrl',
                'url',
                'https://filmix.my',
              )}
              <p class="muted">
                Для HTTP-адреса API токен передаётся без шифрования. Если
                доступен рабочий HTTPS-адрес Filmix, укажите его выше.
              </p>
              {input(
                'filmix-token',
                'Токен Filmix (если уже есть)',
                'filmixToken',
                'password',
                model.draft.hasFilmixToken
                  ? 'Сохранён · пустое поле оставит токен'
                  : 'Можно подключить по коду ниже',
              )}
            </>
          }
        >
          <p class="muted">
            Вход в Filmix TV. Пароль используется только для входа; настройки
            сохраняют сессию устройства.
          </p>
          <Field id="filmix-login" label="Логин или e-mail Filmix">
            <input
              id="filmix-login"
              class="input"
              value={model.login}
              autocomplete="off"
              onInput={(event) => {
                model.setCredentials('login', event.currentTarget.value);
              }}
            />
          </Field>
          <Field id="filmix-web-password" label="Пароль Filmix">
            <input
              id="filmix-web-password"
              class="input"
              type="password"
              autocomplete="off"
              value={model.password}
              onInput={(event) => {
                model.setCredentials('password', event.currentTarget.value);
              }}
            />
          </Field>
        </Show>
        <p id="filmix-status" class="muted">
          {model.filmixStatus}
        </p>
        <div class="settings-actions">
          <Show
            when={model.draft.filmixTransport === 'web'}
            fallback={
              <>
                <button
                  class="btn"
                  onClick={() =>
                    model.saveFilmix(() => model.account('auth/start'))
                  }
                >
                  Получить код Filmix
                </button>
                <button class="btn" onClick={() => model.account('auth/check')}>
                  Я ввёл код
                </button>
              </>
            }
          >
            <button class="btn" onClick={model.webLogin}>
              Войти в Filmix TV
            </button>
          </Show>
          <button
            class="btn"
            onClick={() =>
              model.draft.filmixTransport === 'web'
                ? model.account('profile')
                : model.saveFilmix(() => model.account('profile'))
            }
          >
            Проверить Filmix
          </button>
          <button class="btn" onClick={() => model.account('auth/disconnect')}>
            Отключить Filmix
          </button>
        </div>
      </section>
      <p class="muted">
        Torznab настраивается на стороне TorrServer: добавьте туда адреса
        Jackett / Prowlarr. Если у раздачи нет сидов, начало просмотра может
        занять много времени.
      </p>
    </div>
  );
});
