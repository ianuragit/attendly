/** Audit regressions for the worker <-> content-script protocol (findings 4, 5, 7). */
import { expect, test } from '@playwright/test';
import { launch, readMeetings, setMeet, type Harness } from './harness';

let h: Harness;

test.beforeEach(async () => {
  h = await launch();
  await h.sw.evaluate(() => chrome.storage.sync.set({ settings: { pollIntervalMs: 1000 } }));
});
test.afterEach(async () => {
  await h.close();
});

const people = { tiles: [{ name: 'Me', self: true }, { name: 'Ana' }] };

/** Edits a stored meeting directly in IndexedDB, as another context would. */
function editMeeting(id: string, patch: 'close' | 'delete') {
  return h.sw.evaluate(
    ([meetingId, action]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('attendly');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('meetings', 'readwrite');
          const store = tx.objectStore('meetings');
          if (action === 'delete') store.delete(meetingId);
          else {
            const get = store.get(meetingId);
            get.onsuccess = () => {
              const m = get.result;
              m.status = 'ended';
              m.endedAt = m.lastSeenAt;
              for (const p of m.participants) {
                for (const s of p.sessions) s.leftAt ??= m.lastSeenAt;
              }
              store.put(m);
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [id, patch] as const,
  );
}

test('a meeting closed while the tab was away is resumed, not silently reopened (#4)', async () => {
  const page = await h.context.newPage();
  await page.goto('https://meet.google.com/abc-defg-hij');
  await setMeet(page, people);
  await expect.poll(async () => (await readMeetings(h.sw))[0]?.participants.length ?? 0).toBe(2);
  const [m] = await readMeetings(h.sw);

  await editMeeting(m!.id as string, 'close'); // what the stale sweep does after a long sleep
  await expect
    .poll(
      async () => {
        const all = await readMeetings(h.sw);
        const ana = all[0]?.participants.find((p) => p.name === 'Ana');
        return { count: all.length, status: all[0]?.status, sessions: ana?.sessions.length };
      },
      { timeout: 30_000 },
    )
    .toEqual({ count: 1, status: 'active', sessions: 2 });
  const [resumed] = await readMeetings(h.sw);
  expect(resumed!.id).toBe(m!.id);
  expect(resumed!.participants.find((p) => p.name === 'Ana')!.sessions[0]!.leftAt).not.toBeNull();
});

test('deleting the live meeting starts a new record instead of dropping the call (#5)', async () => {
  const page = await h.context.newPage();
  await page.goto('https://meet.google.com/abc-defg-hij');
  await setMeet(page, people);
  await expect.poll(async () => (await readMeetings(h.sw)).length).toBe(1);
  const [m] = await readMeetings(h.sw);
  await editMeeting(m!.id as string, 'delete');
  await expect
    .poll(async () => (await readMeetings(h.sw)).map((x) => x.participants.length), {
      timeout: 30_000,
    })
    .toEqual([2]);
  expect((await readMeetings(h.sw))[0]!.id).not.toBe(m!.id);
});

test('the same call open in two tabs is recorded once (#7)', async () => {
  const a = await h.context.newPage();
  await a.goto('https://meet.google.com/abc-defg-hij');
  await setMeet(a, people);
  await expect.poll(async () => (await readMeetings(h.sw)).length).toBe(1);
  const b = await h.context.newPage();
  await b.goto('https://meet.google.com/abc-defg-hij');
  await setMeet(b, people);
  await b.waitForTimeout(3_000);
  expect(await readMeetings(h.sw)).toHaveLength(1);
});
