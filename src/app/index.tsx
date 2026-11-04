import { Match, Show, Switch } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { AppProvider } from './providers';
import { AppVM } from './model';
import { Catalog } from '../screens/catalog/ui';
import { Latest } from '../screens/latest/ui';
import { Home } from '../screens/home/ui';
import { Search } from '../screens/search/ui';
import { History } from '../screens/history/ui';
import { Torrents } from '../screens/torrents/ui';
import { Settings } from '../screens/settings/ui';
import { Details } from '../screens/details/ui';
import { FilmixSearch } from '../screens/filmix-search/ui';
import { Files } from '../screens/files/ui';
import { Magnet } from '../screens/magnet/ui';
import { Navigation } from './navigation';
import { Player } from './player/ui';
import { ScreenHeader } from './ui/screen-header';
import './styles/index.css';

const Application = withViewModel(AppVM, ({ model }) => {
  const globals = model.globals;
  return (
    <div
      class="app-root"
      ref={(element) => {
        globals.root = element;
      }}
    >
      <div id="shell">
        <aside>
          <div class="brand">
            <span class="brand-mark">
              <img
                src="/wolf.png"
                alt="Логотип VolKino: волк и луна"
                width="84"
                height="84"
              />
            </span>
            <strong>VOLKINO</strong>
          </div>
          <div class="nav-label">БИБЛИОТЕКА</div>
          <nav>
            <button
              id="nav-home"
              data-view="home"
              class={globals.menuView === 'home' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('home')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
              </svg>
              <span>Главная</span>
            </button>
            <button
              id="nav-latest"
              data-view="latest"
              class={globals.menuView === 'latest' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('latest')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 8v4l3 2" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span>Последние добавления</span>
            </button>
            <button
              id="nav-catalog"
              data-view="catalog"
              class={globals.menuView === 'catalog' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('catalog')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <span>Каталог</span>
            </button>
            <button
              id="nav-search"
              data-view="search"
              class={globals.menuView === 'search' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('search')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
              <span>Поиск</span>
            </button>
            <button
              data-view="history"
              class={globals.menuView === 'history' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('history')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span>История</span>
            </button>
            <button
              data-view="torrents"
              class={globals.menuView === 'torrents' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('torrents')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="7" rx="2" />
                <rect x="3" y="14" width="18" height="7" rx="2" />
                <path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6" />
              </svg>
              <span>На сервере</span>
            </button>
            <button
              data-view="magnet"
              class={globals.menuView === 'magnet' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('magnet')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="m10 13 4-4m-6 6-2 2a4.2 4.2 0 0 0 6 6l4-4a4.2 4.2 0 0 0 0-6m0-2 2-2a4.2 4.2 0 0 0-6-6L8 7a4.2 4.2 0 0 0 0 6"
                  transform="translate(0 -2)"
                />
              </svg>
              <span>Открыть ссылку</span>
            </button>
          </nav>
          <div class="sidebar-bottom">
            <button
              data-view="settings"
              class={globals.menuView === 'settings' ? 'nav active' : 'nav'}
              onClick={() => globals.navigate('settings')}
            >
              <svg
                class="nav-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.5" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
              </svg>
              <span>Настройки</span>
            </button>
            <div class="connection">
              <i
                id="connection-light"
                class={
                  globals.connected === null
                    ? ''
                    : globals.connected
                      ? 'ok'
                      : 'error'
                }
              />
              <span id="connection-text">{globals.connection}</span>
            </div>
            <div class="version">webOS · v0.9.2</div>
          </div>
        </aside>
        <main id="main">
          <div id="screen-header">
            <ScreenHeader
              title={globals.title}
              filePage={globals.view === 'files'}
            />
          </div>
          <div id="content">
            <Show when={globals.routeRevision + 1} keyed>
              <Switch>
                <Match when={globals.view === 'home'}>
                  <Home />
                </Match>
                <Match when={globals.view === 'latest'}>
                  <Latest />
                </Match>
                <Match when={globals.view === 'catalog'}>
                  <Catalog />
                </Match>
                <Match when={globals.view === 'search'}>
                  <Search />
                </Match>
                <Match when={globals.view === 'history'}>
                  <History />
                </Match>
                <Match when={globals.view === 'torrents'}>
                  <Torrents />
                </Match>
                <Match when={globals.view === 'settings'}>
                  <Settings />
                </Match>
                <Match when={globals.view === 'details'}>
                  <Details />
                </Match>
                <Match when={globals.view === 'filmix-search'}>
                  <FilmixSearch />
                </Match>
                <Match when={globals.view === 'files'}>
                  <Files />
                </Match>
                <Match when={globals.view === 'magnet'}>
                  <Magnet />
                </Match>
                <Match when={globals.startupError}>
                  <div class="empty">
                    <h2>Помощник недоступен</h2>
                    <p>{globals.startupError}</p>
                  </div>
                </Match>
              </Switch>
            </Show>
          </div>
        </main>
      </div>
      <Navigation />
      <Player />
      <div id="toast" role="status" class={globals.toastText ? '' : 'hidden'}>
        {globals.toastText}
      </div>
    </div>
  );
});

export function App() {
  return (
    <AppProvider>
      <Application />
    </AppProvider>
  );
}
