/**
 * Automated accessibility checks (axe-core, WCAG 2.1 A/AA) on every page in light and dark
 * themes. Catches contrast, labelling, landmark and ARIA mistakes.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { demoData } from '../fixtures/demo-data';
import { launch, seed, type Harness } from './harness';

let h: Harness;

test.beforeAll(async () => {
  h = await launch();
  await h.sw.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await seed(h.sw, demoData(Date.now()));
});
test.afterAll(async () => {
  await h.close();
});

const PAGES: [string, string][] = [
  ['history', 'src/dashboard/index.html#/meetings'],
  ['meeting', 'src/dashboard/index.html#/meetings/demo-phy-1'],
  ['groups', 'src/dashboard/index.html#/groups'],
  ['group matrix', 'src/dashboard/index.html#/groups/g-physics'],
  ['settings', 'src/dashboard/index.html#/settings'],
  ['popup', 'src/popup/index.html?tabId=999999'],
];

for (const theme of ['light', 'dark'] as const) {
  for (const [name, path] of PAGES) {
    test(`${name} (${theme}) has no WCAG A/AA violations`, async () => {
      const page = await h.context.newPage();
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`chrome-extension://${h.extensionId}/${path}`);
      await page.waitForTimeout(400);
      if (name === 'meeting') {
        await page.getByRole('button', { name: 'Timeline for Amara Okoye' }).click();
      }
      if (name === 'history') {
        await page.getByRole('button', { name: 'Export all…' }).click();
      }
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
      }));
      expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
      await page.close();
    });
  }
}
