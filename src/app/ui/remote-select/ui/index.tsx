import { For, createEffect } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { RemoteSelectVM } from '../model';

export const RemoteSelect = withViewModel(RemoteSelectVM, ({ model }) => {
  let root!: HTMLDivElement;
  createEffect(() => {
    const index = model.activeIndex;
    queueMicrotask(() => {
      if (!model.isMounted || index !== model.activeIndex) return;
      const option = root.querySelector<HTMLButtonElement>('[data-option-index="' + index + '"]');
      option?.focus({ preventScroll: true });
      option?.scrollIntoView({ block: 'nearest' });
    });
  });
  return <div class="remote-select-backdrop" onClick={event => {
    if (event.target === event.currentTarget) model.payload.close();
  }}>
    <div ref={root} class="remote-select-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-select-title">
      <h2 id="remote-select-title">{model.title}</h2>
      <p class="remote-select-hint">↑ ↓ — выбрать · OK — подтвердить · BACK — отменить</p>
      <div class="remote-select-options" role="listbox" aria-label={model.title}>
        <For each={model.options}>{option => <button type="button" role="option"
          class="remote-select-option" classList={{ 'is-active': model.activeIndex === option.index }}
          data-option-index={option.index} aria-selected={model.activeIndex === option.index}
          disabled={option.disabled} onClick={() => model.choose(option.index)}>{option.label}</button>}</For>
      </div>
    </div>
  </div>;
}, { vmConfig: { observable: { viewModels: { useDecorators: false } } } });
