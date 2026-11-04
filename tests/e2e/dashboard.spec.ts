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

test('manual attendee can be added, counted and removed', async () => {
  const page = await h.context.newPage();
  await page.goto(`${base}#/meetings/demo-team-1`);
  await page.getByLabel('Add attendee manually').fill('Phone Guest');
  await page.getByRole('button', { name: 'Add as present' }).click();
  await expect(page.getByRole('rowheader', { name: /Phone Guest/ })).toBeVisible();
  await expect(page.getByLabel('Attendance for Phone Guest')).toHaveValue('present');
  await page.getByRole('button', { name: 'Remove Phone Guest' }).click();
  await expect(page.getByRole('rowheader', { name: /Phone Guest/ })).toHaveCount(0);
  await page.close();
});

test('groups: create with code rule, matrix, rename, delete', async () => {
  const page = await h.context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${base}#/groups`);
  await page.getByLabel('Name', { exact: true }).fill('Standups');
  await page.getByLabel(/Auto-assign meeting codes/).fill('https://meet.google.com/tea-mstd-upx');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByRole('link', { name: 'Standups' }).click();

  // Demo standups already belong to another group, so the rule offers to move them.
  await page.getByRole('button', { name: /Apply code rule to past meetings \(\d+\)/ }).click();
  const table = page.getByRole('table', { name: /Attendance matrix for Standups/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Priya Nair' })).toBeVisible();
  await expect(table.getByRole('row', { name: /Priya Nair/ })).toContainText('100%');

  await page.getByText('Minutes', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Minutes' })).toBeChecked();
  await page.getByRole('button', { name: 'Edit group' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Daily standups');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Daily standups');

  await page.getByRole('button', { name: 'Delete group' }).click();
  await expect(page).toHaveURL(/#\/groups$/);
  await expect(page.getByRole('link', { name: 'Daily standups' })).toHaveCount(0);
  const meetings = await readMeetings(h.sw);
  expect(meetings.filter((m) => m.code === 'tea-mstd-upx').every((m) => m.groupId === null)).toBe(
    true,
  );
  await page.close();
});
