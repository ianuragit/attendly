import { expect, test } from '@playwright/test';
import { demoData } from '../fixtures/demo-data';
import { launch, readMeetings, seed, type Harness } from './harness';

let h: Harness;
let base: string;

test.beforeAll(async () => {
  h = await launch();
  await h.sw.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await seed(h.sw, demoData(Date.now()));
  base = `chrome-extension://${h.extensionId}/src/dashboard/index.html`;
});
test.afterAll(async () => {
  await h.close();
});

test('history lists, searches, filters and sorts meetings', async () => {
  const page = await h.context.newPage();
  await page.goto(`${base}#/meetings`);
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(9);
  await page.getByLabel('Search').fill('standup');
  await expect(rows).toHaveCount(3);
  await page.getByLabel('Search').fill('');
  await page.getByLabel('Group').selectOption({ label: 'Physics 101 · Period 2' });
  await expect(rows).toHaveCount(6);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows).toHaveCount(9);
  await page.getByRole('button', { name: /Duration/ }).click();
  await expect(page.getByRole('columnheader', { name: /Duration/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await expect(rows.first()).toContainText('Physics 101');
  await page.close();
});

test('meeting detail: rename, notes, manual mark, timeline, delete', async () => {
  const page = await h.context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${base}#/meetings/demo-team-0`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Daily standup');

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Meeting title').fill('Morning sync');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Morning sync');

  await page.getByLabel('Notes').fill('Ship v1');
  await page.getByLabel('Notes').blur();
  await page.getByLabel('Attendance for Priya Nair').selectOption('absent');
  await expect
    .poll(async () => (await readMeetings(h.sw)).find((m) => m.id === 'demo-team-0'))
    .toMatchObject({
      customTitle: 'Morning sync',
      notes: 'Ship v1',
      manualMarks: { 'priya nair#0': 'absent' },
    });

  const timelineButton = page.getByRole('button', { name: 'Timeline for Priya Nair' });
  await timelineButton.click();
  await expect(timelineButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('img', { name: /Priya Nair: present/ })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/meetings$/);
  await expect
    .poll(async () => (await readMeetings(h.sw)).some((m) => m.id === 'demo-team-0'))
    .toBe(false);
  await page.close();
});
