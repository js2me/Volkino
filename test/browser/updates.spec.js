const {test, expect} = require('@playwright/test');
test.use({baseURL:'http://127.0.0.1:32200'});

test('settings updates show progress, prevent duplicate downloads and invoke native installation', async ({page}) => {
  let state = 'idle', downloads = 0;
  await page.addInitScript(() => { window.TWNativeUpdater = {install() { window.installCount = (window.installCount || 0) + 1; }}; });
  await page.route('**/api/updates**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/check')) state = 'available';
    if (path.endsWith('/download')) { state = 'downloading'; downloads++; }
    const reply = {state,supported:true,current:'0.9.2',build:11,latest:'v0.9.2-build.12',received:1048576,total:2097152,error:''};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(reply)});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  const button = page.locator('#app-update'), message = page.locator('#app-update-status');
  await expect(button).toHaveText('Обновить');
  await button.click();
  await expect(message).toContainText('v0.9.2-build.12');
  await expect(button).toHaveText('Скачать обновление');
  await button.click();
  await expect(button).toBeDisabled();
  await expect(message).toContainText('1 / 2 МиБ');
  state = 'ready';
  await expect(button).toHaveText('Установить');
  await expect(button).toBeEnabled();
  expect(downloads).toBe(1);
  await button.click();
  await expect.poll(()=>page.evaluate(()=>window.installCount)).toBe(1);
  state = 'idle'; // Installer completion/cancellation removes the staged APK.
  await page.evaluate(()=>window.dispatchEvent(new Event('volkino-update-finished')));
  await expect(button).toHaveText('Обновить');
});

test('failed release check can be retried', async ({page}) => {
  let fail = true;
  await page.route('**/api/updates/check', route => route.fulfill({status:fail ? 400 : 200,contentType:'application/json',body:JSON.stringify(fail ? {error:'GitHub недоступен'} : {state:'latest',supported:false,current:'0.9.2',build:0,received:0,total:0,error:''})}));
  await page.goto('/');
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.locator('#app-update').click();
  await expect(page.locator('#app-update-status')).toContainText('GitHub недоступен');
  fail = false;
  await page.locator('#app-update').click();
  await expect(page.locator('#app-update-status')).toContainText('Установлена последняя версия');
});
