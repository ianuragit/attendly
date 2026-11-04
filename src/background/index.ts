/**
 * Service worker: owns persistence, live status, the toolbar badge and message routing.
 *
 * Data-loss guarantees: the content script saves every scan (≤ poll interval, default 5s).
 * If the tab is closed the meeting is finalised from its last save. If the browser crashes,
 * active meetings with no save for STALE_AFTER_MS are closed at their last save the next time
 * the worker starts.
 */
import * as db from '../lib/db';
import { log } from '../lib/log';
import { closeStale, findResumable, mergeLive, newMeeting, STALE_AFTER_MS } from '../lib/meetings';
import { isMessage, type LiveMeetingFields, type Message, type StartReply } from '../lib/messages';
import { getSettings } from '../lib/settings';
import type { LiveStatus, MeetingRecord } from '../lib/types';

const LIVE_KEY = 'live'; // chrome.storage.session: Record<tabId, LiveStatus>

type LiveMap = Record<string, LiveStatus>;

async function getLiveMap(): Promise<LiveMap> {
  const stored = await chrome.storage.session.get(LIVE_KEY);
  return (stored[LIVE_KEY] as LiveMap | undefined) ?? {};
}

// Serialise live-map writes so concurrent messages don't clobber each other.
let liveQueue: Promise<unknown> = Promise.resolve();
function updateLiveMap(fn: (map: LiveMap) => LiveMap): Promise<void> {
  const next = liveQueue.then(async () => {
    const map = fn(await getLiveMap());
    await chrome.storage.session.set({ [LIVE_KEY]: map });
  });
  liveQueue = next.catch(() => undefined);
  return next;
}

function withoutTab(map: LiveMap, tabId: number): LiveMap {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k !== String(tabId)));
}

async function setBadge(tabId: number, status: LiveStatus | null): Promise<void> {
  try {
    if (!status) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    await chrome.action.setBadgeText({
      tabId,
      text: status.paused ? '❚❚' : String(Math.min(status.presentCount, 999)),
    });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: status.paused ? '#64748b' : '#2459b8',
    });
    await chrome.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
  } catch {
    // Tab already gone.
  }
}

function notifyPages(): void {
  chrome.runtime.sendMessage({ type: 'db:changed' } satisfies Message).catch(() => undefined);
}

async function liveCount(m: LiveMeetingFields): Promise<number> {
  const { excludeSelf } = await getSettings();
  return m.participants.filter(
    (p) => p.sessions.some((s) => s.leftAt === null) && !(excludeSelf && p.isSelf),
  ).length;
}

// ---------------------------------------------------------------------------------- handlers

async function handleStart(
  tabId: number,
  code: string,
  detectedTitle: string | null,
  at: number,
): Promise<StartReply> {
  const sameCode = await db.listMeetingsByCode(code);
  const live = await getLiveMap();
  const liveIds = new Set(
    Object.entries(live)
      .filter(([t]) => Number(t) !== tabId)
      .map(([, s]) => s.meetingId),
  );
  const resumable = findResumable(
    sameCode.filter((m) => !liveIds.has(m.id)),
    at,
  );

  let meeting: MeetingRecord;
  if (resumable) {
    meeting = { ...resumable, status: 'active', endedAt: null, lastSeenAt: at };
    log.info(`Resuming meeting ${code} (${meeting.id})`);
  } else {
    const group = await db.findGroupForCode(code);
    meeting = newMeeting(crypto.randomUUID(), code, detectedTitle, at, group?.id ?? null);
  }
  await db.putMeeting(meeting);

  const status: LiveStatus = {
    meetingId: meeting.id,
    code,
    startedAt: meeting.startedAt,
    presentCount: 0,
    paused: meeting.paused,
    updatedAt: at,
  };
  await updateLiveMap((map) => ({ ...map, [tabId]: status }));
  await setBadge(tabId, status);
  notifyPages();
  return {
    meetingId: meeting.id,
    participants: meeting.participants,
    startedAt: meeting.startedAt,
    paused: meeting.paused,
  };
}

async function handleSave(
  tabId: number,
  live: LiveMeetingFields,
  endedAt: number | null,
): Promise<void> {
  const stored = await db.updateMeeting(live.id, (m) => {
    if (m.code !== live.code) return null; // never let a tab overwrite another meeting
    return mergeLive(m, live, endedAt);
  });
  if (!stored) {
    log.warn('Save for unknown meeting ignored', live.id);
    return;
  }
  if (endedAt === null) {
    const status: LiveStatus = {
      meetingId: live.id,
      code: live.code,
      startedAt: stored.startedAt,
      presentCount: await liveCount(live),
      paused: live.paused,
      updatedAt: live.lastSeenAt,
    };
    await updateLiveMap((map) => ({ ...map, [tabId]: status }));
    await setBadge(tabId, status);
  } else {
    await updateLiveMap((map) =>
      map[tabId]?.meetingId === live.id ? withoutTab(map, tabId) : map,
    );
    await setBadge(tabId, null);
  }
  notifyPages();
}

/** Tab closed or crashed: finalise its meeting from the last save. */
async function handleTabGone(tabId: number): Promise<void> {
  const status = (await getLiveMap())[tabId];
  if (!status) return;
  await updateLiveMap((map) => withoutTab(map, tabId));
  await db.updateMeeting(status.meetingId, (m) => (m.status === 'active' ? closeStale(m) : null));
  notifyPages();
}

/** Closes meetings left "active" by a crash or a killed browser. */
async function sweepStale(): Promise<void> {
  const now = Date.now();
  const live = await getLiveMap();
  const liveIds = new Set(Object.values(live).map((s) => s.meetingId));
  const active = await db.listMeetingsByStatus('active');
  let changed = false;
  for (const m of active) {
    if (liveIds.has(m.id) && now - m.lastSeenAt < STALE_AFTER_MS) continue;
    if (now - m.lastSeenAt < STALE_AFTER_MS) continue;
    await db.updateMeeting(m.id, (cur) => (cur.status === 'active' ? closeStale(cur) : null));
    changed = true;
  }
  if (changed) notifyPages();
}

// ---------------------------------------------------------------------------------- wiring

const isMeetSender = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id &&
  sender.tab?.id !== undefined &&
  typeof sender.url === 'string' &&
  sender.url.startsWith('https://meet.google.com/');

const isExtensionPage = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id &&
  typeof sender.url === 'string' &&
  sender.url.startsWith(chrome.runtime.getURL(''));

async function route(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'meeting:start':
      if (!isMeetSender(sender) || sender.tab?.id === undefined) return null;
      return handleStart(sender.tab.id, msg.code.toLowerCase(), msg.detectedTitle, msg.at);
    case 'meeting:save':
      if (!isMeetSender(sender) || sender.tab?.id === undefined) return null;
      await handleSave(sender.tab.id, msg.meeting, null);
      return { ok: true };
    case 'meeting:end':
      if (!isMeetSender(sender) || sender.tab?.id === undefined) return null;
      await handleSave(sender.tab.id, msg.meeting, msg.endedAt);
      return { ok: true };
    case 'live:get': {
      if (!isExtensionPage(sender)) return null;
      return (await getLiveMap())[msg.tabId] ?? null;
    }
    case 'live:setPaused': {
      if (!isExtensionPage(sender)) return null;
      if (!(await getLiveMap())[msg.tabId]) return { ok: false };
      await chrome.tabs.sendMessage(msg.tabId, {
        type: 'tracking:setPaused',
        paused: msg.paused,
      } satisfies Message);
      return { ok: true };
    }
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isMessage(msg)) return false;
  if (msg.type === 'db:changed' || msg.type === 'tracking:setPaused') return false;
  route(msg, sender)
    .then(sendResponse)
    .catch((err: unknown) => {
      log.error('Message handling failed', msg.type, err);
      sendResponse(null);
    });
  return true; // async response
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleTabGone(tabId);
});

chrome.runtime.onInstalled.addListener((details) => {
  log.info('installed', details.reason);
  void sweepStale();
});
chrome.runtime.onStartup.addListener(() => {
  // A fresh browser session: no tabs from before can still be live.
  void chrome.storage.session.remove(LIVE_KEY).then(sweepStale);
});
void sweepStale();
