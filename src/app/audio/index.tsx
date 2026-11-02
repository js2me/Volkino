import { render } from 'solid-js/web';
import { AppProvider } from '../providers';
import { AudioSettings } from '../ui/audio-settings/ui';
import { audioProcessor } from './processor';
import type { AudioFixMode } from './graph';

const api = {
  attach: audioProcessor.attach.bind(audioProcessor),
  reset: audioProcessor.reset.bind(audioProcessor),
  mountSettings(target: HTMLElement, mode: AudioFixMode = 'off') {
    return render(
      () => (
        <AppProvider>
          <AudioSettings payload={{ mode }} />
        </AppProvider>
      ),
      target,
    );
  },
};

declare global {
  interface Window {
    TWAudio: typeof api;
  }
}

export function installAudio() {
  window.TWAudio = api;
}
