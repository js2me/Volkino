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

test('app-rendered subtitles use a bounded text overlay and honor cue end times and off', async ({ page }) => {
  await page.route('**/api/config', async route => {const c=await(await route.fetch()).json();await route.fulfill({json:{...c,webosSubtitles:true}});});
  await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'mediaId',{get:()=> '_movie'}));
  let enabled=true;
  await page.route('**/api/subtitles*',async route=>{
    if(route.request().method()==='POST')enabled=route.request().postDataJSON().index>=0;
    await route.fulfill({json:{mediaId:'_movie',tracks:[{index:0,label:'Русские',renderable:true}],renderer:'app',enabled,selected:0}});
  });
  await page.route('**/api/subtitle-cues?*',route=>route.fulfill({json:{cues:[{start:0,end:2,text:'вы должны взять её сами.'}]}}));
  await page.goto('/');await page.locator('.home-section .poster-card').first().click();await page.locator('.detail-torrents .torrent').first().click();await page.locator('.file-card').first().click();
  const overlay=page.locator('#player-subtitle-text');await expect(overlay).toHaveText('вы должны взять её сами.');
  const style=await overlay.evaluate(e=>({width:e.getBoundingClientRect().width,font:parseFloat(getComputedStyle(e).fontSize),color:getComputedStyle(e).color,html:e.innerHTML}));
  expect(style.font).toBeLessThan(45);expect(style.width).toBeLessThan(1600);expect(style.color).toBe('rgb(255, 255, 255)');expect(style.html).not.toContain('<font');
  await expect(overlay).toBeEmpty();
  await page.keyboard.press('ArrowUp');await page.locator('#player-subtitles').click();await expect(page.locator('#player-subtitles')).toContainText('выключены');await expect(overlay).toBeEmpty();
});
