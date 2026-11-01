const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200', hasTouch: true });

for (const viewport of [{ width: 1280, height: 800 }, { width: 800, height: 1280 }]) {
  test(`tablet ${viewport.width}×${viewport.height}: touch navigation, playback and episodes`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.home-section').first()).toBeVisible();
    await page.locator('#nav-catalog').tap();
    await expect(page.locator('#catalog-results .poster-card')).toHaveCount(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const settings = page.getByRole('button', { name: 'Настройки', exact: true });
    await settings.tap();
    await expect(page.locator('#ts-url')).toBeVisible();
    await page.locator('#nav-home').tap();
    await page.locator('.poster-card').first().tap();
    await page.locator('.detail-torrents .torrent').first().tap();
    await page.locator('.file-card').first().tap();
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(0.1);
    if (!await page.locator('#touch-pause').isVisible()) await page.locator('#video').tap({ position: { x: 5, y: Math.round(viewport.height / 2) } });
    await page.locator('#touch-pause').tap();
    await expect.poll(() => page.locator('#video').evaluate(video => video.paused)).toBe(true);
    await page.locator('#touch-pause').tap();
    await expect.poll(() => page.locator('#video').evaluate(video => video.paused)).toBe(false);
    await page.locator('#touch-forward').tap();
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(25);
    await page.locator('#touch-episodes').tap();
    await expect(page.locator('.episode-card')).toHaveCount(4);
    await page.locator('.episode-card').nth(1).tap();
    await expect(page.locator('#playing-title')).toHaveText('Серия 2.mp4');
    await page.locator('#touch-exit').tap();
    await expect(page.locator('#player')).toBeHidden();
    await page.getByRole('button', { name: 'История', exact: true }).tap();
    await expect(page.locator('#content .torrent')).toHaveCount(2);
  });
}

test('Android remote bridge activates once, closes picker with Back and returns home before exit', async ({ page }) => {
  await page.goto('/');
    await expect(page.locator('.home-section').first()).toBeVisible();
  await page.locator('#nav-catalog').focus();
  await page.evaluate(() => { window.TWAndroidKey(13, true, false); window.TWAndroidKey(13, true, true); window.TWAndroidKey(13, false, false); });
  await expect(page.locator('#catalog-results .poster-card')).toHaveCount(36);
  await page.locator('#catalog-type').click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  expect(await page.evaluate(() => window.TWAndroidBack())).toBe(true);
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  expect(await page.evaluate(() => window.TWAndroidBack())).toBe(true);
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.locator('#nav-home').focus();
  expect(await page.evaluate(() => window.TWAndroidBack())).toBe(false);
});

test('touch dragging the timeline seeks on release and captures movement outside the track', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.locator('[data-view="torrents"]').tap();
  await page.locator('#content .torrent').first().tap();
  await page.locator('.file-card').first().tap();
  await expect.poll(() => page.locator('#video').evaluate(v => v.readyState)).toBeGreaterThan(2);
  await page.locator('#touch-pause').tap();
  const bar = await page.locator('#player-timeline').boundingBox();
  const duration = await page.locator('#video').evaluate(v => v.duration);
  const client = await page.context().newCDPSession(page);
  const point = fraction => ({ x: bar.x + bar.width * fraction, y: bar.y + bar.height / 2 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.1)] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.5)] });
  await expect.poll(() => page.locator('#player-timeline').getAttribute('aria-valuenow')).toBe(String(Math.floor(duration * .5)));
  expect(await page.locator('#video').evaluate(v => v.currentTime)).toBeLessThan(duration * .1);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#video').evaluate(v => Math.abs(v.currentTime - v.duration * .5))).toBeLessThan(1);
  expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.5)] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bar.x + bar.width + 10, y: bar.y - 50 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThan(duration - 2);
});


test('taps on video toggle controls while playing and paused; control taps keep the panel visible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.locator('[data-view="torrents"]').tap();
  await page.locator('#content .torrent').first().tap();
  await page.locator('.file-card').first().tap();
  await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const video = page.locator('#video'), controls = page.locator('#player-controls');
  const tapVideo = () => video.tap({ position: { x: 640, y: 400 } });
  if (!await controls.isVisible()) await tapVideo();
  await tapVideo(); await expect(controls).toBeHidden();
  await tapVideo(); await expect(controls).toBeVisible();
  await page.locator('#touch-pause').tap();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  await expect(controls).toBeVisible();
  await tapVideo(); await expect(controls).toBeHidden();
  await tapVideo(); await expect(controls).toBeVisible();
  expect(await video.evaluate(v => v.paused)).toBe(true);
});
