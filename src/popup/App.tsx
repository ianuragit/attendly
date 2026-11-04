import { useCallback, useEffect, useState } from 'react';
import { attendeeCount, meetingDurationMs, meetingTitle } from '../lib/attendance';
import { listMeetings } from '../lib/db';
import { log } from '../lib/log';
import { sendRuntimeMessage, type LiveGetReply, type PageGetReply } from '../lib/messages';
import { formatDate, formatDuration, formatDurationShort, formatTime } from '../lib/time';
import type { LiveStatus, MeetingRecord, PageStatus } from '../lib/types';
import { useApplyTheme, useDbChanges, useNow, useSettings } from '../ui/hooks';
import { openDashboard } from '../ui/navigation';

/** The tab the popup belongs to. `?tabId=` is accepted for automated tests. */
async function currentTabId(): Promise<number | null> {
  const fromQuery = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

const buttonPrimary =
  'w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

export function App() {
  const { settings } = useSettings();
  useApplyTheme(settings.theme);
  const now = useNow(1_000);
  const [tabId, setTabId] = useState<number | null>(null);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [recent, setRecent] = useState<MeetingRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<PageStatus | null>(null);

  const refresh = useCallback(async () => {
    const id = await currentTabId();
    setTabId(id);
    const status =
      id === null ? null : await sendRuntimeMessage<LiveGetReply>({ type: 'live:get', tabId: id });
    setLive(status ?? null);
    if (!status) {
      setPage(
        id === null
          ? null
          : ((await sendRuntimeMessage<PageGetReply>({ type: 'page:get', tabId: id })) ?? null),
      );
      try {
        setRecent((await listMeetings()).slice(0, 3));
      } catch (err) {
        log.error('Failed to load meetings', err);
        setRecent([]);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(id);
  }, [refresh]);
  useDbChanges(refresh);

  const togglePause = async () => {
    if (tabId === null || !live) return;
    setBusy(true);
    await sendRuntimeMessage({ type: 'live:setPaused', tabId, paused: !live.paused });
    setLive({ ...live, paused: !live.paused });
    setBusy(false);
  };

  return (
    <main className="w-80 p-4">
      <header className="mb-3 flex items-center gap-2">
        <img src="/icons/icon-32.png" alt="" width={20} height={20} />
        <h1 className="text-base font-semibold">Attendly</h1>
      </header>

      {live ? (
        <section aria-labelledby="live-heading">
          <h2 id="live-heading" className="sr-only">
            Current meeting
          </h2>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${live.paused ? 'bg-slate-400' : 'bg-emerald-500'}`}
            />
            <span
              className={
                live.paused
                  ? 'text-slate-600 dark:text-slate-300'
                  : 'text-emerald-700 dark:text-emerald-400'
              }
            >
              {live.paused ? 'Paused' : 'Recording attendance'}
            </span>
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <dt className="text-xs text-slate-600 dark:text-slate-400">Meeting code</dt>
              <dd className="font-mono text-sm">{live.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">Elapsed</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatDuration(now - live.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600 dark:text-slate-400">In the call</dt>
              <dd className="text-2xl font-semibold tabular-nums" aria-live="polite">
                {live.presentCount}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <label htmlFor="pause" className="text-sm">
              Pause tracking
            </label>
            <button
              id="pause"
              type="button"
              role="switch"
              aria-checked={live.paused}
              disabled={busy}
              onClick={() => void togglePause()}
              className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 ${
                live.paused ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  live.paused ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
          <button
            type="button"
            className={`${buttonPrimary} mt-4`}
            onClick={() => void openDashboard(`#/meetings/${live.meetingId}`)}
          >
            View live attendance
          </button>
        </section>
      ) : (
        <section aria-labelledby="recent-heading">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {notTrackingMessage(page, settings.autoTrack)}
          </p>
          <h2
            id="recent-heading"
            className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
          >
            Recent meetings
          </h2>
          {recent === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">No meetings recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {recent.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void openDashboard(`#/meetings/${m.id}`)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:bg-slate-800"
                  >
                    <span className="block truncate text-sm font-medium">{meetingTitle(m)}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(m.startedAt)} · {formatTime(m.startedAt, settings.timeFormat)} ·{' '}
                      {formatDurationShort(meetingDurationMs(m, now))} ·{' '}
                      {attendeeCount(m, settings, now)} present
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className={`${buttonPrimary} mt-4`}
            onClick={() => void openDashboard()}
          >
            Open dashboard
          </button>
        </section>
      )}
    </main>
  );
}

/** Explains why nothing is being recorded in the current tab. */
function notTrackingMessage(page: PageStatus | null, autoTrack: boolean): string {
  if (!autoTrack || page?.state === 'tracking-off') {
    return 'Automatic tracking is turned off in Settings.';
  }
  switch (page?.state) {
    case 'waiting-to-join':
      return `Meeting ${page.code ?? ''} is open. Recording starts as soon as you join the call. If you are already in the call and this doesn't change within a few seconds, reload the tab.`;
    case 'other-tab':
      return `Meeting ${page.code ?? ''} is already being recorded in another tab.`;
    case 'no-meeting':
      return 'This Meet page is not a meeting. Join a call and attendance is recorded automatically.';
    default:
      return 'Not in a meeting. Join a Meet call and attendance is recorded automatically. If a call is already open in this tab, reload the tab: Chrome only starts Attendly in tabs opened after it was installed or updated.';
  }
}
