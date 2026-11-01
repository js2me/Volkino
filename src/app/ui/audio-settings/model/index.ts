import { action, makeObservable, observable } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../../shared/lib/mobx';
import type { AudioFixMode } from '../../../audio/graph';

export class AudioSettingsVM extends VM<{ mode: AudioFixMode }> {
  mode: AudioFixMode;
  readonly supported = this.globals.audio.supported;

  constructor(params: ViewModelParams<{ mode: AudioFixMode }>) {
    super(params);
    this.mode = this.supported ? this.payload.mode || 'off' : 'off';
    makeObservable(this, { mode: observable, setMode: action });
  }

  setMode(mode: AudioFixMode) { this.mode = mode; }
}
