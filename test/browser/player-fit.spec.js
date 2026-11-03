const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

test('image zoom enlarges the video without moving the controls or stopping playback', async ({ page }) => {
  await page.goto('/');
  await page.locator('.poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  await page.locator('.file-card').first().click();
  const video = page.locator('#video');
  await expect.poll(() => video.evaluate(element => element.videoWidth)).toBeGreaterThan(0);
  await page.keyboard.press('ArrowUp');
  const button = page.locator('#player-fit');
  const originalVideo = await video.boundingBox();
  const originalControls = await page.locator('#player-controls').boundingBox();
  await button.click();
  await button.click();
  await button.click();
  await expect(button).toContainText('Увеличить на 33%');
  const zoomedVideo = await video.boundingBox();
  expect(zoomedVideo.width / originalVideo.width).toBeCloseTo(1.33, 2);
  expect(zoomedVideo.height / originalVideo.height).toBeCloseTo(1.33, 2);
  expect(await page.locator('#player-controls').boundingBox()).toEqual(originalControls);
  expect(await video.evaluate(element => element.paused)).toBe(false);
  await button.click();
  await expect(button).toContainText('Исходные пропорции');
  expect((await video.boundingBox()).width).toBeCloseTo(originalVideo.width, 2);
});
