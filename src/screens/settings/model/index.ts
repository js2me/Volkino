import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { Config } from '../../../app/services/types';

interface Account {
  code?: string;
  activationUrl?: string;
  authenticated?: boolean;
  login?: string;
  plan?: string;
  maxQuality?: number;
}
export class SettingsVM extends VM {
  draft: Config & {
    torrserverPassword?: string;
    jacredApiKey?: string;
    filmixToken?: string;
    seekStep?: number;
  } = {};
  login = '';
  password = '';
  filmixStatus = '';
  localStatus = 'Проверяем локальный сервер…';
  readonly android = /Android/i.test(navigator.userAgent);
  private timer?: ReturnType<typeof setTimeout>;
  constructor(params: ViewModelParams) {
    super(params);
    this.draft = {
      ...this.globals.config,
      seekStep: this.globals.player?.step || 30,
      torrserverMode: this.globals.config.torrserverMode || 'local',
      localCacheSize: this.globals.config.localCacheSize ?? 32,
      localPreloadCache: this.globals.config.localPreloadCache ?? 50,
      localConnectionsLimit: this.globals.config.localConnectionsLimit ?? 20,
    };
    this.filmixStatus = this.globals.config.hasFilmixToken
      ? this.globals.config.filmixTransport === 'web'
        ? 'Аккаунт подключён к Filmix TV.'
        : 'Аккаунт подключён. Нажмите «Проверить Filmix», чтобы проверить доступ.'
      : this.globals.config.filmixTransport === 'web'
        ? 'Войдите в аккаунт Filmix TV.'
        : 'Гостевой режим · до 480p';
    makeObservable(this, {
      draft: observable,
      login: observable,
      password: observable,
      filmixStatus: observable,
      localStatus: observable,
      set: action.bound,
      setCredentials: action.bound,
      save: action.bound,
      account: action.bound,
      transport: action.bound,
      webLogin: action.bound,
    });
  }
  protected didMount() {
    this.pollLocal();
    this.afterRender(() => this.globals.focusFirst());
  }
  protected willUnmount() {
    clearTimeout(this.timer);
    this.password = '';
  }
  setCredentials(field: 'login' | 'password', value: string) {
    this[field] = value;
  }
  set(key: keyof SettingsVM['draft'], value: string | number) {
    Object.assign(this.draft, { [key]: value });
  }
  private update(data: object, done: () => void) {
    this.globals.api<Config>('config', data, (error, config) => {
      if (this.unmountSignal.aborted) return;
      runInAction(() => {
        if (error) {
          this.globals.toast(error.message);
          return;
        }
        this.globals.config = config;
        done();
      });
    });
  }
  save(after?: () => void) {
    const step = Number(this.draft.seekStep);
    const previousCatalogProvider =
      this.globals.config.catalogProvider || 'vilkadb';
    if (!Number.isInteger(step) || step < 1 || step > 3600) {
      this.globals.toast(
        'Шаг перемотки должен быть целым числом от 1 до 3600 секунд',
      );
      this.root?.querySelector<HTMLElement>('#seek-step')?.focus();
      return;
    }
    for (const [key, min, max, label, id] of [
      ['localCacheSize', 8, 2048, 'Размер кэша (МиБ)', 'local-cache-size'],
      ['localPreloadCache', 1, 100, 'Предзагрузка (%)', 'local-preload-cache'],
      [
        'localConnectionsLimit',
        1,
        500,
        'Лимит соединений',
        'local-connections-limit',
      ],
    ] as const) {
      const value = this.draft[key];
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < min ||
        value > max
      ) {
        this.globals.toast(`${label}: введите целое число от ${min} до ${max}`);
        this.root?.querySelector<HTMLElement>('#' + id)?.focus();
        return;
      }
    }
    const data: Record<string, unknown> = {
      seekStep: step,
      audioFix:
        this.root?.querySelector<HTMLSelectElement>('#audio-fix')?.value ||
        this.draft.audioFix ||
        'off',
      filmixApiUrl: this.draft.filmixApiUrl,
      filmixSiteUrl: this.draft.filmixSiteUrl,
      torrserverMode: this.draft.torrserverMode,
      localCacheSize: this.draft.localCacheSize,
      localPreloadCache: this.draft.localPreloadCache,
      localConnectionsLimit: this.draft.localConnectionsLimit,
      torrserverUrl: this.draft.torrserverUrl,
      torrserverUsername: this.draft.torrserverUsername,
      searchProvider: this.draft.searchProvider,
      catalogProvider: this.draft.catalogProvider || 'vilkadb',
      jacredUrl: this.draft.jacredUrl,
    };
    if (this.draft.filmixToken) data.filmixToken = this.draft.filmixToken;
    if (this.draft.torrserverPassword)
      data.torrserverPassword = this.draft.torrserverPassword;
    if (!data.torrserverUsername) data.torrserverPassword = '';
    if (this.draft.jacredApiKey) data.jacredApiKey = this.draft.jacredApiKey;
    this.update(data, () => {
      if (
        (this.globals.config.catalogProvider || 'vilkadb') !==
        previousCatalogProvider
      )
        this.globals.state.homeData = null;
      this.globals.toast('Настройки сохранены');
      this.globals.health();
      after?.();
    });
  }
  enableSearch() {
    this.save(() =>
      this.globals.api<{ message?: string }>(
        'enable-search',
        {},
        (error, data) => {
          if (!this.unmountSignal.aborted)
            this.globals.toast(
              error?.message || data.message || 'Поиск уже включён',
            );
        },
      ),
    );
  }
  transport(value: string) {
    this.update({ filmixTransport: value }, () => {
      this.draft.filmixTransport = value;
      this.draft.hasFilmixToken = this.globals.config.hasFilmixToken;
      this.filmixStatus =
        value === 'web'
          ? 'Войдите в аккаунт Filmix TV.'
          : 'Гостевой режим · до 480p';
    });
  }
  saveFilmix(done: () => void) {
    const data = {
      filmixApiUrl: this.draft.filmixApiUrl || 'http://filmixapp.cyou/api/v2',
      filmixSiteUrl: this.draft.filmixSiteUrl || 'https://filmix.my',
      ...(this.draft.filmixToken
        ? { filmixToken: this.draft.filmixToken }
        : {}),
    };
    this.update(data, () => {
      this.draft.filmixToken = '';
      this.draft.hasFilmixToken = this.globals.config.hasFilmixToken;
      done();
    });
  }
  account(operation: string) {
    this.globals.api<Account>(
      'filmix/' + operation,
      operation === 'profile' ? null : {},
      (error, data) => {
        if (this.unmountSignal.aborted) return;
        runInAction(() => {
          if (error) {
            this.filmixStatus = error.message;
            return;
          }
          this.filmixStatus = data.code
            ? 'Код: ' +
              data.code +
              ' · Введите на ' +
              data.activationUrl +
              ', затем нажмите «Я ввёл код».'
            : operation === 'auth/disconnect'
              ? this.draft.filmixTransport === 'web'
                ? 'Filmix TV отключён'
                : 'Filmix отключён · гостевой режим'
              : (data.authenticated
                  ? (data.login || 'Подключено') + ' · ' + data.plan
                  : 'Гость') +
                ' · до ' +
                data.maxQuality +
                'p';
          if (operation === 'auth/check' || operation === 'auth/disconnect') {
            this.globals.config = {
              ...this.globals.config,
              hasFilmixToken: operation === 'auth/check',
            };
            this.draft.hasFilmixToken = operation === 'auth/check';
            this.draft.filmixToken = '';
          }
        });
      },
    );
  }
  webLogin() {
    this.filmixStatus = 'Входим в Filmix TV…';
    this.globals.api<Account>(
      'filmix/auth/login',
      { name: this.login, password: this.password },
      (error, data) => {
        if (this.unmountSignal.aborted) return;
        runInAction(() => {
          this.filmixStatus = error
            ? error.message
            : (data.login || 'Подключено') +
              ' · ' +
              data.plan +
              ' · до ' +
              data.maxQuality +
              'p';
          if (!error) {
            this.globals.config = {
              ...this.globals.config,
              hasFilmixToken: true,
            };
            this.draft.hasFilmixToken = true;
          }
        });
      },
    );
    this.password = '';
  }
  localAction(operation: string) {
    this.globals.api('local-server/' + operation, {}, (error) => {
      if (this.unmountSignal.aborted) return;
      if (error) this.globals.toast(error.message);
      else this.pollLocal(true);
    });
  }
  private pollLocal(refresh = false) {
    clearTimeout(this.timer);
    this.globals.api<{ state: string; version: string; error?: string }>(
      'local-server',
      null,
      (error, data) => {
        if (this.unmountSignal.aborted) return;
        const labels: Record<string, string> = {
          stopped: 'Остановлен',
          installing: 'Загружаем TorrServer…',
          starting: 'Запускаем TorrServer…',
          stopping: 'Останавливаем TorrServer…',
          running: 'Работает',
          error: 'Ошибка',
        };
        runInAction(() => {
          this.localStatus = error
            ? error.message
            : (labels[data.state] || data.state) +
              ' · ' +
              data.version +
              (data.error ? ' · ' + data.error : '');
        });
        if (
          !error &&
          ['installing', 'starting', 'stopping'].includes(data.state)
        ) {
          this.timer = setTimeout(() => this.pollLocal(true), 1000);
          return;
        }
        if (refresh && !error && data.state !== 'error')
          this.globals.api<Config>('config', null, (error, config) => {
            if (error || this.unmountSignal.aborted) return;
            runInAction(() => {
              this.globals.config = config;
              this.draft.torrserverMode = config.torrserverMode;
            });
            this.globals.health();
          });
        this.timer = setTimeout(() => this.pollLocal(), 5000);
      },
    );
  }
}
