import type { JSX } from 'solid-js';

export function Field(props: { id: string; label: string; children: JSX.Element }) {
  return <div class="field"><label for={props.id}>{props.label}</label>{props.children}</div>;
}
