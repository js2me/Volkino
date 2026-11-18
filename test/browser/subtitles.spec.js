const { test, expect } = require('@playwright/test');
test.use({ baseURL: 'http://127.0.0.1:32200' });
test('remote menu selects and disables real browser text tracks, including a single default track', async ({ page }) => {
  await page.goto('/');
  await page.locator('.home-section .poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  await page.locator('.file-card').first().click();
  await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await page.keyboard.press('ArrowUp');
  const button = page.locator('#player-subtitles');
  await expect(button).toBeDisabled();
  await page.locator('#video').evaluate(video => {
    const ru = video.addTextTrack('subtitles', 'Русские', 'ru');
    ru.addCue(new VTTCue(0, 40, 'Тест субтитров')); ru.mode = 'showing';
  });
  await expect(button).toBeEnabled(); await expect(button).toContainText('Русские');
  await button.focus(); await page.keyboard.press('Enter');
  await expect(button).toContainText('выключены');
  await page.locator('#video').evaluate(video => {
    const en = video.addTextTrack('captions', 'English SDH', 'en');
    en.addCue(new VTTCue(0, 40, 'Subtitle test'));
  });
  await page.keyboard.press('Enter'); await expect(button).toContainText('Русские');
  await page.keyboard.press('Enter'); await expect(button).toContainText('English SDH');
  await page.keyboard.press('Enter'); await expect(button).toContainText('выключены');
  expect(await page.locator('#video').evaluate(v => Array.from(v.textTracks).every(t => t.mode === 'disabled'))).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('#player')).toBeVisible();
});

test('LG embedded subtitles use the native media service, including explicit off from an unknown default', async ({ page }) => {
  await page.route('**/api/config', async route => {
    const config = await (await route.fetch()).json();
    await route.fulfill({json:{...config,webosSubtitles:true}});
  });
  await page.addInitScript(() => Object.defineProperty(HTMLMediaElement.prototype, 'mediaId', {get:()=> '_movie'}));
  let state={mediaId:'_movie',tracks:[{index:0,label:'Русские'},{index:2,label:'English'}],enabled:null,selected:null};
  const choices=[];
  await page.route('**/api/subtitles*', async route => {
    if(route.request().method()==='POST'){
      const {index}=route.request().postDataJSON();choices.push(index);
      state={...state,enabled:index>=0,selected:index>=0?index:state.selected};
    }
    await route.fulfill({json:state});
  });
  await page.goto('/');
  await page.locator('.home-section .poster-card').first().click();
  await page.locator('.detail-torrents .torrent').first().click();
  await page.locator('.file-card').first().click();
  await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await page.keyboard.press('ArrowUp');const button=page.locator('#player-subtitles');
  await expect(button).toContainText('авто');await button.click();await expect(button).toContainText('выключены');
  await button.click();await expect(button).toContainText('Русские');
  await button.click();await expect(button).toContainText('English');
  await button.click();await expect(button).toContainText('выключены');
  expect(choices).toEqual([-1,0,2,-1]);
});
