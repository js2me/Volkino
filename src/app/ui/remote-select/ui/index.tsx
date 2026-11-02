import { For } from 'solid-js';
import { withViewModel } from 'mobx-view-model-solid';
import { RemoteSelectVM } from '../model';

export const RemoteSelect = withViewModel(
  RemoteSelectVM,
  ({ model }) => {
    return (
      <div
        class="remote-select-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) model.payload.close();
        }}
      >
        <div
          ref={(element) => {
            model.root = element;
          }}
          class="remote-select-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remote-select-title"
        >
          <h2 id="remote-select-title">{model.title}</h2>
          <p class="remote-select-hint">
            ↑ ↓ — выбрать · OK — подтвердить · BACK — отменить
          </p>
          <div
            class="remote-select-options"
            role="listbox"
            aria-label={model.title}
          >
            <For each={model.options}>
              {(option) => (
                <button
                  type="button"
                  role="option"
                  class="remote-select-option"
                  classList={{
                    'is-active': model.activeIndex === option.index,
                  }}
                  data-option-index={option.index}
                  aria-selected={model.activeIndex === option.index}
                  disabled={option.disabled}
                  onClick={() => model.choose(option.index)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    );
  },
  { vmConfig: { observable: { viewModels: { useDecorators: false } } } },
);
