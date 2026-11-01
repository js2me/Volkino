// Import before the libraries: webOS 5.x runs Chromium 68.
import 'core-js/actual/global-this';
import 'core-js/actual/structured-clone';
import 'core-js/actual/queue-microtask';
import 'core-js/actual/object/has-own';
// mobx-view-model uses Array.at() to look up the active screen instance.
import 'core-js/actual/array/at';
import { mountCatalog, mountLatest, mountHome, mountSearch, mountHistory, mountTorrents } from './app';
import { installNavigation } from './app/navigation';
import { installWheelScroll } from './app/navigation/wheel';
import { installAudio } from './app/audio';
import { installScreenHeader } from './app/ui/screen-header';
import type { CatalogBridge } from './globals/catalog';
import type { LatestBridge } from './globals/latest';
import type { HomeBridge } from './screens/home/model';
import type { SearchBridge } from './screens/search/model';
import type { HistoryBridge } from './screens/history/model';
import type { TorrentsBridge } from './screens/torrents/model';

declare global {
  interface Window {
    TWCatalog: { mount(target: HTMLElement, bridge: CatalogBridge): () => void };
    TWHome: { mount(target: HTMLElement, bridge: HomeBridge): () => void };
    TWSearch: { mount(target: HTMLElement, bridge: SearchBridge): () => void };
    TWHistoryScreen: { mount(target: HTMLElement, bridge: HistoryBridge): () => void };
    TWTorrents: { mount(target: HTMLElement, bridge: TorrentsBridge): () => void };
    TWLatest: { mount(target: HTMLElement, bridge: LatestBridge): () => void };
  }
}

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
