import { expect, test } from '@playwright/test';
import { demoData } from '../fixtures/demo-data';
import { launch, readMeetings, seed, setMeet, type Harness } from './harness';

let h: Harness;
let base: string;

test.beforeAll(async () => {
  h = await launch();
  await h.sw.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  base = `chrome-extension://${h.extensionId}/src/dashboard/index.html`;
});
test.afterAll(async () => {
  await h.close();
});

const stored = () =>
  h.sw.evaluate(
    async () => (await chrome.storage.sync.get('settings')).settings as Record<string, unknown>,
  );

test('settings persist and apply theme, time format and rules', async () => {
  await seed(h.sw, demoData(Date.now()));
  const page = await h.context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${base}#/settings`);

  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByText('12-hour', { exact: true }).click();
  await page.getByLabel('Minimum time to count as present').fill('45');
  await page.getByLabel('Minimum time to count as present').press('Enter');
  await page.getByRole('switch', { name: 'Hide myself from lists and exports' }).click();
  await expect.poll(stored).toMatchObject({
    theme: 'dark',
    timeFormat: '12h',
    minPresentMs: 45 * 60_000,
    excludeSelf: true,
  });

  // Values outside the allowed range are clamped.
  await page.getByLabel('Check for changes every').fill('500');
  await page.getByLabel('Check for changes every').blur();
  await expect.poll(stored).toMatchObject({ pollIntervalMs: 60_000 });

  // The rules take effect on the meeting page.
  await page.goto(`${base}#/meetings/demo-phy-0`);
  await expect(page.getByRole('rowheader', { name: /Ms\. Rivera/ })).toHaveCount(0);
  await expect(page.getByText(/AM|PM/).first()).toBeVisible();

  // Delete all data requires typing DELETE.
  await page.goto(`${base}#/settings`);
  const del = page.getByRole('button', { name: 'Delete all data' });
  await expect(del).toBeDisabled();
  await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
  await del.click();
  await expect.poll(async () => (await readMeetings(h.sw)).length).toBe(0);

  await page.getByRole('button', { name: 'Reset settings to defaults' }).click();
  await expect
    .poll(stored)
    .toMatchObject({ theme: 'system', excludeSelf: false, pollIntervalMs: 5_000 });
  await page.close();
});

test('auto-track off records nothing', async () => {
  await h.sw.evaluate(() =>
    chrome.storage.sync.set({ settings: { autoTrack: false, pollIntervalMs: 1000 } }),
  );
  const meet = await h.context.newPage();
  await meet.goto('https://meet.google.com/xyz-abcd-efg');
  await setMeet(meet, { tiles: [{ name: 'Me', self: true }, { name: 'Ana' }] });
  await meet.waitForTimeout(3_000);
  expect((await readMeetings(h.sw)).filter((m) => m.code === 'xyz-abcd-efg')).toHaveLength(0);

  // Turning it back on starts tracking without a reload.
  await h.sw.evaluate(() =>
    chrome.storage.sync.set({ settings: { autoTrack: true, pollIntervalMs: 1000 } }),
  );
  await expect
    .poll(async () => (await readMeetings(h.sw)).filter((m) => m.code === 'xyz-abcd-efg').length, {
      timeout: 10_000,
    })
    .toBe(1);
  await meet.close();
});
