import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.argv[2] || 'http://localhost:8080').origin;
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
try {
  for (const engine of ['scramjet', 'ultraviolet'])
    for (const cloaked of [false, true]) {
      const context = await browser.newContext();
      try {
        await context.addInitScript(engine => localStorage.setItem('setting_proxy_engine', engine), engine);
        const page = await context.newPage();
        await page.goto(origin + '/home?launch=1');
        let app = page;
        if (cloaked) {
          const opened = context.waitForEvent('page');
          await page.evaluate(() => void openAtlasBlank());
          const popup = await opened;
          await popup.frameLocator('#atlasBlankApp').locator('#homeSearchInput').waitFor({ state: 'attached' });
          await popup.locator('#atlasBlankLoading').waitFor({ state: 'detached' });
          assert.equal(await popup.evaluate(() => location.href), 'about:blank');
          app = popup.frames().find(frame => frame.parentFrame() === popup.mainFrame());
        }
        assert.equal(await app.evaluate(() => activeWss), origin.replace(/^http/, 'ws') + '/wisp/');
        await app.locator('#homeSearchInput').fill('hello');
        await app.locator('#homeSearchInput').press('Enter');
        await app.waitForFunction(
          () => tabs.some(tab => tab.iframe?.contentDocument?.title?.toLowerCase().includes('hello')),
          {},
          { timeout: 45000 }
        );
        assert.equal(await app.evaluate(() => tabs.find(tab => tab.id === activeTabId).proxyEngine), engine);
        await app.evaluate(() => navigateActiveTab('https://example.com/'));
        await app.waitForFunction(
          () => tabs.find(tab => tab.id === activeTabId)?.iframe?.contentDocument?.title === 'Example Domain',
          {},
          { timeout: 30000 }
        );
        assert.equal(
          await app.evaluate(() => new URL(tabs.find(tab => tab.id === activeTabId).iframe.src).origin),
          origin
        );
        console.log(JSON.stringify({ engine, cloaked, ownRelay: true, search: true, navigation: true }));
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
