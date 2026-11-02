const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

test('local dev runs offline: home, catalog, torrents, video, episodes and history', async ({ page, request }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => { if (new URL(req.url()).hostname !== '127.0.0.1') external.push(req.url()); });
  await page.goto('/');
  await expect(page.locator('.home-section')).toHaveCount(3);
  await expect(page.locator('.poster-card')).toHaveCount(36);
  await expect.poll(() => page.locator('.poster-art img').first().evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Каталог', exact: true }).click();
  await expect(page.locator('#catalog-results .poster-card')).toHaveCount(36);
  await page.locator('#main').evaluate(main => { main.scrollTop = main.scrollHeight; });
  await expect(page.locator('#catalog-results .poster-card')).toHaveCount(72);
  await page.locator('.poster-card').first().click();
  await expect(page.locator('.movie-description')).toContainText('Демонстрационная история');
  await expect(page.locator('.detail-torrents .torrent')).toHaveCount(3);
  await page.locator('.detail-torrents .torrent').first().click();
  await expect(page.locator('.file-card')).toHaveCount(4);

  const range = await request.get('/stream', { headers: { Range: 'bytes=0-31' } });
  expect(range.status()).toBe(206);
  expect(range.headers()['content-type']).toBe('video/mp4');
  expect((await range.body()).length).toBe(32);
  await page.locator('.file-card').first().click();
  await expect(page.locator('#player')).toBeVisible();
  await expect.poll(() => page.locator('#video').evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(0.1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.episode-card')).toHaveCount(4);
  await page.locator('.episode-card').nth(1).click();
  await expect(page.locator('#playing-title')).toHaveText('Серия 2.mp4');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await expect(page.locator('#content .torrent')).toHaveCount(2);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('mock Filmix has series, voices and seasons; settings stay in memory', async ({ page }) => {
  await page.goto('/');
  await page.locator('.home-section').last().locator('.poster-card').first().click();
  await page.getByRole('button', { name: 'Смотреть через Filmix', exact: true }).click();
  await page.locator('.torrent').filter({ hasText: '(сериал)' }).first().click();
  await expect(page.locator('#filmix-season option')).toHaveCount(2);
  await expect(page.locator('#filmix-voice option')).toHaveCount(2);
  await page.locator('#filmix-season').selectOption('2');
  await page.locator('#filmix-voice').selectOption('Оригинал');
  await expect(page.locator('.file-card')).toHaveCount(4);
  await expect(page.locator('.file-card').first()).toContainText('Сезон 2/Серия 1');
  await page.locator('.file-card').first().click();
  await expect.poll(() => page.locator('#video').evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#ts-url').fill('http://demo-only:8090');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
  await page.reload();
  await expect(page.locator('.home-section').first()).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#ts-url')).toHaveValue('http://demo-only:8090');
  await page.locator('#filmix-transport').selectOption('mobile');
  await expect(page.locator('#filmix-transport')).toHaveValue('mobile');
  await expect(page.locator('#filmix-api')).toBeVisible();
  await page.getByRole('button', { name: 'Получить код Filmix', exact: true }).click();
  await expect(page.locator('#filmix-status')).toContainText('DEMO-1234');
  await page.getByRole('button', { name: 'Я ввёл код', exact: true }).click();
  await expect(page.locator('#filmix-status')).toContainText('Demo · PRO');
});

test('mock scenarios show empty, failed and loading states without editing code', async ({ page }) => {
  await page.goto('/?mock=empty');
  await expect(page.locator('.home-intro')).toBeVisible();
  await page.getByRole('button', { name: 'Каталог', exact: true }).click();
  await expect(page.locator('#catalog-results')).toContainText('По этим фильтрам ничего не найдено');
  await page.goto('/?mock=error');
  await expect(page.locator('#content')).toContainText('Подборки временно недоступны');
  await page.getByRole('button', { name: 'Каталог', exact: true }).click();
  await expect(page.locator('.error-text')).toContainText('Демонстрационная ошибка');
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
  await page.goto('/?mock=slow');
  await expect(page.locator('.home-section').first()).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Каталог', exact: true }).click();
  await expect(page.locator('#catalog-results')).toContainText('Загружаем каталог…');
  await expect(page.locator('#catalog-results .poster-card')).toHaveCount(36);
});
