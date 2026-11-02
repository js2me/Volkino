const {test,expect}=require('@playwright/test');
test.use({baseURL:'http://127.0.0.1:32200'});

test('one Solid entry owns the shell without legacy scripts or window mount bridges',async({page})=>{
 const scripts=[];page.on('request',request=>{if(request.resourceType()==='script')scripts.push(new URL(request.url()).pathname);});
 await page.goto('/');await expect(page.locator('.home-intro')).toBeVisible();
 expect(scripts).not.toContain('/app/app.js');expect(scripts).not.toContain('/history.js');expect(scripts).not.toContain('/playback.js');
 expect(await page.evaluate(()=>['TWApp','TWCatalog','TWHome','TWSearch','TWLatest','TWHistoryScreen','TWTorrents','TWAudio','TWNavigation'].filter(key=>key in window))).toEqual([]);
 await page.locator('#nav-search').click();await expect(page.locator('#query')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('.home-intro')).toBeVisible();
});

test('a late description preserves rendered torrent rows and remote focus',async({page})=>{
 let pending;
 await page.route('**/api/catalog/item?**',route=>{pending=route;});
 await page.route('**/api/search?**',route=>route.fulfill({json:{results:[{title:'Test release',magnet:'magnet:?xt=urn:btih:test',size:1000,seeders:10,tracker:'Demo',quality:'1080p'}]}}));
 await page.goto('/');await page.locator('.poster-card').first().click();const row=page.locator('.detail-torrents .torrent');await expect(row).toBeVisible();await row.focus();await row.evaluate(element=>{window.originalTorrentRow=element;});
 const key=new URL(pending.request().url()).searchParams.get('key');
 const title=await page.locator('.movie-name').textContent();
 await pending.fulfill({json:{id:key,title,type:'movie',description:'Late description'}});
 await expect(page.locator('.movie-description')).toHaveText('Late description');await expect(row).toBeFocused();expect(await row.evaluate(element=>element===window.originalTorrentRow)).toBe(true);
});

test('returning from files restores details, selected release and scroll without a new search',async({page})=>{
 let searches=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/search')searches++;});
 await page.goto('/');await page.locator('.poster-card').first().click();const row=page.locator('.detail-torrents .torrent').nth(1);await expect(row).toBeVisible();await row.focus();const title=await row.textContent();const scroll=await page.locator('#main').evaluate(element=>element.scrollTop);
 await page.keyboard.press('Enter');await expect(page.locator('.file-card').first()).toBeVisible();const count=searches;await page.keyboard.press('Escape');await expect(row).toBeFocused();await expect(row).toHaveText(title);expect(await page.locator('#main').evaluate(element=>element.scrollTop)).toBe(scroll);expect(searches).toBe(count);
});
