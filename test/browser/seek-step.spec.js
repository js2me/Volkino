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
