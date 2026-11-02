export interface SeekVideo {
  readyState: number;
  duration: number;
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  play(): Promise<void> | void;
}
export interface SeekOptions {
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  timeout?: number;
  debounce?: number;
  onPreview?(position: number): void;
  onStart?(position: number): void;
  onDone?(): void;
  onError?(message: string): void;
}
export function clamp(time: number, duration: number) {
  if (!isFinite(time) || !isFinite(duration) || duration <= 0) return null;
  return Math.max(0, Math.min(time, Math.max(0, duration - 1)));
}
export function pointerTime(
  x: number,
  left: number,
  width: number,
  duration: number,
) {
  if (!isFinite(x) || !isFinite(left) || !isFinite(width) || width <= 0)
    return null;
  return clamp(
    Math.max(0, Math.min(1, (x - left) / width)) * duration,
    duration,
  );
}
export function create(video: SeekVideo, options: SeekOptions = {}) {
  options = options || {};
  var later = options.setTimeout || setTimeout,
    cancelTimer = options.clearTimeout || clearTimeout;
  var desired: number | null = null,
    pending: ReturnType<typeof setTimeout> | null = null,
    deadline: ReturnType<typeof setTimeout> | null = null,
    busy = false,
    resume = false;
  function notify(
    name: 'onPreview' | 'onStart' | 'onDone' | 'onError',
    value?: number | string | null,
  ) {
    if (name === 'onDone') options.onDone?.();
    else if (name === 'onError') options.onError?.(String(value));
    else options[name]?.(Number(value));
  }
  function cancel() {
    cancelTimer(pending ?? undefined);
    cancelTimer(deadline ?? undefined);
    pending = null;
    deadline = null;
    desired = null;
    busy = false;
    resume = false;
  }
  function fail(message: string) {
    cancel();
    notify('onError', message);
  }
  function commit() {
    pending = null;
    busy = true;
    notify('onStart', desired);
    deadline = later(function () {
      fail(
        'Перемотка не завершилась за 45 секунд. Выберите другое место на полосе или нажмите BACK.',
      );
    }, options.timeout || 45000);
    try {
      video.currentTime = desired!;
    } catch (_) {
      fail('Этот файл не поддерживает перемотку в выбранное место.');
    }
  }
  function to(value: number) {
    if (!(video.readyState >= 1)) return false;
    var time = clamp(value, video.duration);
    if (time === null) return false;
    if (desired === null) resume = !video.paused;
    cancelTimer(pending ?? undefined);
    cancelTimer(deadline ?? undefined);
    deadline = null;
    desired = time;
    notify('onPreview', time);
    pending = later(commit, options.debounce == null ? 250 : options.debounce);
    return true;
  }
  function by(delta: number) {
    return to((desired === null ? video.currentTime : desired) + delta);
  }
  function update() {
    if (
      !busy ||
      pending !== null ||
      video.seeking ||
      video.readyState < 3 ||
      Math.abs(video.currentTime - desired!) > 3
    )
      return;
    var shouldResume = resume;
    cancel();
    notify('onDone');
    if (shouldResume && video.paused) {
      try {
        var p = video.play();
        if (p && p.catch)
          p.catch(function () {
            notify('onError', 'Нажмите OK, чтобы продолжить просмотр.');
          });
      } catch (_) {
        notify('onError', 'Нажмите OK, чтобы продолжить просмотр.');
      }
    }
  }
  return {
    to: to,
    by: by,
    update: update,
    cancel: cancel,
    target: function () {
      return desired;
    },
    isBusy: function () {
      return desired !== null;
    },
    pausedIntent: function (paused: boolean) {
      if (desired !== null) resume = !paused;
    },
  };
}
