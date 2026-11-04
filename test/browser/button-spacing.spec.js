const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:32200' });

for (const width of [1920, 640]) {
  test(`player buttons keep spacing without flex gap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('/');
    await page.locator('.poster-card').first().click();
    await page.locator('.detail-torrents .torrent').first().click();
    await page.locator('.file-card').first().click();
    await expect.poll(() => page.locator('#video').evaluate(video => video.readyState)).toBeGreaterThan(2);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#player-options')).toBeVisible();
    // Emulate the missing flex-gap support of webOS Chromium 68.
    await page.addStyleTag({ content: '.player-options-actions, .touch-controls { gap: 0 !important; } .touch-controls { display: flex !important; }' });
    for (const [selector, spacing] of [['.player-options-actions', 14], ['.touch-controls', 10]]) {
      const boxes = await page.locator(`${selector} > .btn`).evaluateAll(buttons => buttons.map(button => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return { x, y, width, height };
      }));
      expect(boxes.length).toBeGreaterThan(1);
      let wrapped = false;
      for (let i = 0; i < boxes.length; i++) {
        expect(boxes[i].width).toBeGreaterThan(0);
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (Math.abs(a.y - b.y) < 1) {
            expect(b.x - a.x - a.width).toBeGreaterThanOrEqual(spacing - 1);
          } else {
            wrapped = true;
            expect(b.y - a.y - a.height).toBeGreaterThanOrEqual(spacing - 1);
          }
        }
      }
      if (width === 640) expect(wrapped).toBe(true);
    }
  });
}
