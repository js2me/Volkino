import { render } from 'solid-js/web';
import { AppProvider } from './providers';
import { Catalog } from '../screens/catalog/ui';
import { Latest } from '../screens/latest/ui';
import { Home } from '../screens/home/ui';
import { Search } from '../screens/search/ui';
import { History } from '../screens/history/ui';
import { Torrents } from '../screens/torrents/ui';
import './styles/index.css';

export function App() {
  return <AppProvider>
    <Catalog />
  </AppProvider>;
}

export function mountCatalog(target: HTMLElement) {
  return render(() => <App />, target);
}

export function mountLatest(target: HTMLElement) {
  return render(() => <AppProvider>
    <Latest />
  </AppProvider>, target);
}

export function mountHome(target: HTMLElement) {
  return render(() => <AppProvider>
    <Home />
  </AppProvider>, target);
}

export function mountSearch(target: HTMLElement) {
  return render(() => <AppProvider>
    <Search />
  </AppProvider>, target);
}

export function mountHistory(target: HTMLElement) {
  return render(() => <AppProvider>
    <History />
  </AppProvider>, target);
}

export function mountTorrents(target: HTMLElement) {
  return render(() => <AppProvider>
    <Torrents />
  </AppProvider>, target);
}
