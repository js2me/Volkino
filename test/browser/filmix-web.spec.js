const { test, expect } = require('@playwright/test');
test.use({ baseURL: 'http://127.0.0.1:32200' });
test('web account settings sign in without retaining the password and still save unrelated settings', async ({ page }) => {
  let received;
  await page.route('**/api/filmix/auth/login', async route => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { authenticated: true, login: 'example', plan: 'PRO+', maxQuality: 2160 } });
  });
  await page.goto('/'); await expect(page.locator('.home-intro')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#filmix-transport')).toHaveValue('mobile');
  await page.locator('#filmix-transport').selectOption('web');
  await expect(page.locator('#filmix-login')).toBeVisible();
  await page.locator('#filmix-login').fill('example');
  await page.locator('#filmix-web-password').fill('test-password');
  await page.getByRole('button', { name: 'Войти в Filmix TV', exact: true }).click();
  await expect(page.locator('#filmix-status')).toContainText('PRO+');
  await expect(page.locator('#filmix-web-password')).toHaveValue('');
  expect(received).toEqual({ name: 'example', password: 'test-password' });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Настройки сохранены');
  await page.reload();
  await expect(page.locator('.home-intro')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#filmix-transport')).toHaveValue('web');
});
