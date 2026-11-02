// Import before the libraries: webOS 5.x runs Chromium 68.
import 'core-js/actual/global-this';
import 'core-js/actual/structured-clone';
import 'core-js/actual/queue-microtask';
import 'core-js/actual/object/has-own';
// mobx-view-model uses Array.at() to look up the active screen instance.
import 'core-js/actual/array/at';
import {
  mountCatalog,
  mountLatest,
  mountHome,
  mountSearch,
  mountHistory,
  mountTorrents,
} from './app';
import { initializeApp } from './app/providers';
import type { AppServices } from './shared/types/screens';
import { installNavigation } from './app/navigation';
import { installWheelScroll } from './app/navigation/wheel';
import { installAudio } from './app/audio';
import { installScreenHeader } from './app/ui/screen-header';

declare global {
  interface Window {
    TWApp: { initialize(services: AppServices): void };
    TWCatalog: { mount(target: HTMLElement): () => void };
    TWHome: { mount(target: HTMLElement): () => void };
    TWSearch: { mount(target: HTMLElement): () => void };
    TWHistoryScreen: { mount(target: HTMLElement): () => void };
    TWTorrents: { mount(target: HTMLElement): () => void };
    TWLatest: { mount(target: HTMLElement): () => void };
  }
}

window.TWApp = { initialize: initializeApp };
window.TWCatalog = { mount: mountCatalog };
window.TWLatest = { mount: mountLatest };
window.TWHome = { mount: mountHome };
window.TWSearch = { mount: mountSearch };
window.TWHistoryScreen = { mount: mountHistory };
window.TWTorrents = { mount: mountTorrents };
installScreenHeader();
installNavigation();
installWheelScroll();
installAudio();
