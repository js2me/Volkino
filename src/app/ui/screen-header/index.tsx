import { type JSX } from 'solid-js';

/** Persistent page heading and tools for the active screen. */
export function ScreenHeader(props: {
  title: string;
  filePage?: boolean;
  children?: JSX.Element;
}) {
  return (
    <header class="screen-header">
      <h1 id="page-title" class={props.filePage ? 'file-page-title' : ''}>
        {props.title}
      </h1>
      <div id="screen-header-tools" class="screen-header-tools">
        {props.children}
      </div>
    </header>
  );
}
