import { For, Show, onMount } from 'solid-js';
import { useViewModel, withViewModel } from 'mobx-view-model-solid';
import { HistoryVM } from '../model';
import { TorrentRow } from '../../../app/ui/torrent-row';
import { ScreenMessage } from '../../../app/ui/screen-message';

function dateLabel(updated: number) {
  const date = new Date(updated);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU');
}
export const History = withViewModel(HistoryVM, () => {
  const model = useViewModel<HistoryVM>();
  let root!: HTMLDivElement;
  onMount(() => root.querySelector<HTMLButtonElement>('button')?.focus());
  return <div ref={root} class="history-screen">
    <Show when={model.items.length} fallback={<ScreenMessage title="История пока пуста" text="Откройте видео — сохраним его сразу. Здесь остаются последние 100 файлов и позиции просмотра." />}>
      <p class="muted">{model.items.length} из {model.bridge.limit} · последние открытые видео · старые записи удаляются автоматически</p>
      <For each={model.items}>{(item, index) => <TorrentRow number={index() + 1} title={item.title}
        meta={[{ text: item.position > 0 ? model.bridge.time(item.position) + ' / ' + model.bridge.time(item.duration) : 'Открыто · просмотр ещё не начат' }, { text: dateLabel(item.updated) }, { text: item.torrentTitle || item.fileName }]}
        onOpen={() => model.bridge.resume(item)} />}</For>
      <button class="btn" onClick={() => model.clear()}>Очистить историю</button>
    </Show>
  </div>;
});
