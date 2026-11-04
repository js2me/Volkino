const {test,expect}=require('@playwright/test');
test.use({baseURL:'http://127.0.0.1:32200'});

test('an early menu click survives startup and uses the loaded source setting',async({page})=>{
 let configRoute;
 await page.route('**/api/config',route=>{if(route.request().method()==='GET')configRoute=route;else return route.continue();});
 await page.goto('/');await expect.poll(()=>!!configRoute).toBe(true);await page.locator('#nav-catalog').click();
 await configRoute.fulfill({json:{catalogBrowseProvider:'filmix',torrserverMode:'external',torrserverUrl:''}});
 await expect(page.locator('.catalog-summary')).toContainText('Filmix');await expect(page.locator('#catalog-provider')).toHaveValue('filmix');await expect(page.locator('.home-intro')).toHaveCount(0);
});

test('history resumes the torrent and Back returns to history after a catalogue visit',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('tw-history',JSON.stringify([{hash:'0123456789abcdef0123456789abcdef01234567',fileId:1,title:'Сохранённая серия',fileName:'Демонстрационный сезон/Серия 1.mp4',torrentTitle:'Сериал из истории',link:'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',position:12,duration:100,updated:Date.now()}])));
 await page.goto('/');await expect(page.locator('.home-intro')).toBeVisible();
 await page.locator('#nav-catalog').click();await page.locator('.catalog-grid .poster-card').first().click();await expect(page.locator('.movie-details')).toBeVisible();
 await page.locator('[data-view="history"]').click();
 await page.locator('.history-screen .torrent').first().focus();await page.keyboard.press('Enter');
 await expect(page.locator('#player')).toBeVisible();
 await expect.poll(()=>page.locator('#video').evaluate(v=>v.currentTime)).toBeGreaterThan(11);
 await expect(page.locator('#playing-title')).toContainText('Серия 1.mp4');
 await page.keyboard.press('Escape');await expect(page.locator('#player')).toBeHidden();await page.keyboard.press('Escape');
 await expect(page.locator('.history-screen')).toBeVisible();await expect(page.locator('.catalog-grid')).toHaveCount(0);
});

test('navigation stops the old player before another Filmix title loads',async({page})=>{
 await page.goto('/');await expect(page.locator('.home-intro')).toBeVisible();
 await page.locator('.poster-card').first().click();await page.locator('.detail-torrents .torrent').first().click();await page.locator('.file-card').first().click();
 await expect.poll(()=>page.locator('#video').evaluate(v=>v.currentTime)).toBeGreaterThan(.1);
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('tw-history'))[0]);
 await page.locator('#nav-catalog').evaluate(button=>button.click());
 await expect(page.locator('#player')).toBeHidden();expect(await page.locator('#video').evaluate(v=>v.paused)).toBe(true);
 await page.locator('#catalog-provider').selectOption('filmix');await expect(page.locator('.catalog-summary')).toContainText('Filmix');
 await page.locator('.catalog-grid .poster-card').first().click();await page.getByRole('button',{name:'Смотреть через Filmix',exact:true}).click();await expect(page.locator('.file-card')).toHaveCount(1);
 const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('tw-history')));
 expect(history).toHaveLength(1);expect(history[0].hash).toBe(original.hash);expect(history[0].source).toBeUndefined();expect(history[0].torrentTitle).toBe(original.torrentTitle);
});

test.afterEach(async({request})=>{await request.post('/api/config',{data:{catalogBrowseProvider:'vilkadb'}});});
