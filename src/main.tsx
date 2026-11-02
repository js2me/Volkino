// Import before the libraries: webOS 5.x runs Chromium 68.
import 'core-js/actual/global-this';
import 'core-js/actual/structured-clone';
import 'core-js/actual/queue-microtask';
import 'core-js/actual/object/has-own';
// mobx-view-model uses Array.at() to look up the active screen instance.
import 'core-js/actual/array/at';
import { render } from 'solid-js/web';
import { App } from './app';
import { installWheelScroll } from './app/navigation/wheel';

render(() => <App />, document.getElementById('app')!);
installWheelScroll();
