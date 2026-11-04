import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

async function download(page: Page, optionName: RegExp) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: optionName }).click(),
  ]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: await readFile(path) };
}

test('exports a meeting as CSV and XLSX', async () => {
  const page = await h.context.newPage();
  await page.goto(`${base}#/meetings/demo-phy-0`);
  await page.getByRole('button', { name: 'Export…' }).click();
  await expect(page.getByRole('dialog', { name: /Export “Physics 101”/ })).toBeVisible();
  const csv = await download(page, /^CSV/);
  expect(csv.name).toMatch(/^attendly-\d{4}-\d{2}-\d{2}-Physics-101\.csv$/);
  const text = csv.bytes.toString('utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain(
    'Name,Status,First join,Last leave,Total minutes,Sessions,Marked manually,Timeline',
  );
  expect(text).toContain('Amara Okoye,Present,');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Export…' }).click();
  const xlsx = await download(page, /^Excel workbook/);
  expect(xlsx.name).toMatch(/\.xlsx$/);
  expect(xlsx.bytes.subarray(0, 2).toString()).toBe('PK');

  // Escape closes the dialog.
  await page.getByRole('button', { name: 'Export…' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.close();
});

test('exports a group matrix and all data', async () => {
  const page = await h.context.newPage();
  await page.goto(`${base}#/groups/g-physics`);
  await page.getByRole('button', { name: 'Export matrix…' }).click();
  const csv = await download(page, /^CSV — present\/absent/);
  const lines = csv.bytes.toString('utf8').trim().split('\r\n');
  expect(csv.bytes.toString('utf8').startsWith('\uFEFFPerson,')).toBe(true);
  expect(lines.at(-1)).toMatch(/^Present,/);

  await page.goto(`${base}#/meetings`);
  await page.getByRole('button', { name: 'Export all…' }).click();
  const all = await download(page, /^CSV/);
  expect(all.bytes.toString('utf8').trim().split('\r\n').length).toBeGreaterThan(50);
  await page.close();
});

test('backup, delete and restore by merging', async () => {
  const page = await h.context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${base}#/settings`);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup (.json)' }).click(),
  ]);
  const backupPath = await dl.path();
  const backup = JSON.parse(await readFile(backupPath, 'utf8')) as {
    app: string;
    meetings: unknown[];
  };
  expect(backup.app).toBe('attendly');
  expect(backup.meetings).toHaveLength(9);

  await page.goto(`${base}#/meetings/demo-team-2`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => (await readMeetings(h.sw)).length).toBe(8);

  await page.goto(`${base}#/settings`);
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await expect(page.getByText(/contains 9 meetings and 2 groups/)).toBeVisible();
  await page.getByRole('button', { name: 'Merge into current data' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Restored 9 meetings' })).toBeVisible();
  await expect.poll(async () => (await readMeetings(h.sw)).length).toBe(9);

  // A file that isn't a backup is rejected with a readable message.
  await page.locator('input[type=file]').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByRole('alert')).toHaveText('Not an Attendly backup file');
  await page.close();
});
