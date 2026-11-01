import { enableObservableTracking, ViewModelsProvider } from 'mobx-view-model-solid';
import type { ParentProps } from 'solid-js';
import { Globals } from '../../globals';
import type { AppServices } from '../../shared/types/screens';

enableObservableTracking();
const globals = new Globals();

export function initializeApp(services: AppServices) {
  globals.app = services;
}

export function AppProvider(props: ParentProps) {
  return <ViewModelsProvider value={globals.stores.viewModels}>{props.children}</ViewModelsProvider>;
}
