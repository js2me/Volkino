const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

async function fitsScreen(page) {
  expect(await page.locator('#main').evaluate(main => ({
    content: main.scrollWidth <= main.clientWidth,
    document: document.documentElement.scrollWidth <= innerWidth,
    height: main.clientHeight > 0,
  }))).toEqual({ content: true, document: true, height: true });
}

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test.describe(`tablet ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('catalog uses compact text and keeps TV sizing separate', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.home-intro')).toBeVisible();
      await page.evaluate(() => document.documentElement.dataset.device = 'tablet');
      await page.locator('#nav-catalog').tap();
      await expect(page.locator('.catalog-grid .poster-card')).toHaveCount(36);
      await expect(page.locator('#catalog-type')).toHaveCSS('font-size', '16px');
      await expect(page.locator('#catalog-type')).toHaveCSS('height', '48px');
      await expect(page.locator('#nav-catalog span')).toHaveCSS('font-size', '15px');
      await expect(page.locator('.catalog-filter-hint')).toBeHidden();
      await fitsScreen(page);

      await page.evaluate(() => document.documentElement.dataset.device = 'tv');
      await expect(page.locator('#catalog-type')).not.toHaveCSS('font-size', '16px');
      await expect(page.locator('.catalog-filter-hint')).toBeVisible();
    });
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
]) {
  test.describe(`phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('navigation, filters, details and settings fit the viewport', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      await expect(page.locator('.home-intro')).toBeVisible();
      await fitsScreen(page);
      await page.locator('#nav-catalog').tap();
      await expect(page.locator('.catalog-grid .poster-card')).toHaveCount(36);
      await fitsScreen(page);

      await page.locator('#catalog-type').tap();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      await dialog.getByRole('option', { name: 'Фильмы', exact: true }).tap();
      await expect(dialog).toBeHidden();

      await page.locator('.catalog-grid .poster-card').first().tap();
      await expect(page.locator('.movie-description')).toContainText('Демонстрационная история');
      await fitsScreen(page);
      await page.getByRole('button', { name: 'В каталог', exact: true }).tap();
      await expect(page.locator('.catalog-grid')).toBeVisible();

      await page.getByRole('button', { name: 'Настройки', exact: true }).tap();
      await expect(page.locator('#audio-fix')).toBeVisible();
      await fitsScreen(page);
      await page.locator('#filmix-token').scrollIntoViewIfNeeded();
      await fitsScreen(page);
      for (const view of ['history', 'torrents', 'magnet']) {
        await page.locator(`[data-view="${view}"]`).tap();
        await expect(page.locator('#content')).not.toBeEmpty();
        await fitsScreen(page);
      }
      expect(errors).toEqual([]);
    });

    test('latest scroll loads more titles and restores the selected row', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.home-intro')).toBeVisible();
      await page.locator('#nav-latest').tap();
      await expect(page.locator('.latest-row')).toHaveCount(50);
      await fitsScreen(page);
      await page.locator('.latest-list').evaluate(list => { list.scrollTop = list.scrollHeight; });
      await expect(page.locator('.latest-row')).toHaveCount(100);
      const row = page.locator('.latest-row').nth(60);
      const id = await row.getAttribute('data-latest-id');
      await row.tap();
      await expect(page.locator('.file-card').first()).toBeVisible();
      await fitsScreen(page);
      await page.getByRole('button', { name: '← Назад', exact: true }).tap();
      await expect(page.locator(`[data-latest-id="${id}"]`)).toBeInViewport();
      await expect(page.locator('.latest-row')).toHaveCount(100);
    });
  });
}

test('narrow browser responds to width with a mouse and long search results wrap', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.route('**/api/search?**', route => route.fulfill({ json: { results: [{
    title: 'ДлинноеНазваниеБезПробелов'.repeat(10), magnet: 'magnet:?xt=urn:btih:test',
    size: 2000, seeders: 20, tracker: 'Tracker'.repeat(20), quality: '1080p',
  }] } }));
  await page.goto('/');
  await expect(page.locator('.home-intro')).toBeVisible();
  await page.locator('#nav-search').click();
  await page.locator('#query').fill('Тест');
  await page.getByRole('button', { name: 'Найти →', exact: true }).click();
  await expect(page.locator('#search-results .torrent')).toHaveCount(1);
  await fitsScreen(page);
  await page.locator('#torrent-sort').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('option', { name: 'Сначала меньше размер', exact: true }).filter({ visible: true }).click();
  await fitsScreen(page);
});

test('phone player controls work before and after rotating the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.home-intro')).toBeVisible();
  await page.locator('[data-view="torrents"]').click();
  await page.locator('.torrent').first().click();
  await page.locator('.file-card').first().click();
  const video = page.locator('#video');
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
  await page.locator('#touch-pause').click();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  await page.locator('#touch-audio').click();
  await page.locator('#player-fit').click();
  await page.locator('#player-options-close').click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#touch-episodes').click();
  await expect(page.locator('.episode-card')).toHaveCount(4);
  await page.locator('.episode-card').nth(1).click();
  await expect(page.locator('#playing-title')).toHaveText('Серия 2.mp4');
  await page.locator('#touch-exit').click();
  await expect(page.locator('#player')).toBeHidden();
  await fitsScreen(page);
});
