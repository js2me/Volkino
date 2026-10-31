import { action, makeObservable, observable } from 'mobx';
import { ViewModelBase, type ViewModelParams } from 'mobx-view-model';
import { audioProcessor } from '../../../audio/processor';
import type { AudioFixMode } from '../../../audio/graph';

export class AudioSettingsVM extends ViewModelBase<{ mode: AudioFixMode }> {
  mode: AudioFixMode;
  readonly supported = audioProcessor.supported;

  constructor(params: ViewModelParams<{ mode: AudioFixMode }>) {
    super(params);
    this.mode = this.supported ? this.payload.mode || 'off' : 'off';
    makeObservable(this, { mode: observable, setMode: action });
  }

  setMode(mode: AudioFixMode) { this.mode = mode; }
}
