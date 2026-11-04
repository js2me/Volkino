const { test, expect } = require('@playwright/test');
test.use({ baseURL: 'http://127.0.0.1:32200' });
test.afterEach(async ({ request }) => {
  await request.post('/api/config', {
    data: { catalogBrowseProvider: 'vilkadb' },
  });
});

test('source schema controls filters and Filmix opens playback without VilkaDB', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto('/');
  await expect(page.locator('.home-section')).toHaveCount(3);
  await page.locator('#nav-catalog').click();
  const source = page.locator('#catalog-provider');
  await expect(source.locator('option')).toHaveCount(5);
  await source.selectOption('filmix');
  await expect(page.locator('.catalog-summary')).toContainText('Filmix');
  await expect(page.locator('#catalog-rating')).toHaveCount(0);
  await expect(page.locator('#catalog-genre option[value="g3"]')).toHaveText(
    'Боевик',
  );
  await expect(page.locator('.poster-card').first()).toHaveAttribute(
    'data-catalog-id',
    /^filmix:/,
  );
  requests.length = 0;
  await page.locator('.poster-card').first().click();
  await expect(page.locator('.movie-description')).not.toHaveText(
    'Загружаем описание…',
  );
  await page
    .getByRole('button', { name: 'Смотреть через Filmix', exact: true })
    .click();
  await expect(page.locator('.file-card')).toHaveCount(1);
  expect(requests).not.toContain('/api/search');
  expect(requests).not.toContain('/api/filmix/search');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'В каталог', exact: true }).click();
  await expect(source).toHaveValue('filmix');
  await source.selectOption('yts');
  await expect(page.locator('.catalog-summary')).toContainText('YTS');
  await expect(page.locator('#catalog-type')).toBeDisabled();
  await expect(page.locator('#catalog-year')).toHaveCount(0);
  await expect(page.locator('#catalog-rating')).toBeVisible();
  await source.selectOption('cinemeta');
  await expect(page.locator('.catalog-summary')).toContainText('Cinemeta');
  await expect(page.locator('#catalog-rating')).toHaveCount(0);
  await expect(
    page.locator('#catalog-genre option[value="Action"]'),
  ).toHaveText('Боевик');
  await source.selectOption('cub');
  await expect(page.locator('.catalog-summary')).toContainText('CUB');
  await expect(page.locator('#catalog-genre')).toHaveCount(0);
  await expect(page.locator('#catalog-year')).toBeVisible();
});

test('an additional provider field renders and submits through the same catalog interface', async ({
  page,
}) => {
  const schema = {
    id: 'example',
    name: 'Пример',
    note: 'Новый адаптер',
    fields: [
      {
        key: 'country',
        label: 'Страна',
        defaultValue: 'us',
        options: [
          { id: 'us', name: 'США' },
          { id: 'fr', name: 'Франция' },
        ],
      },
    ],
  };
  await page.route('**/api/catalog/sources', (route) =>
    route.fulfill({ json: { sources: [schema] } }),
  );
  const queries = [];
  await page.route('**/api/catalog/browse?**', (route) => {
    const q = Object.fromEntries(new URL(route.request().url()).searchParams);
    queries.push(q);
    return route.fulfill({
      json: {
        provider: 'example',
        source: 'Пример',
        filters: { ...q, page: 1, minRating: 0 },
        genres: { movie: [], tv: [] },
        items: [],
        hasMore: false,
        updatedAt: Date.now(),
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.home-section')).toHaveCount(3);
  await page.locator('#nav-catalog').click();
  await expect(page.locator('#catalog-country')).toHaveValue('us');
  await page.locator('#catalog-country').selectOption('fr');
  await page.locator('#catalog-apply').click();
  await expect.poll(() => queries.at(-1)?.country).toBe('fr');
  expect(queries.at(-1).provider).toBe('example');
});

test('switching providers ignores an unfinished response from the previous source', async ({
  page,
}) => {
  let oldRoute;
  await page.route('**/api/catalog/browse?**', (route) => {
    if (
      new URL(route.request().url()).searchParams.get('provider') === 'filmix'
    )
      oldRoute = route;
    else return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.home-section')).toHaveCount(3);
  await page.locator('#nav-catalog').click();
  await expect(page.locator('.catalog-summary')).toContainText('VilkaDB');
  await page.locator('#catalog-provider').selectOption('filmix');
  await expect.poll(() => !!oldRoute).toBe(true);
  await page.locator('#catalog-provider').selectOption('yts');
  await expect(page.locator('.catalog-summary')).toContainText('YTS');
  await oldRoute.fulfill({
    json: {
      provider: 'filmix',
      source: 'Filmix',
      filters: {
        type: 'movie',
        genre: '',
        year: '',
        sort: 'popular',
        minRating: 0,
        page: 1,
      },
      genres: { movie: [], tv: [] },
      items: [{ id: 'filmix:999', title: 'Old response', type: 'movie' }],
      hasMore: false,
      updatedAt: Date.now(),
    },
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator('.catalog-summary')).toContainText('YTS');
  await expect(page.locator('[data-catalog-id="filmix:999"]')).toHaveCount(0);
});
