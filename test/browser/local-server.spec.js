const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

test('connection status automatically recovers after TorrServer becomes available', async ({ page }) => {
  let available = false, requests = 0;
  await page.clock.install();
  await page.route('**/api/health', route => {
    requests++;
    return route.fulfill({ status: available ? 200 : 400, contentType: 'application/json', body: JSON.stringify(available ? { version: 'MatriX.recovered' } : { error: 'Connection refused' }) });
  });
  await page.goto('/');
  await expect(page.locator('#connection-text')).toContainText('переподключаемся');
  available = true;
  await page.clock.runFor(5000);
  await expect(page.locator('#connection-text')).toHaveText('MatriX.recovered');
  await expect(page.locator('#connection-light')).toHaveClass('ok');
  expect(requests).toBe(2);
});
