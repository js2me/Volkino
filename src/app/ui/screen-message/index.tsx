import { Show, type JSX } from 'solid-js';

export function ScreenMessage(props: { title: string; text: string; busy?: boolean; children?: JSX.Element }) {
  return <div class="empty"><h2><Show when={props.busy}><i class="spinner" /></Show>{props.title}</h2>
    <p>{props.text}</p>{props.children}</div>;
}
