const { test, expect } = require('@playwright/test');
test.use({ baseURL: 'http://127.0.0.1:32200' });

async function open(page) {
  await page.goto('/');
  await expect(page.locator('.home-intro')).toBeVisible();
}

test('home caches collections and restores the selected card and scroll after details', async ({ page }) => {
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/catalog/home') requests++; });
  await open(page);
  const card = page.locator('.home-section').last().locator('.poster-card').nth(5);
  await card.focus();
  const id = await card.getAttribute('data-catalog-id');
  const scroll = await page.locator('#main').evaluate(el => el.scrollTop);
  await page.keyboard.press('Enter');
  await expect(page.locator('.movie-details')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(`[data-catalog-id="${id}"]`).first()).toBeFocused();
  expect(await page.locator('#main').evaluate(el => el.scrollTop)).toBe(scroll);
  expect(requests).toBe(1);
});

test('search retries errors, sorts results and retains them after opening a torrent', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/search?**', route => {
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: 'Поиск недоступен' } });
    return route.fulfill({ json: { results: [
      { title: 'Большой файл', magnet: 'magnet:?xt=urn:btih:test', size: 2000, seeders: 20, tracker: 'Demo', quality: '1080p' },
      { title: 'Маленький файл', magnet: 'magnet:?xt=urn:btih:test', size: 1000, seeders: 10, tracker: 'Demo', quality: '720p' },
    ] } });
  });
  await open(page);await page.locator('#nav-search').click();
  await expect(page.locator('#query')).toBeFocused();
  await page.locator('#query').fill('Тест');await page.keyboard.press('Enter');
  await expect(page.locator('#search-results')).toContainText('Поиск недоступен');
  await page.getByRole('button', { name: 'Повторить поиск' }).click();
  await expect(page.locator('#search-results .torrent')).toHaveCount(2);
  await page.locator('#torrent-sort').selectOption('size');
  await expect(page.locator('#search-results .torrent').first()).toContainText('Маленький файл');
  await page.locator('#search-results .torrent').first().click();
  await expect(page.locator('.file-card')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('#query')).toHaveValue('Тест');
  await expect(page.locator('#search-results .torrent').first()).toContainText('Маленький файл');
  expect(attempts).toBe(2);
});

test('server torrents retries failures and ignores responses after leaving the screen', async ({ page }) => {
  let attempts = 0, pending;
  await page.route('**/api/torrents', route => {
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: 'TorrServer недоступен' } });
    if (attempts === 3) { pending = route; return; }
    return route.continue();
  });
  await open(page);await page.locator('[data-view="torrents"]').click();
  await expect(page.locator('.torrents-screen')).toContainText('Сервер недоступен');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('.torrents-screen .torrent')).toHaveCount(1);
  await page.locator('.torrents-screen .torrent').click();
  await expect(page.locator('.file-card')).toHaveCount(4);
  await page.locator('[data-view="torrents"]').click();
  await expect.poll(() => !!pending).toBe(true);
  await page.locator('[data-view="history"]').click();
  await expect(page.locator('.history-screen')).toContainText('История пока пуста');
  await pending.fulfill({ json: [{ hash: 'late', title: 'Поздний ответ', torrent_size: 0, stat_string: '' }] });
  await expect(page.locator('.history-screen')).toBeVisible();
  await expect(page.locator('#content')).not.toContainText('Поздний ответ');
});

test('history resumes saved entries and clearing history updates the home screen', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tw-history', JSON.stringify([{ source: 'filmix', filmixId: 1, hash: '', fileId: 10001,
      title: 'Сохранённая серия', fileName: 'Серия 1', torrentTitle: 'Сериал', link: 'filmix:1', position: 20, duration: 45, updated: Date.now() }]));
  });
  await open(page);
  await expect(page.locator('.continue-card')).toHaveCount(1);
  await page.locator('[data-view="history"]').click();
  await expect(page.locator('.history-screen .torrent')).toHaveCount(1);
  await page.getByRole('button', { name: 'Очистить историю' }).click();
  await expect(page.locator('.history-screen')).toContainText('История пока пуста');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tw-history')))).toEqual([]);
  await page.locator('#nav-home').click();
  await expect(page.locator('.continue-card')).toHaveCount(0);
});
