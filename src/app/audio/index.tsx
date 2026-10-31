import { render } from 'solid-js/web';
import { AudioSettings } from '../ui/audio-settings/ui';
import { audioProcessor } from './processor';
import type { AudioFixMode } from './graph';

const api = {
  attach: audioProcessor.attach.bind(audioProcessor),
  reset: audioProcessor.reset.bind(audioProcessor),
  mountSettings(target: HTMLElement, mode: AudioFixMode = 'off') {
    return render(() => <AudioSettings payload={{ mode }} />, target);
  },
};

declare global { interface Window { TWAudio: typeof api } }

export function installAudio() { window.TWAudio = api; }
