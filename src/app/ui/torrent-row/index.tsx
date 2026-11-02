import { For } from 'solid-js';

export function TorrentRow(props: {
  number: number;
  title: string;
  meta: { text: string; cls?: string }[];
  onOpen: () => void;
}) {
  return (
    <button class="torrent" onClick={props.onOpen}>
      <span class="torrent-number">
        {props.number < 10 ? '0' + props.number : props.number}
      </span>
      <span class="torrent-body">
        <span class="torrent-title">{props.title}</span>
        <span class="torrent-meta">
          <For each={props.meta}>
            {(meta) => <span class={meta.cls || ''}>{meta.text}</span>}
          </For>
        </span>
      </span>
      <span class="torrent-arrow">→</span>
    </button>
  );
}
