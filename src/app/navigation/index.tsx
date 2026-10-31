import { render } from 'solid-js/web';
import { RemoteSelect } from '../ui/remote-select/ui';
import type { RemoteSelectVM } from '../ui/remote-select/model';

const selector = 'button,input,select';

function visible(element: HTMLElement) {
  return !!(element.offsetWidth && element.offsetHeight) && !element.matches(':disabled');
}

function focus(element: HTMLElement) {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Choose in the nearest visual row/column, without diagonal row wrapping. */
function neighbor(active: HTMLElement, candidates: HTMLElement[], code: number) {
  const from = active.getBoundingClientRect();
  const vertical = code === 38 || code === 40;
  const next = candidates.filter(element => element !== active).map(element => {
    const to = element.getBoundingClientRect();
    const distance = code === 37 ? from.left - to.right : code === 39 ? to.left - from.right :
      code === 38 ? from.top - to.bottom : to.top - from.bottom;
    const overlap = vertical ? Math.min(from.right, to.right) - Math.max(from.left, to.left) :
      Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
    const cross = vertical ? Math.abs(from.left + from.width / 2 - to.left - to.width / 2) :
      Math.abs(from.top + from.height / 2 - to.top - to.height / 2);
    return { element, distance, overlap, cross };
  }).filter(item => item.distance >= -2 && (vertical || item.overlap > 2));
  if (!next.length) return null;
  const nearest = Math.min(...next.map(item => item.distance));
  const row = next.filter(item => item.distance <= nearest + 16);
  row.sort((a, b) => Number(b.overlap > 2) - Number(a.overlap > 2) || a.cross - b.cross || a.distance - b.distance);
  return row[0].element;
}

class Navigation {
  private lastMainFocus: HTMLElement | null = null;
  private lastSidebarFocus: HTMLElement | null = null;
  private picker: { select: HTMLSelectElement; model?: RemoteSelectVM; host: HTMLDivElement; dispose?: () => void } | null = null;

  constructor() {
    document.addEventListener('focusin', event => {
      const element = event.target as HTMLElement;
      if (document.getElementById('main')?.contains(element)) this.lastMainFocus = element;
      if (document.querySelector('aside')?.contains(element)) this.lastSidebarFocus = element;
    });
    // A native select opens on mousedown, before click. Use the same picker for
    // mouse and remote so its open/closed state is unambiguous on webOS as well.
    document.addEventListener('mousedown', event => {
      const element = event.target as HTMLElement;
      if (element.tagName === 'SELECT' && visible(element)) {
        event.preventDefault();
        this.open(element as HTMLSelectElement);
      }
    }, true);
    document.addEventListener('click', event => {
      const element = event.target as HTMLElement;
      if (element.tagName === 'SELECT' && visible(element)) {
        event.preventDefault();
        this.open(element as HTMLSelectElement);
      }
    }, true);
  }

  private open(select: HTMLSelectElement) {
    if (this.picker?.select === select) return;
    this.close(false);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const picker: NonNullable<Navigation['picker']> = { select, host };
    this.picker = picker;
    select.setAttribute('aria-expanded', 'true');
    picker.dispose = render(() => <RemoteSelect payload={{
      select, close: () => this.close(), ready: model => { picker.model = model; },
    }} />, host);
  }

  close(restore = true) {
    const picker = this.picker;
    if (!picker) return;
    this.picker = null;
    picker.select.setAttribute('aria-expanded', 'false');
    picker.dispose?.();
    picker.host.remove();
    const select = picker.select.isConnected ? picker.select : document.getElementById(picker.select.id);
    if (restore && select && visible(select)) focus(select);
  }

  handleKeyDown(event: KeyboardEvent) {
    const code = event.keyCode;
    if (this.picker) {
      if (![8, 9, 13, 27, 32, 35, 36, 37, 38, 39, 40, 461].includes(code)) return false;
      event.preventDefault();
      const model = this.picker.model;
      if (code === 38) model?.move(-1);
      else if (code === 40) model?.move(1);
      else if (code === 36) model?.edge(false);
      else if (code === 35) model?.edge(true);
      else if (code === 13 || code === 32) { if (!event.repeat) model?.choose(); }
      else if (code === 27 || code === 461 || code === 8) this.close();
      else if (code === 9) model?.move(event.shiftKey ? -1 : 1);
      return true;
    }
    const active = document.activeElement;
    if (active?.tagName === 'SELECT' && (code === 13 || code === 32 || (code === 40 && event.altKey))) {
      event.preventDefault();
      if (!event.repeat) this.open(active as HTMLSelectElement);
      return true;
    }
    return false;
  }

  navigate(code: number) {
    const active = document.activeElement as HTMLElement;
    if (active?.tagName === 'INPUT' && (code === 37 || code === 39)) {
      const input = active as HTMLInputElement;
      const start = input.selectionStart, end = input.selectionEnd;
      if (start === null || end === null || start !== end || (code === 37 ? start > 0 : end < input.value.length)) return false;
    }
    const main = document.getElementById('main');
    const sidebar = document.querySelector('aside');
    if (!main || !sidebar) return true;
    const inSidebar = sidebar.contains(active);
    const container = inSidebar ? sidebar : main;
    const candidates = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(visible);
    if (inSidebar && code === 39) {
      const target = this.lastMainFocus?.isConnected && visible(this.lastMainFocus) ? this.lastMainFocus :
        Array.from(main.querySelectorAll<HTMLElement>(selector)).find(visible);
      if (target) focus(target);
      return true;
    }
    if (inSidebar && code === 37) return true;
    if (!active || active === document.body || !container.contains(active)) {
      if (candidates[0]) focus(candidates[0]);
      return true;
    }
    const target = neighbor(active, candidates, code);
    if (target) focus(target);
    else if (!inSidebar && code === 37) {
      const selected = sidebar.querySelector<HTMLElement>('.nav.active');
      const previous = this.lastSidebarFocus;
      const target = selected && visible(selected) ? selected :
        previous?.isConnected && sidebar.contains(previous) && visible(previous) ? previous :
        Array.from(sidebar.querySelectorAll<HTMLElement>(selector)).find(visible);
      if (target) focus(target);
    }
    return true;
  }
}

declare global {
  interface Window { TWNavigation: Navigation }
}

export function installNavigation() {
  window.TWNavigation = new Navigation();
}
