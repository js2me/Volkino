import {
  enableObservableTracking,
  ViewModelsProvider,
} from 'mobx-view-model-solid';
import type { ParentProps } from 'solid-js';
import { Globals } from '../../globals';

enableObservableTracking();
const globals = new Globals();

export function AppProvider(props: ParentProps) {
  return (
    <ViewModelsProvider value={globals.stores.viewModels}>
      {props.children}
    </ViewModelsProvider>
  );
}
