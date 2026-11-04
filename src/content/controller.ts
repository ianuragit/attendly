/**
 * Content-script controller: watches the Meet page, drives the pure tracker and streams
 * incremental saves to the service worker. All DOM reading goes through selectors.ts.
 */
import { log } from '../lib/log';
import type { LiveMeetingFields, Message, SaveReply, StartReply } from '../lib/messages';
import { mergeSources, resolveSelf } from '../lib/participants';
import { getSettings, onSettingsChanged } from '../lib/settings';
import type { PageState, Settings, SnapshotEntry, TrackerState } from '../lib/types';
import {
  findPeopleButton,
  findPeopleList,
  isInCall,
  meetingCodeFromPath,
  readMeetingTitle,
  readParticipantCount,
  readPeoplePanel,
  readTiles,
  warnOnce,
} from './selectors';
import { applySnapshot, createTrackerState, finalizeTracker, presentCount } from './tracker';

/** How long the in-call UI may be missing before we decide the call ended. */
const END_GRACE_MS = 15_000;
/** Minimum spacing between DOM scans triggered by mutations. */
const MIN_SCAN_GAP_MS = 1_000;
/** Send a heartbeat save at least this often even when nothing changed. */
const HEARTBEAT_MS = 15_000;
/**
 * If scans stop for this long (computer asleep, tab frozen), nobody was being observed: close
 * everyone's session at the last scan instead of crediting the gap. Above Chrome's 1-minute
 * background-timer throttling so a throttled tab doesn't produce bogus leave/rejoin pairs.
 */
const GAP_MS = 150_000;
/** A tab that found the call already tracked in another tab re-checks this often. */
const SECONDARY_RETRY_MS = 30_000;

interface ActiveCall {
  id: string;
  code: string;
  startedAt: number;
  detectedTitle: string | null;
  tracker: TrackerState;
  lastInCallAt: number;
  lastSavedAt: number;
  lastSavedJson: string;
  paused: boolean;
  emptyScans: number;
  /** We opened the People panel ourselves; don't fight the user if they close it. */
  autoOpenedPanel: boolean;
}

export class MeetController {
  private settings: Settings | null = null;
  private call: ActiveCall | null = null;
  private starting = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: MutationObserver | null = null;
  private lastScanAt = 0;
  private scanQueued = false;
  private stopped = false;
  /** Meeting to resume after the worker asked us to restart. */
  private resumeId: string | null = null;
  /** While another tab tracks this call, don't ask to start again before this time. */
  private passiveUntil = 0;
  /** Last page state reported to the worker while not tracking. */
  private lastPage: { state: PageState; code: string | null; at: number } | null = null;
  /** When we first saw what looks like a call without finding the leave button. */
  private looksLikeCallSince: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  async start(): Promise<void> {
    this.settings = await getSettings();
    onSettingsChanged((s) => {
      const intervalChanged = s.pollIntervalMs !== this.settings?.pollIntervalMs;
      this.settings = s;
      if (!s.autoTrack && this.call) void this.endCall(this.now());
      if (intervalChanged) this.schedulePoll();
    });

    chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id) return;
      const m = msg as Message;
      if (
        m &&
        typeof m === 'object' &&
        m.type === 'tracking:setPaused' &&
        typeof m.paused === 'boolean'
      ) {
        this.setPaused(m.paused);
        sendResponse({ ok: true });
      }
    });

    // Finalise when the tab is closed or navigated away. The service worker also finalises
    // on tab removal, so this is best-effort.
    window.addEventListener('pagehide', () => {
      if (this.call) void this.endCall(this.now());
    });

    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: false });
    this.schedulePoll();
    this.queueScan();
  }

  /**
   * The extension was reloaded or updated: this script is orphaned and can no longer reach the
   * worker. Stop observing so it doesn't spin forever; the new version takes over on reload.
   */
  private orphaned(): boolean {
    if (this.stopped) return true;
    if (chrome.runtime?.id) return false;
    this.stopped = true;
    this.observer?.disconnect();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.call = null;
    // Info, not a warning: this is expected after an update and isn't an error in the new copy.
    log.info('Attendly was reloaded or updated. Reload this Meet tab to resume tracking.');
    return true;
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const interval = this.settings?.pollIntervalMs ?? 5_000;
    this.pollTimer = setTimeout(() => {
      void this.scan().finally(() => this.schedulePoll());
    }, interval);
  }

  /** Coalesces bursts of DOM mutations into at most one scan per MIN_SCAN_GAP_MS. */
  private queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    const wait = Math.max(0, this.lastScanAt + MIN_SCAN_GAP_MS - this.now());
    setTimeout(() => {
      this.scanQueued = false;
      void this.scan();
    }, wait);
  }

  private setPaused(paused: boolean): void {
    const call = this.call;
    if (!call || call.paused === paused) return;
    const now = this.now();
    call.paused = paused;
    // Pausing closes open sessions: paused time is not counted for anyone.
    if (paused) call.tracker = finalizeTracker(call.tracker, now);
    void this.save(now, true);
  }

  async scan(): Promise<void> {
    if (this.orphaned()) return;
    this.lastScanAt = this.now();
    const settings = this.settings;
    if (!settings) return;
    const now = this.now();
    const code = meetingCodeFromPath(location.pathname);
    const inCall = code !== null && isInCall();

    if (this.call) {
      if (code !== this.call.code) {
        await this.endCall(this.call.lastInCallAt); // navigated to another meeting
      } else if (!inCall) {
        if (now - this.call.lastInCallAt >= END_GRACE_MS)
          await this.endCall(this.call.lastInCallAt);
        return;
      }
    }

    if (!this.call) {
      const state: PageState | null = !code
        ? 'no-meeting'
        : !settings.autoTrack
          ? 'tracking-off'
          : now < this.passiveUntil
            ? 'other-tab'
            : !inCall
              ? 'waiting-to-join'
              : null;
      if (state !== null || !code) {
        this.reportPage(state ?? 'no-meeting', code, now);
        this.checkUndetectedCall(state === 'waiting-to-join', now);
        return;
      }
      await this.beginCall(code, now);
      if (!this.call) return;
      this.lastPage = null;
      this.looksLikeCallSince = null;
    }
    if (!settings.autoTrack) return;

    const call: ActiveCall = this.call;
    call.lastInCallAt = now;
    call.detectedTitle = readMeetingTitle() ?? call.detectedTitle;
    if (!call.paused) {
      const { entries, complete } = this.readParticipants(settings, call);
      if (entries.length === 0) {
        call.emptyScans++;
        if (call.emptyScans === 3) {
          warnOnce(
            'no-participants',
            'In a call but no participants were detected. Meet may have changed its layout; see selectors.ts.',
          );
        }
      } else {
        call.emptyScans = 0;
      }
      // An empty read is almost certainly a detection failure (you are always in your own
      // call), so don't let it mark everyone as having left.
      const lastTick = call.tracker.lastTickAt;
      if (lastTick !== null && now - lastTick > GAP_MS) {
        log.info(
          `No scans for ${Math.round((now - lastTick) / 1000)}s; closing sessions at the last scan.`,
        );
        call.tracker = finalizeTracker(call.tracker, lastTick);
      }
      if (entries.length > 0) {
        call.tracker = applySnapshot(call.tracker, entries, now, {
          leaveDebounceMs: 10_000,
          complete,
        });
      }
    }
    await this.save(now, false);
  }

  /** Tells the worker (for the popup) what this tab sees while it isn't tracking. */
  private reportPage(state: PageState, code: string | null, now: number): void {
    const prev = this.lastPage;
    const changed = !prev || prev.state !== state || prev.code !== code;
    if (!changed && now - prev.at < 30_000) return;
    this.lastPage = { state, code, at: now };
    if (changed) {
      const why: Record<PageState, string> = {
        'no-meeting': 'Not on a meeting page.',
        'waiting-to-join': `On meeting page ${code ?? ''}; waiting until you join the call (leave-call button not seen yet).`,
        'tracking-off': 'Automatic tracking is turned off in Settings.',
        'other-tab': `Meeting ${code ?? ''} is already being tracked in another tab.`,
      };
      log.info(why[state]);
    }
    chrome.runtime
      .sendMessage({ type: 'page:status', state, code } satisfies Message)
      .catch(() => this.orphaned());
  }

  /**
   * On a meeting page, video tiles but no leave-call button for a while most likely means Meet
   * changed its controls: say so once, clearly, instead of silently recording nothing.
   */
  private checkUndetectedCall(waiting: boolean, now: number): void {
    const tiles = waiting ? readTiles().entries.length : 0;
    if (tiles === 0) {
      this.looksLikeCallSince = null;
      return;
    }
    this.looksLikeCallSince ??= now;
    if (now - this.looksLikeCallSince > 30_000) {
      warnOnce(
        'undetected-call',
        `Participant tiles are visible (${tiles}) but the leave-call button was not found, so tracking hasn't started. ` +
          'Meet may have changed its layout; please report this (see docs/troubleshooting.md).',
      );
    }
  }

  private readParticipants(
    settings: Settings,
    call: ActiveCall,
  ): { entries: SnapshotEntry[]; complete: boolean } {
    const tiles = readTiles();
    let panel = readPeoplePanel();
    const total = readParticipantCount();

    const tilesIncomplete = tiles.overflow || (total !== null && tiles.entries.length < total);
    if (!panel && tilesIncomplete && settings.peoplePanelMode === 'auto' && !call.autoOpenedPanel) {
      const button = findPeopleButton();
      if (button) {
        call.autoOpenedPanel = true;
        log.info('Opening the People panel to see participants without a visible tile.');
        button.click();
        panel = readPeoplePanel();
      } else {
        warnOnce(
          'no-people-button',
          'Could not find the People button; large calls may be incomplete.',
        );
      }
    }

    const sources = panel ? [panel, tiles.entries] : [tiles.entries];
    const { entries, ambiguous } = resolveSelf(mergeSources(sources));
    if (ambiguous)
      warnOnce(
        'multi-self',
        'More than one participant looked like you; ignoring the self marker.',
      );
    // Complete when the panel is open (it lists everyone) or when the tiles cover the count.
    const complete =
      (panel !== null && findPeopleList() !== null) ||
      (!tiles.overflow && (total === null || entries.length >= total));
    return { entries, complete };
  }

  private async beginCall(code: string, now: number): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      const detectedTitle = readMeetingTitle();
      const reply = (await chrome.runtime.sendMessage({
        type: 'meeting:start',
        code,
        detectedTitle,
        at: now,
        resumeId: this.resumeId,
      } satisfies Message)) as StartReply | undefined;
      if (reply?.meetingId === null && reply.reason === 'secondary-tab') {
        this.passiveUntil = now + SECONDARY_RETRY_MS;
        warnOnce(
          'secondary-tab',
          'This call is already being tracked in another tab; this tab stays passive.',
        );
        return;
      }
      if (!reply?.meetingId) {
        warnOnce('start-failed', 'Service worker did not acknowledge the meeting start.');
        return;
      }
      this.resumeId = null;
      const tracker = createTrackerState();
      for (const p of reply.participants) tracker.participants[p.key] = p;
      this.call = {
        id: reply.meetingId,
        code,
        startedAt: reply.startedAt,
        detectedTitle,
        tracker,
        lastInCallAt: now,
        lastSavedAt: 0,
        lastSavedJson: '',
        paused: reply.paused,
        emptyScans: 0,
        autoOpenedPanel: false,
      };
      log.info(`Tracking meeting ${code}`);
    } catch (err) {
      if (!this.orphaned()) log.error('Failed to start tracking', err);
    } finally {
      this.starting = false;
    }
  }

  private fields(call: ActiveCall, at: number): LiveMeetingFields {
    return {
      id: call.id,
      code: call.code,
      detectedTitle: call.detectedTitle,
      startedAt: call.startedAt,
      lastSeenAt: at,
      participants: Object.values(call.tracker.participants),
      paused: call.paused,
    };
  }

  private async save(now: number, force: boolean): Promise<void> {
    const call = this.call;
    if (!call) return;
    const meeting = this.fields(call, now);
    const json =
      JSON.stringify(meeting.participants) + String(meeting.paused) + (meeting.detectedTitle ?? '');
    if (!force && json === call.lastSavedJson && now - call.lastSavedAt < HEARTBEAT_MS) return;
    call.lastSavedJson = json;
    call.lastSavedAt = now;
    try {
      const reply = (await chrome.runtime.sendMessage({
        type: 'meeting:save',
        meeting,
      } satisfies Message)) as SaveReply | null | undefined;
      if (reply && !reply.ok && reply.restart && this.call === call) {
        // The stored meeting was closed or deleted; start again (resuming it if it still exists).
        log.info('Meeting was closed or removed elsewhere; restarting tracking.');
        this.resumeId = call.id;
        this.call = null;
      }
    } catch (err) {
      if (!this.orphaned()) log.warn('Could not save meeting', err);
    }
  }

  private async endCall(endedAt: number): Promise<void> {
    const call = this.call;
    if (!call) return;
    this.call = null;
    call.tracker = finalizeTracker(call.tracker, endedAt);
    const meeting = this.fields(call, endedAt);
    try {
      await chrome.runtime.sendMessage({ type: 'meeting:end', meeting, endedAt } satisfies Message);
      log.info(`Meeting ${call.code} ended`);
    } catch (err) {
      if (!this.orphaned()) log.warn('Could not finalise meeting', err);
    }
  }

  /** For tests/debugging. */
  get liveCount(): number {
    return this.call ? presentCount(this.call.tracker) : 0;
  }
}
