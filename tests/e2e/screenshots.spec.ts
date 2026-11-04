/**
 * Generates the README screenshots in docs/screenshots from demo data.
 * Opt-in: SCREENSHOTS=1 npm run test:e2e -- screenshots
 */
import { test } from '@playwright/test';
import { resolve } from 'node:path';
import { demoData } from '../fixtures/demo-data';
import { launch, seed, setMeet } from './harness';

const OUT = process.env.SCREENSHOT_DIR ?? resolve(import.meta.dirname, '../../docs/screenshots');

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate screenshots');

test('dashboard screenshots', async () => {
  const h = await launch();
  await h.sw.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  await seed(h.sw, demoData(Date.now()));
  const base = `chrome-extension://${h.extensionId}/src/dashboard/index.html`;
  const page = await h.context.newPage();
  await page.setViewportSize({ width: 1280, height: 860 });

  const shots: [string, string, 'light' | 'dark'][] = [
    ['#/meetings', 'dashboard-history', 'light'],
    ['#/meetings/demo-phy-0', 'meeting-detail', 'light'],
    ['#/groups/g-physics', 'group-matrix', 'light'],
    ['#/settings', 'settings', 'light'],
    ['#/meetings', 'dashboard-history-dark', 'dark'],
  ];
  for (const [hash, name, scheme] of shots) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(base + hash);
    await page.waitForTimeout(600);
    if (name === 'meeting-detail') {
      for (const who of ['Amara Okoye', 'Dana Kowalski', 'Farah Haddad']) {
        await page.getByRole('button', { name: `Timeline for ${who}` }).click();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.setViewportSize({ width: 1280, height: 1100 });
    }
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await page.setViewportSize({ width: 1280, height: 860 });
  }
  // Popup over a live (fake) call.
  await h.sw.evaluate(() => chrome.storage.sync.set({ settings: { pollIntervalMs: 1000 } }));
  const meet = await h.context.newPage();
  await meet.goto('https://meet.google.com/phy-sics-one');
  await setMeet(meet, {
    tiles: [
      { name: 'Ms. Rivera', self: true },
      { name: 'Amara Okoye' },
      { name: 'Bruno Silva' },
      { name: 'Chen Wei' },
      { name: 'Elif Demir' },
    ],
    title: 'Physics 101',
  });
  await meet.waitForTimeout(2_500);
  const tabId = await h.sw.evaluate(async () =>
    Number(Object.keys((await chrome.storage.session.get('live')).live as object)[0]),
  );
  const popup = await h.context.newPage();
  await popup.emulateMedia({ colorScheme: 'light' });
  await popup.setViewportSize({ width: 320, height: 330 });
  await popup.goto(`chrome-extension://${h.extensionId}/src/popup/index.html?tabId=${tabId}`);
  await popup.waitForTimeout(1_200);
  await popup.screenshot({ path: `${OUT}/popup.png` });
  await h.close();
});
