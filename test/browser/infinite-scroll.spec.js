const { test, expect } = require('@playwright/test');
test.use({ baseURL: 'http://127.0.0.1:32200', viewport: { width: 1280, height: 800 } });

for (const screen of ['latest', 'catalog']) {
  const rows = screen === 'latest' ? '.latest-row' : '#catalog-results .poster-card';
  const container = screen === 'latest' ? '.latest-list' : '#main';
  const endpoint = screen === 'latest' ? '/api/latest' : '/api/catalog/browse';
  const initial = screen === 'latest' ? 50 : 36;
  test(`${screen}: appends once on remote focus, retains nodes, stops at end and restores selection`, async ({ page }) => {
    const requests = [];
    page.on('request', r => { if (new URL(r.url()).pathname === endpoint) requests.push(new URL(r.url()).searchParams.get('page')); });
    await page.goto('/');await expect(page.locator('.home-intro')).toBeVisible();
    await page.locator('#nav-' + screen).click();
    await expect(page.locator(rows)).toHaveCount(initial);
    await page.locator(rows).first().evaluate(el => { window.firstInfiniteCard = el; });
    await page.locator(rows).nth(initial - 3).focus();
    await expect(page.locator(rows)).toHaveCount(initial * 2);
    await expect(page.locator(rows).nth(initial - 3)).toBeFocused();
    expect(await page.locator(rows).first().evaluate(el => el === window.firstInfiniteCard)).toBe(true);
    if (screen === 'latest') {
      await page.locator(container).evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(page.locator(rows)).toHaveCount(144);
    }
    await expect(page.locator('.infinite-scroll-status')).toContainText('Всё загружено');
    const selected = page.locator(rows).nth(initial + 5);
    await selected.focus();
    const scroll = await page.locator(container).evaluate(el => el.scrollTop);
    await page.keyboard.press('Enter');
    await expect(page.locator(screen === 'latest' ? '.file-card' : '.movie-details').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(selected).toBeFocused();
    expect(await page.locator(container).evaluate(el => el.scrollTop)).toBe(scroll);
    expect(requests).toEqual(screen === 'latest' ? ['1', '2', '3'] : ['1', '2']);
  });

  test(`${screen}: a failed append preserves items and retries the same page without duplicates`, async ({ page }) => {
    let attempts = 0;
    await page.route('**' + endpoint + '?**', async route => {
      if (new URL(route.request().url()).searchParams.get('page') === '2' && ++attempts === 1)
        return route.fulfill({ status: 503, json: { error: 'Временная ошибка загрузки' } });
      return route.continue();
    });
    await page.goto('/');await expect(page.locator('.home-intro')).toBeVisible();await page.locator('#nav-' + screen).click();
    await expect(page.locator(rows)).toHaveCount(initial);
    await page.locator(container).evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByRole('button', { name: 'Повторить загрузку' })).toBeVisible();
    await expect(page.locator(rows)).toHaveCount(initial);
    await page.locator(container).evaluate(el => { el.dispatchEvent(new Event('scroll')); });
    expect(attempts).toBe(1);
    await page.getByRole('button', { name: 'Повторить загрузку' }).click();
    await expect(page.locator(rows)).toHaveCount(initial * 2);
    expect(attempts).toBe(2);
  });
}

test('catalog: applying new filters invalidates a pending append', async ({ page }) => {
  let pending;
  await page.route('**/api/catalog/browse?**', route => {
    if (new URL(route.request().url()).searchParams.get('page') === '2') { pending = route; return; }
    return route.continue();
  });
  await page.goto('/');await expect(page.locator('.home-intro')).toBeVisible();await page.locator('#nav-catalog').click();
  await expect(page.locator('.poster-card')).toHaveCount(36);
  await page.locator('#main').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => !!pending).toBe(true);
  await page.locator('#catalog-type').selectOption('tv');await page.locator('#catalog-apply').click();
  await expect(page.locator('.catalog-summary')).toContainText('Сериалы');
  await pending.fulfill({ json: { filters: { type: 'movie', page: 2 }, items: [{ id: 'late', title: 'Устаревший фильм', type: 'movie' }], genres: { movie: [], tv: [] }, hasMore: false, updatedAt: Date.now() } });
  await expect(page.locator('.catalog-summary')).toContainText('Сериалы');
  await expect(page.locator('[data-catalog-id="late"]')).toHaveCount(0);
});
