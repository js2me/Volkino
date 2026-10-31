const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }]) {
  test.describe(`${viewport.width}px remote navigation`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.home-section')).toHaveCount(3);
      await page.getByRole('button', { name: 'Каталог', exact: true }).click();
      await expect(page.locator('#catalog-results .poster-card')).toHaveCount(36);
      await expect(page.locator('#catalog-type')).toBeFocused();
    });

    test('closed filters move by visual rows without changing values; sidebar restores focus', async ({ page }) => {
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#catalog-year')).toBeFocused();
      await expect(page.locator('#catalog-type')).toHaveValue('movie');
      await expect(page.locator('#catalog-year')).toHaveValue('');
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#catalog-type')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#catalog-genre')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#catalog-rating')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#catalog-apply')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#catalog-sort')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#catalog-year')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#nav-catalog')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#nav-search')).toBeFocused();
      await expect(page.locator('#catalog-results')).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#catalog-year')).toBeFocused();
      await expect(page.locator('#catalog-type')).toHaveValue('movie');
    });

    test('OK opens choices, arrows preview, BACK cancels and OK commits exactly once', async ({ page }) => {
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('option', { name: 'Фильмы', exact: true }).filter({ visible: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(dialog.getByRole('option', { name: 'Сериалы', exact: true })).toBeFocused();
      await expect(page.locator('#catalog-type')).toHaveValue('movie');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('#catalog-type')).toBeFocused();
      await expect(page.locator('#catalog-type')).toHaveValue('movie');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.down('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('#catalog-type')).toHaveValue('tv');
      await page.keyboard.down('Enter');
      await expect(dialog).toHaveCount(0);
      await page.keyboard.up('Enter');
      await expect(page.locator('#catalog-type')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#catalog-year')).toBeFocused();
    });

    test('mouse opens the same picker; long year list scrolls inside it and restores focus', async ({ page }) => {
      await page.locator('#catalog-year').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('End');
      await expect(dialog.getByRole('option', { name: '1900', exact: true })).toBeFocused();
      await expect.poll(() => page.locator('.remote-select-options').evaluate(list => list.scrollTop)).toBeGreaterThan(0);
      await page.keyboard.press('Enter');
      await expect(page.locator('#catalog-year')).toHaveValue('1900');
      await expect(page.locator('#catalog-year')).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Home');
      await page.keyboard.press('Escape');
      await expect(page.locator('#catalog-year')).toHaveValue('1900');
      await page.locator('#catalog-year').click();
      await dialog.getByRole('option', { name: '2024', exact: true }).click();
      await expect(page.locator('#catalog-year')).toHaveValue('2024');
      await expect(page.locator('#catalog-year')).toBeFocused();
    });

    test('grid arrows keep the column, and horizontal edges never wrap to another row', async ({ page }) => {
      const cards = page.locator('#catalog-results .poster-card');
      await cards.first().focus();
      const columns = await cards.evaluateAll(cards => {
        const top = cards[0].getBoundingClientRect().top;
        return cards.filter(card => Math.abs(card.getBoundingClientRect().top - top) < 2).length;
      });
      await page.keyboard.press('ArrowRight');
      await expect(cards.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(cards.nth(columns + 1)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(cards.nth(1)).toBeFocused();
      await cards.nth(columns - 1).focus();
      await page.keyboard.press('ArrowRight');
      await expect(cards.nth(columns - 1)).toBeFocused();
      await cards.first().focus();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#nav-catalog')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(cards.first()).toBeFocused();
    });
  });
}

test('legacy settings and Filmix selectors share remote selection and restore rebuilt controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-section')).toHaveCount(3);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#ts-mode').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#ts-url')).toBeFocused();
  await expect(page.locator('#ts-mode')).toHaveValue('external');
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await page.locator('.home-section').last().locator('.poster-card').first().click();
  await page.getByRole('button', { name: 'Смотреть через Filmix', exact: true }).click();
  await page.locator('.torrent').filter({ hasText: '(сериал)' }).first().click();
  await page.locator('#filmix-season').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#filmix-season')).toHaveValue('2');
  await expect(page.locator('#filmix-season')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#filmix-quality')).toBeFocused();
});

for (const activeMenu of [true, false]) {
  test(`Filmix error returns focus to sidebar on Left and restores Retry on Right (active menu: ${activeMenu})`, async ({ page }) => {
    await page.route('**/api/filmix/search?*', route => route.fulfill({ status: 503, json: { error: 'Источник временно недоступен' } }));
    await page.goto('/');
    await expect(page.locator('.home-section')).toHaveCount(3);
    await page.locator('#nav-search').click();
    await page.locator('#query').fill('Дюна');
    await page.getByRole('button', { name: 'Filmix', exact: true }).click();
    await expect(page.locator('#content')).toContainText('Filmix недоступен');
    const retry = page.getByRole('button', { name: 'Повторить', exact: true });
    await expect(retry).toBeFocused();
    await expect(page.locator('#nav-search')).toHaveClass('nav active');
    if (!activeMenu) await page.locator('#nav-search').evaluate(button => button.classList.remove('active'));
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#nav-search')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(retry).toBeFocused();
  });
}
