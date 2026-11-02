import { type JSX } from 'solid-js';
import { render } from 'solid-js/web';

/** Shared, persistent page heading for both Solid screens and the legacy shell. */
export function ScreenHeader(props: { title: string; children?: JSX.Element }) {
  return (
    <header class="screen-header">
      <h1 id="page-title">{props.title}</h1>
      <div id="screen-header-tools" class="screen-header-tools">
        {props.children}
      </div>
    </header>
  );
}

export function installScreenHeader() {
  const host = document.getElementById('screen-header');
  if (host) {
    host.textContent = '';
    render(() => <ScreenHeader title="Что посмотрим сегодня?" />, host);
  }
}
