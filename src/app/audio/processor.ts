import { audioFixNames, buildAudioGraph, type AudioFixMode } from './graph';

interface Session {
  context: AudioContext;
  touched: boolean;
  source?: MediaElementAudioSourceNode;
  analyser?: AnalyserNode;
  graph?: ReturnType<typeof buildAudioGraph>;
  timer?: ReturnType<typeof setInterval>;
}

export class AudioProcessor {
  private session: Session | null = null;

  get supported() {
    return typeof window.AudioContext === 'function';
  }

  /** Must be called from the file activation gesture, before delayed playback. */
  attach(
    video: HTMLVideoElement,
    mode: AudioFixMode,
    report: (active: boolean, message: string) => void,
  ) {
    if (mode === 'off') return;
    if (!this.supported) {
      report(false, 'На этом устройстве обработка звука недоступна');
      return;
    }
    let session: Session;
    try {
      session = { context: new AudioContext(), touched: false };
      this.session = session;
      session.graph = buildAudioGraph(session.context, mode);
    } catch {
      report(false, 'Не удалось запустить обработку звука');
      return;
    }
    const fail = (message: string) => {
      if (this.session === session) report(false, message);
    };
    let resumed: Promise<void>;
    try {
      resumed = session.context.resume();
    } catch {
      fail('Устройство не разрешило обработку звука');
      return;
    }
    void resumed
      .then(() => {
        if (this.session !== session) return;
        if (session.context.state !== 'running') {
          fail('Обработка звука приостановлена устройством');
          return;
        }
        // Once the element has been routed to Web Audio, only a NEW video element
        // can restore the native audio path. The shell handles that on reset/fail.
        session.touched = true;
        session.source = session.context.createMediaElementSource(video);
        session.analyser = session.context.createAnalyser();
        session.analyser.fftSize = 1024;
        session.source.connect(session.analyser).connect(session.graph!.input);
        report(true, 'Автофикс звука: ' + audioFixNames[mode]);
        const samples = new Float32Array(session.analyser.fftSize);
        let silentTicks = 0;
        session.timer = setInterval(() => {
          if (
            this.session !== session ||
            video.paused ||
            video.seeking ||
            video.readyState < 2
          )
            return;
          if (session.context.state !== 'running') {
            fail('Устройство остановило обработку звука');
            return;
          }
          try {
            session.analyser!.getFloatTimeDomainData(samples);
          } catch {
            fail('Устройство не передаёт звук в обработчик');
            return;
          }
          if (samples.some((sample) => Math.abs(sample) > 0.00001)) {
            clearInterval(session.timer);
            session.timer = undefined;
            return;
          }
          // Some TV native decoders expose the API but never feed audio samples.
          // Prefer original sound to leaving the player silent in that case.
          if (++silentTicks >= 48)
            fail('Не удалось получить звук для обработки');
        }, 250);
      })
      .catch(() => fail('Плеер не поддерживает обработку этой аудиодорожки'));
  }

  /** Returns whether the shell must replace the consumed media element. */
  reset() {
    const session = this.session;
    this.session = null;
    if (!session) return false;
    clearInterval(session.timer);
    session.source?.disconnect();
    session.analyser?.disconnect();
    session.graph?.dispose();
    void session.context.close().catch(() => {});
    return session.touched;
  }
}

export const audioProcessor = new AudioProcessor();
