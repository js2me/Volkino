const { test, expect } = require('@playwright/test');
const catalogSources = require('../../server/catalog-browse').definitions();

const genres = { movie: [{ id: '28', name: 'Боевик' }], tv: [{ id: '10765', name: 'Фантастика' }] };
const items = Array.from({ length: 36 }, (_, i) => ({ id: 'tmdb:movie:' + (i + 1), title: 'Фильм ' + (i + 1), type: 'movie', year: '2026', rating: '8.5' }));
function browse(url) {
  const query = new URL(url).searchParams;
  return {
    filters: { type: query.get('type'), genre: query.get('genre'), minRating: Number(query.get('minRating')), year: query.get('year'), sort: query.get('sort'), page: Number(query.get('page')) },
    items: items.map(item => ({ ...item, id: query.get('page') === '1' ? item.id : item.id + ':page' + query.get('page') })), genres, hasMore: query.get('page') === '1', updatedAt: Date.now(),
  };
}

test.beforeEach(async ({ page }) => {
  // Match the TV browser, which predates Array.prototype.at.
  await page.addInitScript(() => { delete Array.prototype.at; });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname === '/api/session') data = { token: 'browser-test' };
    else if (url.pathname === '/api/config') data = {catalogBrowseProvider:'vilkadb'};
    else if (url.pathname === '/api/catalog/sources') data = {sources:catalogSources};
    else if (url.pathname === '/api/catalog/home') data = { sections: [], updatedAt: Date.now() };
    else if (url.pathname === '/api/catalog/browse') data = browse(url);
    else if (url.pathname === '/api/catalog/item') data = { ...items[0], id: url.searchParams.get('key'), description: 'Описание фильма' };
    else if (url.pathname === '/api/search') data = { results: [] };
    else return route.fulfill({ status: 404, json: { error: 'Unexpected API: ' + url.pathname } });
    return route.fulfill({ json: data });
  });
});

async function openCatalog(page) {
  await page.goto('/');
  await expect(page.locator('#shell')).toHaveCSS('display', 'flex');
  await expect(page.locator('#content')).toContainText('Поиск по названию');
  await page.locator('#nav-catalog').click();
  await expect(page.locator('.poster-card')).toHaveCount(36);
}

test('MobX updates filters, applies on OK, resets type-specific genre and appends on scroll', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openCatalog(page);
  await page.locator('#catalog-genre').selectOption('28');
  await page.locator('#catalog-type').selectOption('tv');
  await expect(page.locator('#catalog-genre')).toHaveValue('');
  await expect(page.locator('#catalog-genre option')).toHaveText(['Все жанры', 'Фантастика']);
  await page.locator('#catalog-genre').selectOption('10765');
  await page.locator('#catalog-rating').selectOption('7');
  await page.locator('#catalog-year').selectOption('2024');
  await page.locator('#catalog-sort').selectOption('rating');
  // Draft filters do not affect the displayed page until the form is submitted.
  await expect(page.locator('.catalog-summary')).toContainText('Фильмы · Все жанры');
  const request = page.waitForRequest(r => r.url().includes('/catalog/browse?') && new URL(r.url()).searchParams.get('type') === 'tv');
  await page.locator('#catalog-apply').focus();
  await page.keyboard.press('Enter');
  const query = new URL((await request).url()).searchParams;
  expect(Object.fromEntries(query)).toEqual({ provider:'vilkadb', type: 'tv', genre: '10765', minRating: '7', year: '2024', sort: 'rating', page: '1' });
  await expect(page.locator('.catalog-summary')).toContainText('Сериалы · Фантастика · рейтинг от 7 · 2024 · По рейтингу');
  await expect(page.locator('.poster-card').first()).toBeFocused();
  await page.locator('#main').evaluate(main => { main.scrollTop = main.scrollHeight; });
  await expect(page.locator('.poster-card')).toHaveCount(72);
  await expect(page.locator('#catalog-year')).toHaveValue('2024');
  await expect(page.locator('#catalog-genre')).toHaveValue('10765');
  await expect(page.locator('.infinite-scroll-status')).toContainText('Всё загружено');
  await expect(page.locator('.catalog-pagination')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('BACK restores the cached page, selected card and scroll; arrows move remote focus', async ({ page }) => {
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/catalog/browse?')) requests++; });
  await openCatalog(page);
  const selected = page.locator('[data-catalog-id="tmdb:movie:30"]');
  await selected.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-catalog-id="tmdb:movie:31"]')).toBeFocused();
  await selected.focus();
  const scroll = await page.locator('#main').evaluate(main => main.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.movie-details')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(selected).toBeFocused();
  expect(await page.locator('#main').evaluate(main => main.scrollTop)).toBe(scroll);
  expect(requests).toBe(2);
});

test('failed requests can retry; an unmounted or superseded request cannot overwrite the screen', async ({ page }) => {
  const pending = [];
  await page.route('**/api/catalog/browse?**', route => { pending.push(route); });
  await page.goto('/');
  await expect(page.locator('#content')).toContainText('Поиск по названию');
  await page.locator('#nav-catalog').click();
  await expect.poll(() => pending.length).toBe(1);
  await pending.shift().fulfill({ status: 503, json: { error: 'Каталог недоступен' } });
  await expect(page.locator('.error-text')).toHaveText('Каталог недоступен');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  const old = pending.shift();
  await page.locator('#catalog-type').selectOption('tv');
  await page.locator('#catalog-apply').click();
  await expect.poll(() => pending.length).toBe(1);
  const current = pending.shift();
  await current.fulfill({ json: browse(current.request().url()) });
  await expect(page.locator('.catalog-summary')).toContainText('Сериалы');
  await old.fulfill({ json: browse(old.request().url()) });
  await expect(page.locator('.catalog-summary')).toContainText('Сериалы');
  await page.locator('#catalog-apply').click();
  await expect.poll(() => pending.length).toBe(1);
  await page.locator('[data-view="search"]').click();
  await pending[0].fulfill({ json: browse(pending[0].request().url()) });
  await expect(page.locator('#query')).toBeVisible();
  await expect(page.locator('#catalog-results')).toHaveCount(0);
});

test('bundle supplies APIs absent in Chromium 68 and disposes MobX reactions between visits', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    delete window.globalThis;
    delete window.structuredClone;
    delete window.queueMicrotask;
    delete Object.hasOwn;
  });
  await openCatalog(page);
  const reactions = () => page.evaluate(() => window[Symbol.for('mobx-solid')].reactions.size);
  const mounted = await reactions();
  expect(mounted).toBeGreaterThan(0);
  await page.locator('[data-view="search"]').click();
  const persistent = await reactions();
  expect(persistent).toBeLessThan(mounted);
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-view="search"]').click();
    expect(await reactions()).toBe(persistent);
    await page.locator('#nav-catalog').click();
    await expect(page.locator('.poster-card')).toHaveCount(36);
    expect(await reactions()).toBe(mounted);
  }
  expect(errors).toEqual([]);
});
