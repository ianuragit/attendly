/**
 * Generates the README screenshots in docs/screenshots from demo data.
 * Opt-in: SCREENSHOTS=1 npm run test:e2e -- screenshots
 */
import { test } from '@playwright/test';
import { resolve } from 'node:path';
import { demoData } from '../fixtures/demo-data';
import { launch, seed } from './harness';

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
  await h.close();
});
