// Import before the libraries: webOS 5.x runs Chromium 68.
import 'core-js/actual/global-this';
import 'core-js/actual/structured-clone';
import 'core-js/actual/queue-microtask';
import 'core-js/actual/object/has-own';
// mobx-view-model uses Array.at() to look up the active screen instance.
import 'core-js/actual/array/at';
import { mountCatalog, mountLatest } from './app';
import { installNavigation } from './app/navigation';
import { installWheelScroll } from './app/navigation/wheel';
import { installAudio } from './app/audio';
import { installScreenHeader } from './app/ui/screen-header';
import type { CatalogBridge } from './globals/catalog';
import type { LatestBridge } from './globals/latest';

declare global {
  interface Window {
    TWCatalog: { mount(target: HTMLElement, bridge: CatalogBridge): () => void };
    TWLatest: { mount(target: HTMLElement, bridge: LatestBridge): () => void };
  }
}

window.TWCatalog = { mount: mountCatalog };
window.TWLatest = { mount: mountLatest };
installScreenHeader();
installNavigation();
installWheelScroll();
installAudio();
