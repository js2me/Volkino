const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

test('seek step is validated, saved and restored in settings and the player hint', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const step = page.getByLabel('Шаг перемотки плеера (секунды)');
  await expect(step).toHaveValue('30');
  await step.fill('0');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('от 1 до 3600 секунд');
  await step.fill('15');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
  await page.reload();
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(step).toHaveValue('15');
  await page.locator('[data-view="torrents"]').click();
  await page.locator('#content .torrent').first().click();
  await page.locator('.file-card').first().click();
  await expect(page.locator('#player-seek-step')).toHaveText('15 сек');
});

test('timeline follows the media clock when webOS skips timeupdate events', async ({ page }) => {
  await page.goto('/');
  await page.locator('.poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  await page.locator('.file-card').first().click();
  const video = page.locator('#video');
  await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThan(1);
  await video.evaluate(v => {
    v.pause();
    v.addEventListener('timeupdate', event => event.stopImmediatePropagation(), true);
    Object.defineProperty(v, 'duration', { value: 2502 });
    Object.defineProperty(v, 'currentTime', { value: 153, configurable: true });
  });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#player-time')).toHaveText('2:33 / 41:42');
  await video.evaluate(v => Object.defineProperty(v, 'currentTime', { value: 900 }));
  await expect(page.locator('#player-time')).toHaveText('15:00 / 41:42');
  await expect(page.locator('#player-timeline')).toHaveAttribute('aria-valuenow', '900');
});
