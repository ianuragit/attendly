import { expect, test } from '@playwright/test';
import { launch, readMeetings, setMeet, type Harness } from './harness';

let h: Harness;

test.beforeAll(async () => {
  h = await launch();
  await h.sw.evaluate(() => chrome.storage.sync.set({ settings: { pollIntervalMs: 1000 } }));
});
test.afterAll(async () => {
  await h.close();
});

test('records joins, leaves and the end of a call on a Meet-like page', async () => {
  const page = await h.context.newPage();
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('[Attendly]')) logs.push(m.text());
  });
  await page.goto('https://meet.google.com/abc-defg-hij');

  // Lobby: nothing is recorded yet.
  await setMeet(page, { tiles: [{ name: 'Me', self: true }], inCall: false });
  await page.waitForTimeout(2_500);
  expect(await readMeetings(h.sw)).toHaveLength(0);

  // Join the call.
  await setMeet(page, {
    tiles: [{ name: 'Me', self: true }, { name: 'Ana Lima' }, { name: 'Ben Okafor (Presenting)' }],
    title: 'Physics 101',
    count: 3,
  });
  await expect
    .poll(async () => (await readMeetings(h.sw))[0]?.participants.length ?? 0, { timeout: 15_000 })
    .toBe(3);

  const [meeting] = await readMeetings(h.sw);
  expect(meeting).toMatchObject({
    code: 'abc-defg-hij',
    status: 'active',
    detectedTitle: 'Physics 101',
  });
  expect(meeting!.participants.map((p) => p.name).sort()).toEqual(['Ana Lima', 'Ben Okafor', 'Me']);

  // Badge shows the live count.
  const tabId = await h.sw.evaluate(async () => {
    const live = (await chrome.storage.session.get('live')).live as Record<string, unknown>;
    return Number(Object.keys(live)[0]);
  });
  await expect
    .poll(() => h.sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe('3');

  // Ben leaves; after the 10s debounce his session is closed.
  await setMeet(page, {
    tiles: [{ name: 'Me', self: true }, { name: 'Ana Lima' }],
    title: 'Physics 101',
    count: 2,
  });
  await expect
    .poll(
      async () => {
        const [m] = await readMeetings(h.sw);
        return m?.participants.find((p) => p.name === 'Ben Okafor')?.sessions[0]?.leftAt ?? null;
      },
      { timeout: 25_000 },
    )
    .not.toBeNull();

  // Closing the tab finalises the meeting.
  await page.close();
  await expect
    .poll(async () => (await readMeetings(h.sw))[0]?.status, { timeout: 10_000 })
    .toBe('ended');
  const [ended] = await readMeetings(h.sw);
  expect(ended!.participants.every((p) => p.sessions.every((s) => s.leftAt !== null))).toBe(true);
  expect(logs.some((l) => l.includes('Tracking meeting abc-defg-hij'))).toBe(true);
});
