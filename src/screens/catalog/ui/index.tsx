import { For, Index, Show } from 'solid-js';
import { ratingStyle } from '../../../shared/lib/rating-color';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { CatalogVM } from '../model';
import { InfiniteScroll } from '../../../app/ui/infinite-scroll';
import { Field } from '../../../app/ui/field';

export const Catalog = withViewModel(CatalogVM, () => {
  const model = useViewModel<CatalogVM>();
  const main = () => document.getElementById('main')!;

  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
    >
      <div class="catalog-source-bar">
        <Field id="catalog-provider" label="Источник каталога">
          <select
            id="catalog-provider"
            class="input"
            value={model.catalog.provider}
            disabled={!model.catalog.sources.length}
            onChange={(event) =>
              model.catalog.selectSource(event.currentTarget.value)
            }
          >
            <For each={model.catalog.sources}>
              {(source) => <option value={source.id}>{source.name}</option>}
            </For>
          </select>
        </Field>
        <p class="muted">{model.catalog.note}</p>
      </div>
      <form
        class="catalog-filters"
        onSubmit={(event) => {
          event.preventDefault();
          model.catalog.apply();
        }}
      >
        <Index each={model.catalog.filters}>
          {(filter) => (
            <Field
              id={'catalog-' + filter().key.replace('minRating', 'rating')}
              label={filter().label}
            >
              <select
                id={'catalog-' + filter().key.replace('minRating', 'rating')}
                class="input"
                value={filter().value}
                disabled={filter().disabled}
                onChange={(event) =>
                  model.catalog.setFilter(
                    filter().key,
                    event.currentTarget.value,
                  )
                }
              >
                <For each={filter().options}>
                  {(option) => (
                    <option
                      value={option.id}
                      selected={filter().value === option.id}
                    >
                      {option.name}
                    </option>
                  )}
                </For>
              </select>
            </Field>
          )}
        </Index>
        <button
          id="catalog-apply"
          type="submit"
          class="btn primary"
          disabled={!model.catalog.sources.length}
        >
          Показать
        </button>
      </form>
      <p class="muted">
        Стрелки — переход между полями · OK — выбрать значение. Нажмите
        «Показать», чтобы применить фильтры.
      </p>
      <div
        id="catalog-results"
        aria-busy={model.catalog.loading || model.catalog.loadingMore}
      >
        <Show when={model.catalog.loading}>
          <p class="muted">Загружаем каталог…</p>
        </Show>
        <Show when={model.catalog.error}>
          <p class="error-text">{model.catalog.error}</p>
          <button class="btn" onClick={() => model.catalog.retry()}>
            Повторить
          </button>
        </Show>
        <Show when={model.catalog.ready}>
          <>
            <div class="catalog-summary">{model.catalog.summary}</div>
            <Show when={!model.catalog.items.length}>
              <p class="muted">
                По этим фильтрам ничего не найдено. Попробуйте другой год, жанр
                или уменьшите рейтинг.
              </p>
            </Show>
            <div class="catalog-grid">
              <For each={model.catalog.items}>
                {(item, index) => (
                  <button
                    class="poster-card"
                    data-media-type={item.type}
                    onFocus={() => {
                      if (
                        index() >= model.catalog.items.length - 3 &&
                        !model.catalog.moreError
                      )
                        model.catalog.loadMore();
                    }}
                    data-catalog-id={item.id}
                    aria-label={
                      item.title + (item.year ? ' · ' + item.year : '')
                    }
                    onClick={() => model.catalog.open(item, main().scrollTop)}
                  >
                    <div class="poster-art">
                      <span class="poster-fallback">
                        {item.title.slice(0, 1)}
                      </span>
                      <Show when={item.poster}>
                        <img
                          alt=""
                          src={item.poster}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      </Show>
                      <Show when={item.rating}>
                        <span
                          class="poster-rating"
                          style={ratingStyle(item.rating)}
                        >
                          {item.rating}
                        </span>
                      </Show>
                    </div>
                    <span class="poster-name">{item.title}</span>
                    <span class="poster-meta">
                      {item.year || ''}
                      {item.type === 'tv' ? ' · Сериал' : ' · Фильм'}
                    </span>
                  </button>
                )}
              </For>
            </div>
            <InfiniteScroll
              root={main}
              count={model.catalog.items.length}
              hasMore={model.catalog.hasMore}
              loading={model.catalog.loadingMore}
              error={model.catalog.moreError}
              onMore={() => model.catalog.loadMore()}
            />
          </>
        </Show>
      </div>
    </div>
  );
});
