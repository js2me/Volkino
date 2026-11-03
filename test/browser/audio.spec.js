const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

// Each page owns its preference, so parallel dev tests never change each other's audio mode.
async function config(page, initial = 'off') {
  let mode = initial, data;
  await page.route('**/api/config', async route => {
    if (route.request().method() === 'POST') {
      const update = route.request().postDataJSON();
      mode = update.audioFix || mode;
      data = { ...data, ...update };
    } else data = await (await route.fetch()).json();
    await route.fulfill({ json: { ...data, audioFix: mode } });
  });
  return () => mode;
}

async function play(page) {
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.locator('.home-section .poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  await page.locator('.file-card').first().click();
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
}

test('real DSP reduces the loud/quiet gap; night is stronger and peaks have headroom', async ({ page }) => {
  await page.goto('/');
  const levels = await page.evaluate(async () => {
    const { buildAudioGraph } = await import('/src/app/audio/graph.ts');
    const result = {};
    for (const mode of ['off', 'moderate', 'night']) {
      const rate = 48000, context = new OfflineAudioContext(2, 4 * rate, rate);
      const buffer = context.createBuffer(1, 4 * rate, rate), input = buffer.getChannelData(0);
      for (let i = 0; i < input.length; i++) input[i] = (i < 2 * rate ? .012 : .75) * Math.sin(2 * Math.PI * 440 * i / rate);
      const source = context.createBufferSource(); source.buffer = buffer;
      source.connect(mode === 'off' ? context.destination : buildAudioGraph(context, mode).input);
      source.start();
      const output = (await context.startRendering()).getChannelData(0);
      const rms = (from, to) => {
        let power = 0;
        for (let i = from * rate; i < to * rate; i++) power += output[i] ** 2;
        return Math.sqrt(power / ((to - from) * rate));
      };
      let peak = 0;
      for (const sample of output) peak = Math.max(peak, Math.abs(sample));
      result[mode] = { quiet: rms(.5, 1.5), loud: rms(2.5, 3.5), peak };
    }
    return result;
  });
  expect(levels.moderate.quiet).toBeGreaterThan(levels.off.quiet);
  expect(levels.moderate.loud).toBeLessThan(levels.off.loud);
  expect(levels.night.quiet).toBeGreaterThan(levels.moderate.quiet);
  expect(levels.night.loud).toBeLessThan(levels.moderate.loud);
  expect(levels.night.loud / levels.night.quiet).toBeLessThan(levels.moderate.loud / levels.moderate.quiet);
  expect(levels.moderate.loud / levels.moderate.quiet).toBeLessThan(levels.off.loud / levels.off.quiet / 2);
  expect(levels.moderate.peak).toBeLessThan(.74);
  expect(levels.night.peak).toBeLessThan(.74);
});

test('preference saves via remote, survives reload and audio contexts close on episode switch and exit', async ({ page }) => {
  const mode = await config(page);
  await page.addInitScript(() => {
    window.audioContexts = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.audioContexts.push(this); }
    };
  });
  await page.goto('/');
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#audio-fix')).toHaveValue('off');
  await page.locator('#audio-fix').focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
  expect(mode()).toBe('night');
  await page.reload();
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#audio-fix')).toHaveValue('night');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await play(page);
  await expect(page.locator('#audio-mode-status')).toHaveText('Автофикс звука: Ночной');
  await page.keyboard.press('ArrowDown'); await page.locator('.episode-card').nth(1).click();
  await expect(page.locator('#playing-title')).toHaveText('Серия 2.mp4');
  await expect.poll(() => page.evaluate(() => window.audioContexts.map(context => context.state))).toEqual(['closed', 'running']);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.audioContexts.map(context => context.state))).toEqual(['closed', 'closed']);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#audio-fix').selectOption('off');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await play(page);
  await expect(page.locator('#audio-mode-status')).toBeEmpty();
  expect(await page.evaluate(() => window.audioContexts.length)).toBe(2);
});

test('Filmix playback uses the same audio processor', async ({ page }) => {
  await config(page, 'moderate');
  await page.goto('/');
  await page.locator('.home-section .poster-card').first().click();
  await page.getByRole('button', { name: 'Смотреть через Filmix', exact: true }).click();
  await page.locator('.torrent').first().click();
  await page.locator('.file-card').first().click();
  await expect(page.locator('#audio-mode-status')).toHaveText('Автофикс звука: Умеренный');
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#player')).toBeHidden();
});

test('player menu changes audio fix for the current video and keeps playback state', async ({ page }) => {
  const mode = await config(page);
  await page.goto('/');
  await play(page);
  await page.keyboard.press('ArrowUp');
  const button = page.locator('#player-audio-fix');
  await expect(button).toHaveText('Автофикс звука: Выключен');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Автофикс звука: Умеренный');
  await expect(page.locator('#audio-mode-status')).toHaveText('Автофикс звука: Умеренный');
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(.5);
  await page.locator('#video').evaluate(video => video.pause());
  const position = await page.locator('#video').evaluate(video => video.currentTime);
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Автофикс звука: Ночной');
  await expect(page.locator('#audio-mode-status')).toHaveText('Автофикс звука: Ночной');
  await expect.poll(() => page.locator('#video').evaluate(video => video.readyState)).toBeGreaterThan(0);
  expect(await page.locator('#video').evaluate(video => video.paused)).toBe(true);
  expect(await page.locator('#video').evaluate(video => video.currentTime)).toBeCloseTo(position, 1);
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Автофикс звука: Выключен');
  await expect.poll(() => page.locator('#video').evaluate(video => video.readyState)).toBeGreaterThan(0);
  expect(await page.locator('#video').evaluate(video => video.paused)).toBe(true);
  expect(await page.locator('#video').evaluate(video => video.currentTime)).toBeCloseTo(position, 1);
  expect(mode()).toBe('off');
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Автофикс звука: Умеренный');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.locator('.episode-card').nth(1).click();
  await page.keyboard.press('ArrowUp');
  await expect(button).toHaveText('Автофикс звука: Выключен');
});

for (const failure of ['source', 'silent', 'resume', 'analyser', 'unavailable']) {
  test(`audio ${failure} falls back to native playback instead of leaving a silent Web Audio element`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await config(page, 'night');
    await page.addInitScript(failure => {
      if (failure === 'unavailable') { delete window.AudioContext; return; }
      if (failure === 'resume') {
        const Original = window.AudioContext;
        window.AudioContext = class extends Original { resume() { throw new Error('Audio context blocked'); } };
        return;
      }
      if (failure === 'analyser') {
        AnalyserNode.prototype.getFloatTimeDomainData = function () { throw new Error('Unavailable audio samples'); };
        return;
      }
      if (failure === 'source') {
        const Original = window.AudioContext;
        window.AudioContext = class extends Original {
          createMediaElementSource(video) { super.createMediaElementSource(video); throw new Error('Unsupported native decoder'); }
        };
      } else {
        AnalyserNode.prototype.getFloatTimeDomainData = function (samples) { samples.fill(0); };
        const interval = window.setInterval.bind(window);
        window.setInterval = (fn, delay, ...args) => interval(fn, delay === 250 ? 10 : delay, ...args);
      }
    }, failure);
    await page.goto('/');
    await page.evaluate(() => { window.originalVideo = document.getElementById('video'); });
    await play(page);
    await expect(page.locator('#audio-mode-status')).toContainText('Оригинальный звук');
    if (failure === 'unavailable') {
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#player-audio-fix')).toBeDisabled();
      await page.keyboard.press('Escape');
    }
    if (['source', 'silent', 'analyser'].includes(failure)) expect(await page.evaluate(() => document.getElementById('video') !== window.originalVideo)).toBe(true);
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(.5);
    await page.keyboard.press('Escape');
    await expect(page.locator('#player')).toBeHidden();
    if (failure === 'unavailable') {
      await page.getByRole('button', { name: 'Настройки', exact: true }).click();
      await expect(page.locator('#audio-fix')).toHaveValue('off');
      await expect(page.locator('#audio-fix option[value="night"]')).toBeDisabled();
      await expect(page.locator('.audio-settings')).toContainText('обработка недоступна');
    }
    expect(errors).toEqual([]);
  });
}
