/** Regression: calls served at /meet/<code> (reported from a real call) must be tracked. */
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

const tabIdFor = (code: string) =>
  h.sw.evaluate(async (c) => {
    const pages = ((await chrome.storage.session.get('pages')).pages ?? {}) as Record<
      string,
      { code: string | null }
    >;
    const live = ((await chrome.storage.session.get('live')).live ?? {}) as Record<
      string,
      { code: string }
    >;
    const hit =
      Object.entries(pages).find(([, p]) => p.code === c) ??
      Object.entries(live).find(([, l]) => l.code === c);
    return hit ? Number(hit[0]) : null;
  }, code);

test('popup explains the lobby, then tracking starts on /meet/<code>', async () => {
  const meet = await h.context.newPage();
  await meet.goto('https://meet.google.com/meet/bpn-qubw-rjo?authuser=0');
  await setMeet(meet, { tiles: [{ name: 'Me', self: true }], inCall: false });
  await expect.poll(() => tabIdFor('bpn-qubw-rjo')).not.toBeNull();
  const tabId = await tabIdFor('bpn-qubw-rjo');

  const popup = await h.context.newPage();
  await popup.goto(`chrome-extension://${h.extensionId}/src/popup/index.html?tabId=${tabId}`);
  await expect(
    popup.getByText(/Meeting bpn-qubw-rjo is open\. Recording starts as soon as you join/),
  ).toBeVisible();

  // The call's controls use role=button and a span glyph, not <button><i>.
  await meet.evaluate(() => {
    document.body.innerHTML =
      '<div data-participant-id="a"><div data-self-name="You">Me</div></div>' +
      '<div data-participant-id="b"><span class="notranslate">Ana Lima</span></div>' +
      '<div role="button" aria-label="Leave call"><span class="google-symbols">call_end</span></div>';
  });
  await expect
    .poll(async () => (await readMeetings(h.sw))[0]?.code, { timeout: 10_000 })
    .toBe('bpn-qubw-rjo');
  await expect.poll(async () => (await readMeetings(h.sw))[0]?.participants.length).toBe(2);
  await expect(popup.getByText('Recording attendance')).toBeVisible({ timeout: 5_000 });
});
