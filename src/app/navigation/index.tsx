import { Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { withViewModel } from 'mobx-view-model-solid';
import { NavigationVM } from './model';
import { RemoteSelect } from '../ui/remote-select/ui';

export const Navigation = withViewModel(NavigationVM, ({ model }) => (
  <Show when={model.picker} keyed>
    {(picker) => (
      <Portal>
        <RemoteSelect
          payload={{
            select: picker.select,
            close: () => model.close(),
            ready: (remote) => {
              picker.model = remote;
            },
          }}
        />
      </Portal>
    )}
  </Show>
));
