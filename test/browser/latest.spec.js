const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200', viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Array.prototype.at; });
});

async function open(page, query = '') {
  await page.goto('/' + query);
  await expect(page.locator('.home-intro')).toBeVisible();
  await page.getByRole('button', { name: 'Последние добавления', exact: true }).click();
}

test('latest is Filmix-only, shows films and series and refreshes upstream', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(page.locator('.latest-row')).toHaveCount(50);
  await expect(page.locator('.latest-note')).toContainText('Filmix');
  await expect(page.locator('.latest-note')).toContainText('Новые серии');
  await expect(page.locator('.latest-row').first()).toContainText('Фильм');
  await expect(page.locator('.latest-row').nth(1)).toContainText('Сезон 1, серия 8');
  await expect(page.locator('.latest-date').first()).not.toBeEmpty();
  await expect(page.locator('.latest-screen select')).toHaveCount(0);
  await expect(page.locator('.latest-screen')).not.toContainText('VilkaDB');
  const refresh = page.waitForRequest(request => request.url().includes('/api/latest?') && request.url().includes('refresh=1'));
  await page.getByRole('button', { name: 'Обновить список', exact: true }).click();
  await refresh;
  await expect(page.locator('.latest-row')).toHaveCount(50);
  await page.getByRole('button', { name: 'Каталог', exact: true }).click();
  await page.locator('.poster-card').first().click();
  await expect(page.getByRole('button', { name: 'В каталог', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Filmix latest appends on scroll, opens playback files directly and restores selection on BACK', async ({ page }) => {
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/api/latest?')) requests++; });
  await open(page);
  await expect(page.locator('.latest-row')).toHaveCount(50);
  await page.locator('.latest-list').evaluate(list => { list.scrollTop = list.scrollHeight; });
  await expect(page.locator('.latest-row')).toHaveCount(100);
  const selected = page.locator('.latest-row').nth(60);
  await selected.focus();const id = await selected.getAttribute('data-latest-id');
  await page.keyboard.press('Enter');
  await expect(page.locator('#filmix-voice')).toBeVisible();
  await expect(page.locator('.file-card').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(`[data-latest-id="${id}"]`)).toBeFocused();
  await expect(page.locator('.latest-row')).toHaveCount(100);
  expect(requests).toBe(2);
});

test('late Filmix results cannot overwrite another screen; empty and failed feeds are explicit', async ({ page }) => {
  let pending;
  await page.route('**/api/latest?**', route => { pending = route; });
  await open(page);
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.home-intro')).toBeVisible();
  await pending.fulfill({ json: { source: 'filmix', items: [], page: 1, hasMore: false, note: 'Late Filmix', updatedAt: Date.now() } });
  await expect(page.locator('#latest-results')).toHaveCount(0);
  await expect(page.locator('.home-intro')).toBeVisible();
  await page.unroute('**/api/latest?**');
  await open(page, '?mock=empty');
  await expect(page.locator('#latest-results')).toContainText('пока нет добавлений');
  await page.goto('/?mock=error');
  await expect(page.locator('#content')).toContainText('Подборки временно недоступны');
  await page.getByRole('button', { name: 'Последние добавления', exact: true }).click();
  await expect(page.locator('#latest-results .error-text')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
});

test('renews a stale helper session and retries the feed after a helper restart', async ({ page }) => {
  let sessions = 0, feeds = 0;
  await page.route('**/api/session', route => route.fulfill({ json: { token: ++sessions === 1 ? 'old-session' : 'new-session' } }));
  await page.route('**/api/latest?*', route => {
    feeds++;
    if (route.request().headers()['x-app-token'] !== 'new-session') {
      return route.fulfill({ status: 403, json: { error: 'Обновите приложение' } });
    }
    return route.fulfill({ json: { source: 'filmix', items: [{ id: 'filmix:1', filmixId: 1, title: 'После перезапуска', type: 'movie', source: 'filmix' }], page: 1, hasMore: false, note: 'Filmix', updatedAt: Date.now() } });
  });
  await open(page);
  await expect(page.locator('.latest-row')).toHaveCount(1);
  await expect(page.locator('.latest-row')).toContainText('После перезапуска');
  expect(sessions).toBe(2);
  expect(feeds).toBe(2);
});

test('session recovery stops after one retry when the server still rejects the token', async ({ page }) => {
  let sessions = 0, feeds = 0;
  await page.route('**/api/session', route => { sessions++; return route.fulfill({ json: { token: 'rejected-session' } }); });
  await page.route('**/api/latest?*', route => {
    feeds++;
    return route.fulfill({ status: 403, json: { code: 'SESSION_EXPIRED', error: 'Сессия устарела' } });
  });
  await open(page);
  await expect(page.locator('#latest-results')).toContainText('Сессия устарела');
  expect(sessions).toBe(2);
  expect(feeds).toBe(2);
});

test('compact feed changes the preview with remote focus and scrolls independently', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await expect(page.locator('#page-title')).toHaveCount(1);
  expect((await page.locator('.screen-header').boundingBox()).height).toBeLessThanOrEqual(56);
  await expect(page.locator('.latest-preview h2')).toHaveText('За горизонтом');
  await expect(page.locator('.latest-description')).not.toBeEmpty();
  await expect(page.locator('.latest-ratings')).toContainText('IMDb 7.8');
  await expect(page.locator('.latest-preview img')).toBeVisible();
  const preview = await page.locator('.latest-preview').boundingBox();
  const rows = page.locator('.latest-row');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await expect(page.locator('.latest-preview h2')).toContainText('(сериал)');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
  await expect(rows.nth(11)).toBeFocused();
  expect(await page.locator('.latest-list').evaluate(list => list.scrollTop)).toBeGreaterThan(0);
  expect((await page.locator('.latest-preview').boundingBox()).y).toBe(preview.y);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#nav-latest')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(rows.nth(11)).toBeFocused();
  await page.locator('#nav-home').click();
  await expect(page.locator('#screen-header-tools button')).toHaveCount(0);
});

test('a late description cannot replace the currently selected title', async ({ page }) => {
  let first;
  await page.route('**/api/filmix/details?id=1', route => { first = route; });
  await open(page);
  await expect.poll(() => !!first).toBe(true);
  await page.locator('.latest-row').nth(1).focus();
  await expect(page.locator('.latest-preview h2')).toHaveText('За горизонтом (сериал)');
  await expect(page.locator('.latest-description')).toBeVisible();
  await first.fulfill({ json: { id: 1, title: 'Устаревший ответ', description: 'Устаревшее описание', genres: [], countries: [], actors: [], directors: [] } });
  await expect(page.locator('.latest-preview')).not.toContainText('Устаревший');
});

test('prefetches three titles ahead and shows cached details immediately on focus', async ({ page }) => {
  const requests = new Map();
  await page.route('**/api/filmix/details?*', async route => {
    const id = Number(new URL(route.request().url()).searchParams.get('id'));
    requests.set(id, (requests.get(id) || 0) + 1);
    await route.continue();
  });
  await open(page);
  // Night Express is two rows ahead of the initial film; it loads before selection.
  await expect.poll(() => requests.get(2) || 0).toBe(1);
  await expect.poll(() => requests.size).toBe(4);
  await expect(page.locator('.latest-preview h2')).toHaveText('За горизонтом');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some(entry => entry.name.includes('/api/filmix/details?id=2') && entry.responseEnd > 0))).toBe(true);
  const instant = await page.locator('.latest-row').nth(2).evaluate(row => {
    row.focus();
    return { title: document.querySelector('.latest-preview h2').textContent,
      loading: document.querySelector('.latest-preview').getAttribute('aria-busy'),
      description: document.querySelector('.latest-description')?.textContent };
  });
  expect(instant.title).toBe('Ночной экспресс');
  expect(instant.loading).toBe('false');
  expect(instant.description).toBeTruthy();
  expect(requests.get(2)).toBe(1);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some(entry => entry.name.includes('/mock/poster/movie-2.svg')))).toBe(true);
});

test('limits prefetch concurrency, joins an in-flight request and stops queued work on exit', async ({ page }) => {
  const pending = [], requested = [];
  await page.route('**/api/filmix/details?*', route => {
    requested.push(Number(new URL(route.request().url()).searchParams.get('id')));
    pending.push(route);
  });
  await open(page);
  await expect.poll(() => pending.length).toBe(2);
  expect(requested).toEqual([1, 101]);
  // Both request slots are held; selecting the series must join its prefetch.
  await page.locator('.latest-row').nth(1).focus();
  await expect(page.locator('.latest-preview h2')).toHaveText('За горизонтом (сериал)');
  await pending[1].fulfill({ json: { id: 101, title: 'Готовый сериал', description: 'Предзагрузка без дубликата',
    genres: [], countries: [], actors: [], directors: [] } });
  await expect(page.locator('.latest-description')).toHaveText('Предзагрузка без дубликата');
  expect(requested.filter(id => id === 101)).toHaveLength(1);
  await page.locator('#nav-home').click();
  const total = requested.length;
  for (const route of pending.filter(route => route !== pending[1])) {
    await route.fulfill({ json: { id: 1, title: 'Поздний ответ', genres: [], countries: [], actors: [], directors: [] } });
  }
  await expect(page.locator('.home-intro')).toBeVisible();
  await expect(page.locator('#content')).not.toContainText('Поздний ответ');
  expect(requested).toHaveLength(total);
});

test('a failed prefetch stays silent and retries when the title is selected', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/filmix/details?id=2', route => {
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: 'Temporary outage' } });
    return route.continue();
  });
  await open(page);
  await expect.poll(() => attempts).toBe(1);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some(entry => entry.name.includes('/api/filmix/details?id=2') && entry.responseEnd > 0))).toBe(true);
  await expect(page.locator('.latest-description')).toBeVisible();
  await expect(page.locator('.latest-preview')).not.toContainText('недоступно');
  await page.locator('.latest-row').nth(2).focus();
  await expect(page.locator('.latest-preview h2')).toHaveText('Ночной экспресс');
  await expect(page.locator('.latest-description')).toBeVisible();
  expect(attempts).toBe(2);
});
