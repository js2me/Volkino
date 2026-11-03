import { action, makeObservable, observable } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../shared/lib/mobx';
import { create, pointerTime } from '../services/seek';
import type { MediaFile, NativePlayback } from '../services/types';
import { audioProcessor } from '../audio/processor';
import { audioFixNames, type AudioFixMode } from '../audio/graph';

interface AudioTrack {
  enabled: boolean;
  label: string;
  language: string;
}
type TrackVideo = HTMLVideoElement & {
  audioTracks?: ArrayLike<AudioTrack> & EventTarget;
};
interface Playback {
  file: MediaFile;
  started: number;
  lastSave: number;
  failed?: boolean;
  nativeToken?: string;
  nativePlayback?: { currentTime: number; duration: number };
}

export class PlayerVM extends VM {
  video!: TrackVideo;
  playing: Playback | null = null;
  visible = false;
  overlay = false;
  optionsOpen = false;
  episodesOpen = false;
  episodeFiles: MediaFile[] = [];
  episodeIndex = 0;
  status = '';
  audioStatus = '';
  backVisible = true;
  paused = true;
  position = 0;
  duration = 0;
  fitIndex = 0;
  audioLabel = '';
  audioDisabled = true;
  audioFixMode: AudioFixMode = 'off';
  resume = 0;
  private returnFocus: HTMLElement | null = null;
  private seekControl!: ReturnType<typeof create>;
  private overlayTimer?: ReturnType<typeof setTimeout>;
  private playerTimer?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private startTimer?: ReturnType<typeof setTimeout>;
  private enterHeld = false;
  private drag: { id: number; position: number } | null = null;
  private suppressClickUntil = 0;
  private touchMouseUntil = 0;
  private pointer: { x: number; y: number } | null = null;
  private listeners: (() => void)[] = [];
  get step() {
    const value = this.globals.config.seekStep;
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 3600
      ? value
      : 30;
  }
  get title() {
    return this.playing?.file.path.split('/').pop() || '';
  }
  get fitLabel() {
    return [
      'Исходные пропорции',
      'Заполнить с обрезкой',
      'Растянуть на весь экран',
      'Увеличить на 33%',
    ][this.fitIndex];
  }
  constructor(params: ViewModelParams) {
    super(params);
    this.globals.player = this;
    makeObservable<this, 'startVideo' | 'recoverAudio'>(this, {
      startVideo: action.bound,
      recoverAudio: action.bound,
      playing: observable.ref,
      visible: observable,
      overlay: observable,
      optionsOpen: observable,
      episodesOpen: observable,
      episodeFiles: observable.ref,
      episodeIndex: observable,
      status: observable,
      audioStatus: observable,
      backVisible: observable,
      paused: observable,
      position: observable,
      duration: observable,
      fitIndex: observable,
      audioLabel: observable,
      audioDisabled: observable,
      audioFixMode: observable,
      play: action.bound,
      stop: action.bound,
      toggle: action.bound,
      showOverlay: action.bound,
      hideOverlay: action.bound,
      openOptions: action.bound,
      closeOptions: action.bound,
      openEpisodes: action.bound,
      closeEpisodes: action.bound,
      selectEpisode: action.bound,
      cycleFit: action.bound,
      audioTrack: action.bound,
      cycleAudioFix: action.bound,
      onMedia: action.bound,
      onPointer: action.bound,
      onVideoClick: action.bound,
      onMouseMove: action.bound,
      keyDown: action.bound,
      keyUp: action.bound,
      updateOptions: action.bound,
      renderPosition: action.bound,
      nativePlayback: action.bound,
    });
  }
  private listen(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler);
    this.listeners.push(() => target.removeEventListener(type, handler));
  }
  protected didMount() {
    this.afterRender(() => {
      this.bindVideo();
      this.updateOptions();
      this.listen(document, 'keydown', this.keyDown as EventListener);
      this.listen(document, 'keyup', this.keyUp as EventListener);
      this.listen(window, 'blur', () => {
        this.enterHeld = false;
      });
      this.listen(document, 'volkino-pause', () => this.pauseAndSave());
      this.listen(document, 'visibilitychange', () => {
        if (document.hidden) this.pauseAndSave();
      });
      this.listen(window, 'beforeunload', () => this.saveHistory());
      this.listen(window, 'resize', () => this.applyFit());
      window.TWAndroidKey = (code, down, repeat) => {
        if (code === 13 && document.activeElement?.tagName === 'INPUT')
          return false;
        const event = new KeyboardEvent(down ? 'keydown' : 'keyup', {
          bubbles: true,
          cancelable: true,
          keyCode: code,
          repeat: !!repeat,
        });
        document.dispatchEvent(event);
        return true;
      };
      window.TWAndroidBack = () => {
        if (
          !this.playing &&
          !this.globals.navigation?.isOpen &&
          this.globals.view === 'home' &&
          document.activeElement === document.getElementById('nav-home')
        )
          return false;
        window.TWAndroidKey!(27, true, false);
        return true;
      };
      window.TWAndroidPlayback = this.nativePlayback;
    });
  }
  protected willUnmount() {
    this.stop();
    this.listeners.forEach((dispose) => dispose());
    this.listeners = [];
    delete window.TWAndroidKey;
    delete window.TWAndroidBack;
    delete window.TWAndroidPlayback;
    this.globals.player = undefined;
  }
  private bindVideo() {
    this.seekControl = create(this.video, {
      onPreview: action((position) => {
        this.renderPosition(position);
        this.status = 'Перемотка к ' + this.globals.time(position) + '…';
        this.showOverlay();
      }),
      onStart: action((position) => {
        this.status =
          'Перемотка к ' +
          this.globals.time(position) +
          (this.globals.source === 'filmix'
            ? ' · ждём данные Filmix…'
            : ' · ждём данные от TorrServer…');
        this.backVisible = true;
        this.showOverlay();
      }),
      onDone: action(() => {
        if (this.playing) {
          this.status = this.video.paused ? 'Пауза' : '';
          this.backVisible = false;
          this.showOverlay();
        }
      }),
      onError: action((message) => {
        if (this.playing) {
          this.status = message;
          this.backVisible = true;
          this.showOverlay();
        }
      }),
    });
    const video = this.video;
    for (const type of [
      'seeked',
      'loadedmetadata',
      'resize',
      'playing',
      'waiting',
      'canplay',
      'pause',
      'ended',
      'error',
      'timeupdate',
    ])
      video.addEventListener(type, () => this.onMedia(type));
    if (video.audioTracks?.addEventListener)
      for (const type of ['addtrack', 'removetrack', 'change'])
        video.audioTracks.addEventListener(type, this.updateOptions);
  }
  play(file: MediaFile, resume = 0) {
    if (!this.seekControl) return;
    this.closeOptions();
    if (this.playing) this.saveHistory();
    else this.returnFocus = document.activeElement as HTMLElement;
    clearTimeout(this.playerTimer);
    clearTimeout(this.deadline);
    clearTimeout(this.overlayTimer);
    clearTimeout(this.startTimer);
    this.seekControl.cancel();
    this.playing = null;
    this.resetAudio();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.episodesOpen = false;
    this.playing = { file, started: Date.now(), lastSave: 0 };
    this.resume = resume;
    this.visible = true;
    this.status =
      this.globals.source === 'filmix'
        ? 'Загружаем видео Filmix…'
        : 'Буферизация · получаем данные от TorrServer…';
    this.backVisible = true;
    this.audioStatus = '';
    this.audioFixMode = this.globals.config.audioFix || 'off';
    this.renderPosition(resume);
    this.showOverlay();
    this.saveHistory(true);
    this.afterRender((root) =>
      root.querySelector<HTMLElement>('#player-back')?.focus(),
    );
    const current = this.playing;
    if (!window.TWNativePlayer) this.attachAudio(current);
    if (this.globals.source !== 'filmix')
      this.globals.api(
        'preload',
        { hash: this.globals.hash, index: file.id },
        action((error) => {
          if (this.playing === current && error)
            this.status =
              'Предзагрузка: ' + error.message + ' · пробуем открыть поток';
        }),
      );
    this.startTimer = setTimeout(() => {
      if (this.playing !== current) return;
      if (this.globals.source === 'filmix') {
        const levels = file.qualities || [];
        const quality =
          levels.find((q) => q <= this.globals.filmixQuality) || levels[0];
        this.globals.api<{ url: string }>(
          'filmix/play',
          {
            id: this.globals.filmixId,
            fileId: file.id,
            voice: file.voice,
            quality,
          },
          action((error, data) => {
            if (this.playing !== current) return;
            if (error) {
              clearTimeout(this.deadline);
              current.failed = true;
              this.status = error.message;
              this.showOverlay();
              return;
            }
            this.startVideo(current, data.url);
          }),
        );
      } else
        this.startVideo(
          current,
          '/stream?hash=' +
            encodeURIComponent(this.globals.hash) +
            '&index=' +
            file.id,
        );
    }, 100);
    this.deadline = setTimeout(() => {
      if (this.playing !== current || this.video.readyState >= 3) return;
      clearTimeout(this.playerTimer);
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      current.failed = true;
      this.status =
        this.globals.source === 'filmix'
          ? 'Не удалось начать просмотр Filmix за 60 секунд. Проверьте доступность видео и выберите другое качество.'
          : 'Не удалось начать просмотр за 60 секунд. Проверьте сидов и выберите другую раздачу; её видео или аудио также могут не поддерживаться телевизором.';
      this.showOverlay();
    }, 60000);
    if (this.globals.source !== 'filmix') this.poll(current);
  }
  private startVideo(current: Playback, url: string) {
    if (this.playing !== current) return;
    if (window.TWNativePlayer) {
      clearTimeout(this.deadline);
      clearTimeout(this.playerTimer);
      current.nativeToken = current.started + ':' + current.file.id;
      current.nativePlayback = { currentTime: this.resume, duration: 0 };
      const episodes = this.globals.files
        .filter((file) => this.folder(file) === this.folder(current.file))
        .map((file) => ({
          id: file.id,
          title: file.path.replace(/\\/g, '/').split('/').pop(),
          current: file.id === current.file.id,
        }));
      try {
        window.TWNativePlayer.play(
          url,
          this.title,
          this.resume,
          this.step,
          current.nativeToken,
          JSON.stringify(episodes),
        );
      } catch (error) {
        this.stop();
        this.globals.toast(
          'Не удалось открыть Android-плеер: ' + (error as Error).message,
        );
      }
      return;
    }
    this.video.src = url;
    this.video.load();
    this.video.play()?.catch(
      action((error) => {
        if (this.playing === current) {
          this.status = 'Не удалось начать просмотр: ' + error.message;
          this.showOverlay();
        }
      }),
    );
  }
  nativePlayback(result: NativePlayback) {
    const current = this.playing;
    if (!current || current.nativeToken !== result.token) return;
    current.nativePlayback = {
      currentTime: result.position,
      duration: result.duration,
    };
    this.saveHistory(false, result.completed);
    if (result.closed) {
      const next = this.globals.files.find(
        (file) => file.id === result.nextFileId,
      );
      this.stop();
      if (result.error) this.globals.toast(result.error);
      if (next) this.selectFile(next);
    }
  }
  private poll(current: Playback) {
    this.playerTimer = setTimeout(() => {
      if (
        this.playing !== current ||
        current.failed ||
        this.video.readyState >= 3
      )
        return;
      this.globals.api<{ torrent: import('../services/types').Torrent }>(
        'status?hash=' + encodeURIComponent(this.globals.hash),
        null,
        action((error, data) => {
          if (
            this.playing !== current ||
            current.failed ||
            this.video.readyState >= 3
          )
            return;
          if (!error) {
            const t = data.torrent,
              p = t.preload_size
                ? Math.min(
                    100,
                    Math.floor(
                      (100 * (t.preloaded_bytes || 0)) / t.preload_size,
                    ),
                  )
                : 0;
            this.status =
              'Подготовка: ' +
              p +
              '% · ' +
              this.globals.bytes(t.download_speed) +
              '/с · сиды ' +
              (t.connected_seeders || 0) +
              ' · ' +
              Math.floor((Date.now() - current.started) / 1000) +
              ' сек. BACK — вернуться к файлам';
          }
          this.poll(current);
        }),
      );
    }, 2000);
  }
  private resetAudio() {
    if (!audioProcessor.reset()) return;
    this.seekControl.cancel();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    // A MediaElementSource cannot be detached. Recreate the video before reusing native audio.
    const previous = this.video,
      fresh = previous.cloneNode(false) as TrackVideo;
    fresh.muted = previous.muted;
    fresh.volume = previous.volume;
    previous.replaceWith(fresh);
    this.video = fresh;
    this.bindVideo();
  }
  private recoverAudio(current: Playback, message: string) {
    if (this.playing !== current) return;
    const url = this.video.currentSrc || this.video.getAttribute('src'),
      position =
        this.video.currentTime > 0 ? this.video.currentTime : this.resume,
      paused = this.video.paused;
    this.resetAudio();
    this.resume = position || 0;
    this.audioFixMode = 'off';
    this.audioStatus = 'Оригинальный звук · автофикс недоступен';
    this.globals.toast(message + '. Продолжаем с оригинальным звуком.');
    if (url) {
      this.video.src = url;
      this.video.load();
      if (!paused)
        this.video.play()?.catch(() => {
          if (this.playing === current) {
            this.status = 'Нажмите OK, чтобы продолжить';
            this.showOverlay();
          }
        });
    }
  }
  private attachAudio(current: Playback) {
    audioProcessor.attach(
      this.video,
      this.audioFixMode,
      action((active, message) => {
        if (this.playing !== current) return;
        if (active) this.audioStatus = message;
        else this.recoverAudio(current, message);
      }),
    );
  }
  get audioFixLabel() {
    return audioFixNames[this.audioFixMode];
  }
  get audioFixSupported() {
    return audioProcessor.supported && !window.TWNativePlayer;
  }
  cycleAudioFix() {
    const current = this.playing;
    if (!current || !this.audioFixSupported) return;
    const modes: AudioFixMode[] = ['off', 'moderate', 'night'];
    const next = modes[(modes.indexOf(this.audioFixMode) + 1) % modes.length];
    const url = this.video.currentSrc || this.video.getAttribute('src');
    const position = this.video.currentTime || this.resume;
    const paused = this.video.paused;
    const previous = this.video;
    this.resetAudio();
    const replaced = previous !== this.video;
    this.audioFixMode = next;
    this.audioStatus = '';
    if (replaced && url) {
      this.resume = position || 0;
      this.video.src = url;
      this.video.load();
    }
    this.attachAudio(current);
    if (replaced && url && !paused)
      this.video.play()?.catch(() => {
        if (this.playing === current) {
          this.status = 'Нажмите OK, чтобы продолжить';
          this.showOverlay();
        }
      });
  }
  stop() {
    this.cancelDrag();
    this.closeOptions();
    this.saveHistory();
    this.seekControl?.cancel();
    this.playing = null;
    this.episodesOpen = false;
    this.overlay = false;
    this.visible = false;
    clearTimeout(this.overlayTimer);
    clearTimeout(this.playerTimer);
    clearTimeout(this.deadline);
    clearTimeout(this.startTimer);
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.resetAudio();
    }
    this.audioStatus = '';
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    else this.globals.focusFirst();
  }
  selectFile(file: MediaFile) {
    const previous = this.globals.watchedFile(file);
    this.play(file, previous && !previous.completed ? previous.position : 0);
  }
  saveHistory(opening = false, completed = false) {
    const current = this.playing;
    if (!current) return;
    const previous = this.globals.watchedFile(current.file),
      playback = current.nativePlayback || this.video;
    const position =
      opening ||
      !Number.isFinite(playback.currentTime) ||
      playback.currentTime < 0.1
        ? previous?.position || this.resume || 0
        : playback.currentTime;
    const duration =
      !opening && Number.isFinite(playback.duration) && playback.duration > 0
        ? playback.duration
        : previous?.duration || 0;
    this.globals.saveHistory({
      hash: this.globals.hash,
      fileId: current.file.id,
      fileName: current.file.path,
      title: this.title,
      torrentTitle:
        this.globals.torrent?.title || this.globals.torrent?.name || '',
      link:
        this.globals.originalLink || 'magnet:?xt=urn:btih:' + this.globals.hash,
      position,
      duration,
      completed:
        completed ||
        !!previous?.completed ||
        (!opening && duration > 0 && position / duration >= 0.95),
      updated: Date.now(),
      ...(this.globals.source === 'filmix'
        ? {
            source: 'filmix' as const,
            filmixId: this.globals.filmixId,
            voice: current.file.voice,
            season: current.file.season,
            quality: this.globals.filmixQuality,
          }
        : {}),
    });
  }
  private pauseAndSave() {
    if (this.playing) {
      this.video.pause();
      this.saveHistory();
    }
  }
  showOverlay() {
    if (!this.playing) return;
    this.overlay = true;
    this.armOverlay();
  }
  private armOverlay() {
    clearTimeout(this.overlayTimer);
    this.overlayTimer = undefined;
    if (
      !this.playing ||
      !this.overlay ||
      this.optionsOpen ||
      this.video.paused ||
      this.video.readyState < 3 ||
      this.seekControl.isBusy() ||
      this.drag ||
      this.playing.failed
    )
      return;
    this.overlayTimer = setTimeout(() => {
      this.overlayTimer = undefined;
      if (
        !this.video.paused &&
        !this.seekControl.isBusy() &&
        this.video.readyState >= 3
      )
        this.hideOverlay();
    }, 5000);
  }
  hideOverlay() {
    clearTimeout(this.overlayTimer);
    this.overlayTimer = undefined;
    this.overlay = false;
    this.episodesOpen = false;
    this.optionsOpen = false;
    if (
      this.root?.contains(document.activeElement) &&
      document.activeElement !== this.video
    )
      this.video.focus();
  }
  private folder(file: MediaFile) {
    const path = file.path.replace(/\\/g, '/');
    return path.slice(0, path.lastIndexOf('/') + 1);
  }
  openEpisodes() {
    if (!this.playing) return;
    this.closeOptions();
    this.saveHistory();
    const current = this.playing.file;
    this.episodeFiles = this.globals.files.filter(
      (file) => this.folder(file) === this.folder(current),
    );
    this.episodeIndex = Math.max(
      0,
      this.episodeFiles.findIndex((file) => file.id === current.id),
    );
    this.episodesOpen = true;
    this.afterRender(() => this.focusEpisode(this.episodeIndex));
  }
  private focusEpisode(index: number) {
    this.episodeIndex = Math.max(
      0,
      Math.min(index, this.episodeFiles.length - 1),
    );
    const card =
      this.root?.querySelectorAll<HTMLElement>('.episode-card')[
        this.episodeIndex
      ];
    card?.focus();
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.showOverlay();
  }
  selectEpisode(file: MediaFile) {
    if (file.id === this.playing?.file.id) this.closeEpisodes();
    else this.selectFile(file);
  }
  closeEpisodes() {
    this.episodesOpen = false;
    this.video?.focus();
    this.showOverlay();
  }
  openOptions() {
    if (!this.playing) return;
    if (this.episodesOpen) this.closeEpisodes();
    this.optionsOpen = true;
    this.updateOptions();
    this.showOverlay();
    this.afterRender((root) =>
      root
        .querySelector<HTMLElement>(
          this.audioDisabled ? '#player-fit' : '#player-audio',
        )
        ?.focus(),
    );
  }
  closeOptions() {
    if (!this.optionsOpen) return;
    this.optionsOpen = false;
    this.video?.focus();
    this.showOverlay();
  }
  cycleFit() {
    this.fitIndex = (this.fitIndex + 1) % 4;
    this.updateOptions();
  }
  private applyFit() {
    if (!this.video) return;
    const width = this.root?.clientWidth || 0;
    const height = this.root?.clientHeight || 0;
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    let x = 1;
    let y = 1;
    if (width && height && videoWidth && videoHeight) {
      // The native video plane keeps its aspect ratio even when object-fit is ignored.
      const ratio = videoWidth / videoHeight / (width / height);
      const fillX = Math.max(1, 1 / ratio);
      const fillY = Math.max(1, ratio);
      if (this.fitIndex === 1) x = y = Math.max(fillX, fillY);
      if (this.fitIndex === 2) {
        x = fillX;
        y = fillY;
      }
    }
    if (this.fitIndex === 3) x = y = 1.33;
    this.video.style.transform = `scale(${x}, ${y})`;
  }
  updateOptions() {
    const tracks = this.video?.audioTracks;
    let index = -1;
    if (tracks)
      for (let i = 0; i < tracks.length; i++) if (tracks[i].enabled) index = i;
    this.audioDisabled = !tracks || tracks.length < 2;
    this.audioLabel = !tracks?.length
      ? 'Аудио: выбор недоступен на этом устройстве'
      : tracks.length === 1
        ? 'Аудио: одна дорожка'
        : 'Аудио: ' +
          (index >= 0
            ? tracks[index].label ||
              tracks[index].language ||
              'Дорожка ' + (index + 1)
            : 'выбрать') +
          ' · OK — следующая';
    this.applyFit();
    if (
      this.optionsOpen &&
      this.audioDisabled &&
      document.activeElement?.id === 'player-audio'
    )
      document.getElementById('player-fit')?.focus();
  }
  audioTrack() {
    const tracks = this.video.audioTracks;
    if (!tracks || tracks.length < 2) {
      this.globals.toast(
        'Другие аудиодорожки недоступны в этом файле или на этом устройстве',
      );
      return;
    }
    let index = -1;
    for (let i = 0; i < tracks.length; i++) if (tracks[i].enabled) index = i;
    const next = (index + 1) % tracks.length;
    try {
      tracks[next].enabled = true;
      for (let i = 0; i < tracks.length; i++)
        if (i !== next) tracks[i].enabled = false;
      this.updateOptions();
      this.globals.toast(
        'Аудио: ' + (tracks[next].label || tracks[next].language || next + 1),
      );
    } catch {
      this.globals.toast(
        'Устройство не поддерживает переключение этой аудиодорожки',
      );
    }
  }
  toggle() {
    if (!this.playing) return;
    this.seekControl.pausedIntent(!this.video.paused);
    if (this.video.paused)
      this.video.play()?.catch((error) => this.globals.toast(error.message));
    else this.video.pause();
    this.showOverlay();
  }
  seek(delta: number) {
    if (!this.seekControl.by(delta))
      this.globals.toast('Перемотка станет доступна после загрузки метаданных');
  }
  renderPosition(position: number) {
    this.position = position || 0;
    this.duration =
      Number.isFinite(this.video.duration) && this.video.duration > 0
        ? this.video.duration
        : 0;
  }
  onMedia(type: string) {
    const video = this.video;
    if (type === 'resize') this.applyFit();
    if (type === 'seeked') this.seekControl.update();
    if (type === 'loadedmetadata') {
      this.updateOptions();
      if (this.resume > 0) {
        try {
          video.currentTime = Math.min(
            this.resume,
            Math.max(0, video.duration - 0.1),
          );
        } catch {}
        this.resume = 0;
      }
    }
    if (type === 'playing') {
      this.paused = false;
      clearTimeout(this.deadline);
      clearTimeout(this.playerTimer);
      this.seekControl.update();
      if (!this.seekControl.isBusy()) {
        this.status = '';
        this.backVisible = false;
      }
      this.showOverlay();
    }
    if (type === 'waiting' && this.playing && !this.playing.failed) {
      if (!this.seekControl.isBusy())
        this.status =
          this.globals.source === 'filmix'
            ? 'Буферизация · ждём данные Filmix…'
            : 'Буферизация · ждём данные от участников раздачи…';
      this.showOverlay();
    }
    if (type === 'canplay') {
      if (this.playing && !this.seekControl.isBusy())
        this.status = video.paused ? 'Пауза' : '';
      if (!this.overlayTimer) this.armOverlay();
    }
    if (type === 'pause') {
      this.paused = true;
      if (this.playing && !this.seekControl.isBusy()) this.status = 'Пауза';
      this.showOverlay();
    }
    if (type === 'ended') {
      this.saveHistory(false, true);
      this.stop();
      this.globals.toast('Просмотр завершён');
    }
    if (type === 'error' && this.playing) {
      const code = video.error?.code || 0;
      this.status =
        code === 4
          ? 'Формат видео или аудио не поддерживается телевизором. Выберите другое видео или качество.'
          : 'Ошибка потока (' +
            code +
            '). ' +
            (this.globals.source === 'filmix'
              ? 'Проверьте Filmix или выберите другое качество.'
              : 'Проверьте TorrServer и доступность сидов.');
      this.showOverlay();
    }
    if (type === 'timeupdate') {
      this.seekControl.update();
      this.renderPosition(
        this.drag
          ? this.drag.position
          : (this.seekControl.target() ?? video.currentTime),
      );
      if (!this.overlayTimer) this.armOverlay();
      if (
        this.playing &&
        !this.seekControl.isBusy() &&
        Date.now() - this.playing.lastSave > 10000
      ) {
        this.playing.lastSave = Date.now();
        this.saveHistory();
      }
    }
  }
  onTimelineClick(event: MouseEvent) {
    if (!this.playing || Date.now() < this.suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeEpisodes();
    const el = event.currentTarget as HTMLElement;
    el.focus();
    const rect = el.getBoundingClientRect();
    const position = pointerTime(
      event.clientX,
      rect.left,
      rect.width,
      this.video.duration,
    );
    if (position === null || !this.seekControl.to(position))
      this.globals.toast('Перемотка станет доступна после загрузки метаданных');
  }
  onPointer(event: PointerEvent) {
    if (event.type === 'pointerdown' && event.pointerType === 'touch')
      this.touchMouseUntil = Date.now() + 1000;
    if ((event.currentTarget as HTMLElement).id !== 'player-timeline') return;
    if (event.type === 'pointerdown') {
      if (
        !this.playing ||
        this.drag ||
        event.isPrimary === false ||
        event.button !== 0 ||
        this.video.readyState < 1 ||
        !Number.isFinite(this.video.duration) ||
        this.video.duration <= 0
      )
        return;
      this.drag = { id: event.pointerId, position: this.video.currentTime };
      this.closeEpisodes();
      (event.currentTarget as HTMLElement).focus();
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {}
    }
    if (!this.drag || this.drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (['pointercancel', 'lostpointercapture'].includes(event.type)) {
      this.suppressClickUntil = Date.now() + 500;
      this.cancelDrag();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position = pointerTime(
      event.clientX,
      rect.left,
      rect.width,
      this.video.duration,
    );
    if (position !== null) {
      this.drag.position = position;
      this.renderPosition(position);
      this.showOverlay();
    }
    if (event.type === 'pointerup') {
      const position = this.drag.position;
      this.drag = null;
      this.suppressClickUntil = Date.now() + 500;
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(
          event.pointerId,
        );
      } catch {}
      this.seekControl.to(position);
      this.showOverlay();
    }
  }
  private cancelDrag() {
    if (!this.drag) return;
    const id = this.drag.id;
    this.drag = null;
    try {
      document.getElementById('player-timeline')?.releasePointerCapture(id);
    } catch {}
    this.renderPosition(this.seekControl.target() ?? this.video.currentTime);
    this.showOverlay();
  }
  onMouseMove(event: MouseEvent) {
    if (
      !this.playing ||
      Date.now() < this.touchMouseUntil ||
      (
        event as MouseEvent & {
          sourceCapabilities?: { firesTouchEvents: boolean };
        }
      ).sourceCapabilities?.firesTouchEvents
    )
      return;
    if (
      this.pointer &&
      Math.abs(event.clientX - this.pointer.x) < 4 &&
      Math.abs(event.clientY - this.pointer.y) < 4
    )
      return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.showOverlay();
  }
  onVideoClick(event: MouseEvent) {
    if (!this.playing || event.target !== this.video) return;
    if (this.overlay) this.hideOverlay();
    else this.showOverlay();
  }
  keyDown(event: KeyboardEvent) {
    const code = event.keyCode,
      active = document.activeElement as HTMLElement,
      back =
        code === 461 ||
        code === 27 ||
        (code === 8 && active.tagName !== 'INPUT');
    if (code === 13) {
      if (this.enterHeld || event.repeat) {
        event.preventDefault();
        return;
      }
      this.enterHeld = true;
    }
    if (this.globals.navigation?.handleKeyDown(event)) return;
    if (code === 13 && !this.playing && active.tagName === 'BUTTON') {
      event.preventDefault();
      active.click();
      return;
    }
    if (
      code === 13 &&
      !this.playing &&
      active.tagName === 'INPUT' &&
      (active as HTMLInputElement).form
    ) {
      event.preventDefault();
      (active as HTMLInputElement).form!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      return;
    }
    if (this.playing && this.optionsOpen) {
      if (back || code === 40 || code === 38) {
        event.preventDefault();
        this.closeOptions();
        return;
      }
      if (code === 37 || code === 39) {
        event.preventDefault();
        const buttons = [
            ...this.root!.querySelectorAll<HTMLButtonElement>(
              '#player-options button',
            ),
          ].filter((b) => !b.disabled),
          index = buttons.indexOf(active as HTMLButtonElement);
        buttons[
          (index + (code === 37 ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
        return;
      }
      if (code === 13) {
        event.preventDefault();
        if (active.tagName === 'BUTTON') active.click();
        return;
      }
    }
    if (this.playing && this.episodesOpen) {
      if (back || code === 38) {
        event.preventDefault();
        this.closeEpisodes();
        return;
      }
      if (code === 37 || code === 39) {
        event.preventDefault();
        this.focusEpisode(this.episodeIndex + (code === 37 ? -1 : 1));
        return;
      }
      if (code === 13) {
        event.preventDefault();
        const file = this.episodeFiles[this.episodeIndex];
        if (file) this.selectEpisode(file);
        return;
      }
      if (code === 40) {
        event.preventDefault();
        this.showOverlay();
        return;
      }
    }
    if (
      this.playing &&
      code === 13 &&
      (this.playing.failed || (active.id === 'player-back' && this.backVisible))
    ) {
      event.preventDefault();
      this.stop();
      return;
    }
    if (this.playing) {
      if (back || code === 413) {
        event.preventDefault();
        this.stop();
        return;
      }
      if ([13, 19, 415, 10252].includes(code)) {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (code === 40 || code === 38) {
        event.preventDefault();
        if (code === 40) this.openEpisodes();
        else this.openOptions();
        return;
      }
      if ([37, 39, 412, 417].includes(code)) {
        event.preventDefault();
        this.seek((code === 37 || code === 412 ? -1 : 1) * this.step);
        return;
      }
      if (code === 405) {
        event.preventDefault();
        this.audioTrack();
        return;
      }
      this.showOverlay();
      return;
    }
    if (back) {
      event.preventDefault();
      this.globals.back();
      return;
    }
    if (code >= 37 && code <= 40 && this.globals.navigation?.navigate(code))
      event.preventDefault();
  }
  keyUp(event: KeyboardEvent) {
    if (event.keyCode === 13) {
      this.enterHeld = false;
      if (document.activeElement?.tagName === 'BUTTON' || this.playing)
        event.preventDefault();
    }
  }
}
declare global {
  interface Window {
    TWNativePlayer?: {
      play(
        url: string,
        title: string,
        resume: number,
        step: number,
        token: string,
        episodes: string,
      ): void;
    };
    TWAndroidPlayback?: (result: NativePlayback) => void;
    TWAndroidKey?: (code: number, down: boolean, repeat: boolean) => boolean;
    TWAndroidBack?: () => boolean;
  }
}
