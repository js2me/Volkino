const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

test('embedded TorrServer settings validate and survive reopening', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#ts-mode').selectOption('local');
  await expect(page.locator('#local-cache-size')).toHaveValue('32');
  await page.locator('#local-cache-size').fill('0');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('от 8 до 2048');
  await expect(page.locator('#local-cache-size')).toBeFocused();
  await page.locator('#local-cache-size').fill('128');
  await page.locator('#local-preload-cache').fill('25');
  await page.locator('#local-connections-limit').fill('40');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#local-cache-size')).toHaveValue('128');
  await expect(page.locator('#local-preload-cache')).toHaveValue('25');
  await expect(page.locator('#local-connections-limit')).toHaveValue('40');
  await page.locator('#ts-mode').selectOption('external');
  await expect(page.locator('#local-cache-size')).toBeHidden();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Настройки сохранены');
});
