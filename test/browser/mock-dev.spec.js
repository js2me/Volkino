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

test('changing the home source saves it and reloads cached selections', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-section')).toHaveCount(3);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const searchProvider = await page.locator('#search-provider').inputValue();
  await page.locator('#catalog-provider').selectOption('yts');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
  await expect(page.locator('#search-provider')).toHaveValue(searchProvider);
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.home-section')).toHaveCount(2);
  await expect(page.locator('.catalog-source')).toContainText('YTS');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#catalog-provider')).toHaveValue('yts');
  await page.locator('#catalog-provider').selectOption('vilkadb');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/config') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  expect((await (await saved).json()).catalogProvider).toBe('vilkadb');
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
});

test('saved watch states are visible in the file list and episode picker', async ({ page }) => {
  await page.addInitScript(() => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const entries = [95, 42].map((position, index) => ({
      hash, fileId: index + 1, title: 'Серия ' + (index + 1),
      link: 'magnet:?xt=urn:btih:' + hash, position, duration: 100,
    }));
    localStorage.setItem('tw-history', JSON.stringify(entries));
  });
  await page.goto('/');
  await page.locator('.poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  const labels = ['✓ Просмотрено', 'В процессе · 42%', 'Не смотрели', 'Не смотрели'];
  await expect(page.locator('.file-watch-status')).toHaveText(labels);
  await page.locator('.file-card').last().click();
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(0.1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.episode-watch-status')).toHaveText([...labels.slice(0, 3), /В процессе/]);
  await expect(page.locator('.episode-card[aria-current="true"]')).toContainText('Сейчас смотрите');
});

test('the episode strip reveals the entire focused card at either end', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.locator('.poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  await page.locator('.file-card').last().click();
  await expect(page.locator('#player')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  const cards = page.locator('.episode-card');
  async function expectVisibleCard(index) {
    const card = cards.nth(index);
    await expect(card).toBeFocused();
    await expect.poll(() => card.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const strip = el.parentElement.getBoundingClientRect();
      return bounds.left >= strip.left + 3 && bounds.right <= strip.right - 3;
    })).toBe(true);
  }
  await expectVisibleCard(3);
  await expect.poll(() => page.locator('#episode-list').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  for (let index = 2; index >= 0; index--) {
    await page.keyboard.press('ArrowLeft');
    await expectVisibleCard(index);
  }
  for (let index = 1; index <= 3; index++) {
    await page.keyboard.press('ArrowRight');
    await expectVisibleCard(index);
  }
});
