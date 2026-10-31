import { enableObservableTracking, ViewModelsProvider } from 'mobx-view-model-solid';
import { render } from 'solid-js/web';
import { Globals } from '../globals';
import type { CatalogBridge } from '../globals/catalog';
import { Catalog } from '../screens/catalog/ui';
import { Latest } from '../screens/latest/ui';
import type { LatestBridge } from '../globals/latest';
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
