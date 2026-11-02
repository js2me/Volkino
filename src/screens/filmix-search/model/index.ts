import { action, makeObservable, observable, runInAction } from 'mobx';
import type { ViewModelParams } from 'mobx-view-model';
import { VM } from '../../../shared/lib/mobx';
import type { FilmixResult } from '../../../app/services/types';

export class FilmixSearchVM extends VM {
  readonly query: string;
  results: FilmixResult[];
  loading = false;
  error = '';
  private request = 0;
  constructor(params: ViewModelParams) {
    super(params);
    this.query = this.globals.filmixQuery;
    this.results = this.globals.filmixResults || [];
    makeObservable(this, {
      results: observable.ref,
      loading: observable,
      error: observable,
      load: action.bound,
      open: action.bound,
      back: action.bound,
    });
  }
  protected didMount() {
    if (this.globals.filmixResults === null && this.query.length >= 2)
      this.load();
    else this.focusFirst();
  }
  load() {
    const request = ++this.request;
    this.results = [];
    this.loading = true;
    this.error = '';
    this.globals.api<{ results: FilmixResult[] }>(
      'filmix/search?q=' + encodeURIComponent(this.query),
      null,
      (error, data) => {
        if (this.unmountSignal.aborted || request !== this.request) return;
        runInAction(() => {
          this.loading = false;
          this.error = error?.message || '';
          this.results = error ? [] : data.results;
          if (!error) this.globals.filmixResults = this.results;
        });
        this.focusFirst();
      },
    );
  }
  private focusFirst() {
    this.afterRender((root) =>
      root.querySelector<HTMLButtonElement>('button')?.focus(),
    );
  }
  open(item: FilmixResult) {
    this.globals.openFilmix(item.id, item.title);
  }
  back() {
    this.globals.leaveFilmix();
  }
}
