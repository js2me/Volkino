import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type {
  FilesRequest,
  DownloadItem,
  FilmixPost,
  MediaFile,
  Torrent,
} from '../../../app/services/types';
import type { HistoryItem } from '../../../shared/types/screens';

export class FilesVM extends VM {
  saving: number[] = [];
  saved: number[] = [];
  loading = false;
  error = '';
  timedOut = false;
  post: FilmixPost | null = null;
  private request = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly intent: FilesRequest | null;
  constructor(params: ViewModelParams) {
    super(params);
    this.intent = this.globals.filesRequest;
    makeObservable(this, {
      saving: observable.ref,
      saved: observable.ref,
      save: action.bound,
      loading: observable,
      error: observable,
      timedOut: observable,
      post: observable.ref,
      qualityLevels: computed,
      load: action.bound,
      setFilter: action.bound,
      play: action.bound,
      back: action.bound,
    });
  }
  protected didMount() {
    this.load();
  }
  protected willUnmount() {
    clearTimeout(this.timer);
  }
  load() {
    const intent = this.intent;
    if (!intent) return;
    const request = ++this.request;
    clearTimeout(this.timer);
    this.loading = true;
    this.error = '';
    this.timedOut = false;
    this.post = null;
    const globals = this.globals;
    globals.source = intent.source;
    globals.hash = '';
    globals.files = [];
    globals.torrent = { title: intent.title };
    globals.pageTitle = intent.title;
    if (intent.source === 'filmix') {
      globals.filmixId = intent.id;
      globals.originalLink = 'filmix:' + intent.id;
      globals.api<FilmixPost>(
        'filmix/post?id=' + intent.id,
        null,
        (error, data) => {
          if (this.unmountSignal.aborted || request !== this.request) return;
          runInAction(() => {
            this.loading = false;
            this.error = error?.message || '';
            if (error) {
              this.focusFirst();
              return;
            }
            this.post = data;
            globals.torrent = { title: data.title };
            globals.pageTitle = data.title;
            globals.filmixVoice =
              intent.resume?.voice && data.voices.includes(intent.resume.voice)
                ? intent.resume.voice
                : data.voices[0];
            globals.filmixSeason =
              intent.resume?.season !== undefined &&
              data.seasons.includes(intent.resume.season)
                ? intent.resume.season
                : data.seasons[0];
            globals.filmixQuality = intent.resume?.quality || data.maxQuality;
            this.applyFilters();
            this.afterFiles(intent.resume);
          });
        },
      );
    } else {
      globals.api<Torrent & { hash: string }>(
        'add',
        { link: intent.link, title: intent.title },
        (error, data) => {
          if (this.unmountSignal.aborted || request !== this.request) return;
          runInAction(() => {
            if (error) {
              this.loading = false;
              this.error = error.message;
              this.focusFirst();
              return;
            }
            globals.hash = data.hash;
            globals.torrent = data;
            globals.originalLink = intent.link;
            this.poll(request, Date.now(), intent.resume);
          });
        },
      );
    }
  }
  get qualityLevels() {
    const levels = new Set<number>();
    this.post?.files.forEach((file) =>
      file.qualities?.forEach((q) => levels.add(q)),
    );
    return Array.from(levels).sort((a, b) => b - a);
  }
  private applyFilters() {
    if (!this.post) return;
    const globals = this.globals;
    let files = this.post.files.filter(
      (file) =>
        file.season === globals.filmixSeason &&
        file.voice === globals.filmixVoice,
    );
    if (!files.length) {
      const fallback = this.post.files.find(
        (file) => file.season === globals.filmixSeason,
      );
      if (fallback) {
        globals.filmixVoice = fallback.voice || '';
        files = this.post.files.filter(
          (file) =>
            file.season === globals.filmixSeason &&
            file.voice === globals.filmixVoice,
        );
      }
    }
    globals.files = files;
    if (!this.qualityLevels.includes(globals.filmixQuality))
      globals.filmixQuality =
        this.qualityLevels.find((q) => q <= globals.filmixQuality) ||
        this.qualityLevels[0];
  }
  setFilter(key: 'voice' | 'season' | 'quality', value: string) {
    if (key === 'voice') this.globals.filmixVoice = value;
    else if (key === 'season') this.globals.filmixSeason = Number(value);
    else this.globals.filmixQuality = Number(value);
    this.applyFilters();
    this.saved = [];
  }
  private poll(request: number, started: number, resume?: HistoryItem) {
    this.globals.api<{ torrent: Torrent; files: MediaFile[] }>(
      'status?hash=' + encodeURIComponent(this.globals.hash),
      null,
      (error, data) => {
        if (this.unmountSignal.aborted || request !== this.request) return;
        runInAction(() => {
          if (error) {
            this.loading = false;
            this.error = error.message;
            this.focusFirst();
            return;
          }
          this.globals.torrent = data.torrent;
          this.globals.files = data.files;
          if (data.files.length) {
            this.loading = false;
            this.globals.pageTitle =
              data.torrent.title || data.torrent.name || 'Выберите файл';
            this.afterFiles(resume);
            return;
          }
          if (Date.now() - started > 120000) {
            this.loading = false;
            this.timedOut = true;
            this.focusFirst();
            return;
          }
          this.timer = setTimeout(
            () => this.poll(request, started, resume),
            2000,
          );
        });
      },
    );
  }
  private focusFirst() {
    this.afterRender((root) =>
      root.querySelector<HTMLElement>('input,button,select')?.focus(),
    );
  }
  private afterFiles(resume?: HistoryItem) {
    this.afterRender((root) => {
      root.querySelector<HTMLElement>('input,button,select')?.focus();
      const file =
        resume && this.globals.files.find((file) => file.id === resume.fileId);
      if (file) this.globals.player?.play(file, resume.position || 0);
    });
  }
  save(file: MediaFile) {
    if (this.saving.includes(file.id) || this.saved.includes(file.id)) return;
    this.saving = [...this.saving, file.id];
    const globals = this.globals;
    const body =
      globals.source === 'filmix'
        ? {
            source: 'filmix',
            id: globals.filmixId,
            fileId: file.id,
            voice: file.voice,
            quality: globals.filmixQuality,
          }
        : { source: 'torrent', hash: globals.hash, fileId: file.id };
    globals.api<DownloadItem>('downloads/save', body, (error) => {
      if (this.unmountSignal.aborted) return;
      runInAction(() => {
        this.saving = this.saving.filter((id) => id !== file.id);
        if (!error) this.saved = [...this.saved, file.id];
        globals.toast(
          error?.message ||
            'Видео добавлено в «Скачанное». Дождитесь завершения загрузки.',
        );
      });
    });
  }
  play(file: MediaFile) {
    this.globals.player?.selectFile(file);
  }
  back() {
    this.globals.returnToResults();
  }
}
