const { test, expect } = require('@playwright/test');
test.use({ baseURL: 'http://127.0.0.1:32200' });

test('save a video, play it without source API requests, continue from history and delete', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Скачанное', exact: true }).click();
  // The mock library belongs to the test server; remove leftovers from other tests.
  while (await page.getByRole('button', { name: 'Удалить', exact: true }).count()) {
    await page.getByRole('button', { name: 'Удалить', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Удалить', exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'На сервере', exact: true }).click();
  await page.locator('#content .torrent').first().click();
  await expect(page.locator('.save-video').first()).toBeVisible();
  const title = await page.locator('.file-card .torrent-title').first().innerText();
  await page.locator('.save-video').first().click();
  await expect(page.locator('.save-video').first()).toHaveAttribute('title', 'В скачанном');
  await expect(page.locator('.save-video').first()).toBeDisabled();
  await page.getByRole('button', { name: 'Скачанное', exact: true }).click();
  await expect(page.locator('.download-card')).toHaveCount(1);
  await expect(page.locator('.download-card')).toContainText(title.split('/').pop());
  await expect(page.locator('.download-card')).toContainText('Доступно без интернета');
  const sourceRequests = [];
  await page.route(/\/api\/(filmix\/play|preload|status|add)/, route => {
    sourceRequests.push(route.request().url()); return route.abort();
  });
  await page.getByRole('button', { name: 'Смотреть', exact: true }).click();
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(0.1);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(25);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await page.locator('#content .torrent').first().click();
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(25);
  await page.keyboard.press('Escape');
  expect(sourceRequests).toEqual([]);
  await page.getByRole('button', { name: 'Скачанное', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.locator('.download-card')).toHaveCount(0);
  await expect(page.getByText('Пока ничего не скачано')).toBeVisible();
});
