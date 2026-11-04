/**
 * Typed messages between the content script, service worker, popup and dashboard, with
 * runtime validation: the service worker never trusts message shapes blindly.
 */
import type {
  LiveStatus,
  MeetingRecord,
  PageState,
  PageStatus,
  ParticipantRecord,
  Session,
} from './types';

/** Fields of a meeting owned by the live tracker (the rest are user-edited in the dashboard). */
export type LiveMeetingFields = Pick<
  MeetingRecord,
  'id' | 'code' | 'detectedTitle' | 'startedAt' | 'lastSeenAt' | 'participants' | 'paused'
>;

export type Message =
  /** content → SW: a call was joined. SW returns StartReply. */
  | {
      type: 'meeting:start';
      code: string;
      detectedTitle: string | null;
      at: number;
      /** Meeting this tab was tracking before the worker asked it to restart. */
      resumeId: string | null;
    }
  /** content → SW: incremental save of tracker state. */
  | { type: 'meeting:save'; meeting: LiveMeetingFields }
  /** content → SW: the call ended (participants already finalised). */
  | { type: 'meeting:end'; meeting: LiveMeetingFields; endedAt: number }
  /** content → SW: what the tab sees while it isn't tracking (for the popup). */
  | { type: 'page:status'; state: PageState; code: string | null }
  /** popup → SW: page status for a tab. Returns PageStatus | null. */
  | { type: 'page:get'; tabId: number }
  /** popup → SW: live status for a tab. Returns LiveStatus | null. */
  | { type: 'live:get'; tabId: number }
  /** popup → SW → content: pause/resume tracking in a tab. */
  | { type: 'live:setPaused'; tabId: number; paused: boolean }
  /** SW → content: apply pause state. */
  | { type: 'tracking:setPaused'; paused: boolean }
  /** SW → extension pages: data changed, refresh. */
  | { type: 'db:changed' };

export type StartReply = StartAccepted | { meetingId: null; reason: 'secondary-tab' };

export interface StartAccepted {
  meetingId: string;
  /** Participants to resume from when the same call is rejoined shortly after leaving. */
  participants: ParticipantRecord[];
  startedAt: number;
  paused: boolean;
}

/**
 * Reply to meeting:save. `restart` means the stored meeting is gone (deleted, replaced by a
 * restore) or was closed (e.g. as abandoned after the computer slept): the content script must
 * stop saving into it and start again via meeting:start.
 */
export type SaveReply = { ok: true } | { ok: false; restart: true };

export type LiveGetReply = LiveStatus | null;
export type PageGetReply = PageStatus | null;

const PAGE_STATES: readonly PageState[] = [
  'no-meeting',
  'waiting-to-join',
  'tracking-off',
  'other-tab',
];

// ------------------------------------------------------------------------------- validation

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullableStr = (v: unknown, max = 500): v is string | null => v === null || isStr(v, max);

/** Meet codes look like abc-defg-hij; also accept lookup-style codes (letters/digits/dashes). */
export const MEET_CODE_RE = /^[a-z0-9][a-z0-9-]{2,62}$/i;

function isSession(v: unknown): v is Session {
  return isObj(v) && isNum(v.joinedAt) && (v.leftAt === null || isNum(v.leftAt));
}

/** Participant keys are "<normalised name>#<avatar hash or 0>" with an optional "~n" suffix. */
export const PARTICIPANT_KEY_RE = /#(0|[0-9a-f]{1,8})(~\d{1,4})?$/;

export function isParticipant(v: unknown): v is ParticipantRecord {
  return (
    isObj(v) &&
    isStr(v.key, 1_200) &&
    PARTICIPANT_KEY_RE.test(v.key) &&
    isStr(v.name, 1_000) &&
    isNullableStr(v.avatarUrl, 2_000) &&
    typeof v.isSelf === 'boolean' &&
    (v.missingSince === null || isNum(v.missingSince)) &&
    Array.isArray(v.sessions) &&
    v.sessions.length <= 10_000 &&
    v.sessions.every(isSession)
  );
}

export function isLiveMeetingFields(v: unknown): v is LiveMeetingFields {
  return (
    isObj(v) &&
    isStr(v.id, 100) &&
    isStr(v.code, 64) &&
    MEET_CODE_RE.test(v.code) &&
    isNullableStr(v.detectedTitle, 500) &&
    isNum(v.startedAt) &&
    isNum(v.lastSeenAt) &&
    typeof v.paused === 'boolean' &&
    Array.isArray(v.participants) &&
    v.participants.length <= 5_000 &&
    v.participants.every(isParticipant) &&
    new Set(v.participants.map((p) => p.key)).size === v.participants.length
  );
}

export function isMessage(v: unknown): v is Message {
  if (!isObj(v) || typeof v.type !== 'string') return false;
  switch (v.type) {
    case 'meeting:start':
      return (
        isStr(v.code, 64) &&
        MEET_CODE_RE.test(v.code) &&
        isNullableStr(v.detectedTitle) &&
        isNum(v.at) &&
        isNullableStr(v.resumeId, 100)
      );
    case 'meeting:save':
      return isLiveMeetingFields(v.meeting);
    case 'meeting:end':
      return isLiveMeetingFields(v.meeting) && isNum(v.endedAt);
    case 'page:status':
      return (
        typeof v.state === 'string' &&
        (PAGE_STATES as readonly string[]).includes(v.state) &&
        (v.code === null || (isStr(v.code, 64) && MEET_CODE_RE.test(v.code)))
      );
    case 'page:get':
      return isNum(v.tabId);
    case 'live:get':
      return isNum(v.tabId);
    case 'live:setPaused':
      return isNum(v.tabId) && typeof v.paused === 'boolean';
    case 'tracking:setPaused':
      return typeof v.paused === 'boolean';
    case 'db:changed':
      return true;
    default:
      return false;
  }
}

/** sendMessage that resolves to undefined instead of throwing when nobody is listening. */
export async function sendRuntimeMessage<R = unknown>(msg: Message): Promise<R | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as R;
  } catch {
    return undefined;
  }
}
