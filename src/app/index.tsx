import { enableObservableTracking, ViewModelsProvider } from 'mobx-view-model-solid';
import { render } from 'solid-js/web';
import { Globals } from '../globals';
import type { CatalogBridge } from '../globals/catalog';
import { Catalog } from '../screens/catalog/ui';
import { Latest } from '../screens/latest/ui';
import type { LatestBridge } from '../globals/latest';
import { Home } from '../screens/home/ui';
import type { HomeBridge } from '../screens/home/model';
import { Search } from '../screens/search/ui';
import type { SearchBridge } from '../screens/search/model';
import { History } from '../screens/history/ui';
import type { HistoryBridge } from '../screens/history/model';
import { Torrents } from '../screens/torrents/ui';
import type { TorrentsBridge } from '../screens/torrents/model';
import './styles/index.css';

enableObservableTracking();
let globals: Globals | undefined;

export function App(props: { globals: Globals; bridge: CatalogBridge }) {
  return <ViewModelsProvider value={props.globals.stores.viewModels}>
    <Catalog payload={{ globals: props.globals, bridge: props.bridge }} />
  </ViewModelsProvider>;
}

export function mountCatalog(target: HTMLElement, bridge: CatalogBridge) {
  const container = globals ??= new Globals();
  return render(() => <App globals={container} bridge={bridge} />, target);
}

export function mountLatest(target: HTMLElement, bridge: LatestBridge) {
  const container = globals ??= new Globals();
  return render(() => <ViewModelsProvider value={container.stores.viewModels}>
    <Latest payload={{ globals: container, bridge }} />
  </ViewModelsProvider>, target);
}

export function mountHome(target: HTMLElement, bridge: HomeBridge) {
  const container = globals ??= new Globals();
  return render(() => <ViewModelsProvider value={container.stores.viewModels}>
    <Home payload={{ bridge }} />
  </ViewModelsProvider>, target);
}

export function mountSearch(target: HTMLElement, bridge: SearchBridge) {
  const container = globals ??= new Globals();
  return render(() => <ViewModelsProvider value={container.stores.viewModels}>
    <Search payload={{ bridge }} />
  </ViewModelsProvider>, target);
}

export function mountHistory(target: HTMLElement, bridge: HistoryBridge) {
  const container = globals ??= new Globals();
  return render(() => <ViewModelsProvider value={container.stores.viewModels}>
    <History payload={{ bridge }} />
  </ViewModelsProvider>, target);
}

export function mountTorrents(target: HTMLElement, bridge: TorrentsBridge) {
  const container = globals ??= new Globals();
  return render(() => <ViewModelsProvider value={container.stores.viewModels}>
    <Torrents payload={{ bridge }} />
  </ViewModelsProvider>, target);
}
