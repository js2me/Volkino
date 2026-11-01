import { For, Show, createEffect } from 'solid-js';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { TorrentsVM } from '../model';
import { ScreenMessage } from '../../../app/ui/screen-message';
import { TorrentRow } from '../../../app/ui/torrent-row';

export const Torrents = withViewModel(TorrentsVM, () => {
  const model = useViewModel<TorrentsVM>();
  let root!: HTMLDivElement;
  createEffect(() => {
    const revision = model.focusRevision;
    if (revision) queueMicrotask(() => {
      if (model.isMounted && revision === model.focusRevision) root.querySelector<HTMLButtonElement>('button')?.focus();
    });
  });
  return <div ref={root} class="torrents-screen" aria-busy={model.loading}>
    <Show when={model.loading}><ScreenMessage title="Загружаем список…" text="Торренты, которые уже добавлены в ваш TorrServer." busy /></Show>
    <Show when={model.error}><ScreenMessage title="Сервер недоступен" text={model.error}><button class="btn" onClick={() => model.load()}>Повторить</button></ScreenMessage></Show>
    <Show when={!model.loading && !model.error}>
      <Show when={model.items.length} fallback={<ScreenMessage title="Пока пусто" text="Найдите фильм через поиск или откройте magnet-ссылку." />}>
        <For each={model.items}>{(item, index) => <TorrentRow number={index() + 1} title={item.title || item.name || item.hash}
          meta={[{ text: model.globals.app.bytes(item.torrent_size) }, { text: item.stat_string }]} onOpen={() => model.globals.app.openTorrent(item)} />}</For>
      </Show>
    </Show>
  </div>;
});
