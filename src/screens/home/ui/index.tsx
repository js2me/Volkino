import { For, Show } from 'solid-js';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { HomeVM } from '../model';
import { PosterCard } from '../../../app/ui/poster-card';
import { ScreenMessage } from '../../../app/ui/screen-message';

export const Home = withViewModel(HomeVM, () => {
  const model = useViewModel<HomeVM>();
  return (
    <div
      ref={(element) => {
        model.root = element;
      }}
      class="home-screen"
    >
      <Show when={model.loading}>
        <ScreenMessage
          title="Подбираем, что посмотреть…"
          text="Загружаем постеры, популярное и новые фильмы и сериалы."
          busy
        />
      </Show>
      <Show when={model.error}>
        <ScreenMessage title="Подборки временно недоступны" text={model.error}>
          <button class="btn primary" onClick={() => model.load()}>
            Повторить
          </button>
          <button class="btn" onClick={() => model.globals.search()}>
            Перейти к поиску
          </button>
        </ScreenMessage>
      </Show>
      <Show when={model.data}>
        {(data) => (
          <>
            <div class="home-intro">
              <p class="muted">
                Выберите фильм или сериал — смотрите через торрент или Filmix.
              </p>
              <button class="btn" onClick={() => model.globals.search()}>
                Поиск по названию
              </button>
            </div>
            <Show when={model.globals.history().length}>
              <section class="home-section home-continue">
                <h2>Продолжить просмотр</h2>
                <div class="continue-row">
                  <For each={model.globals.history().slice(0, 8)}>
                    {(item) => (
                      <button
                        class="continue-card"
                        onClick={() => model.globals.resume(item)}
                      >
                        <span class="continue-name">{item.title}</span>
                        <span class="muted">
                          {item.position > 0
                            ? model.globals.time(item.position) +
                              ' / ' +
                              model.globals.time(item.duration)
                            : 'Открыто · начать просмотр'}
                        </span>
                        <span class="continue-track">
                          <span
                            style={{
                              width:
                                (item.duration
                                  ? Math.min(
                                      100,
                                      (100 * item.position) / item.duration,
                                    )
                                  : 0) + '%',
                            }}
                          />
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </Show>
            <For each={data().sections}>
              {(section) => (
                <section
                  class="home-section"
                  data-media-type={section.items[0]?.type}
                >
                  <div class="catalog-section-head">
                    <h2>{section.title}</h2>
                    <span class="muted">{section.items.length} в подборке</span>
                  </div>
                  <div class="poster-row">
                    <For each={section.items.slice(0, 18)}>
                      {(item) => (
                        <PosterCard
                          item={item}
                          onOpen={() => model.globals.openItem(item, 'home')}
                        />
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
            <p class="catalog-source">
              Каталог: {data().source || 'VilkaDB'} · подборки обновляются
              каждые 3 часа
              {data().stale
                ? ' · показана сохранённая подборка'
                : data().partial
                  ? ' · часть подборок временно недоступна'
                  : ''}
            </p>
          </>
        )}
      </Show>
    </div>
  );
});
