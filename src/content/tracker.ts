/**
 * Attendly's join/leave/rejoin state machine.
 *
 * Everything here is a pure function of (previous state, participant snapshot, timestamp):
 * no DOM, no clock, no chrome.* APIs. The content script feeds it snapshots; tests feed it
 * hand-written ones.
 *
 * Rules
 * - A participant seen for the first time opens a session at `now`.
 * - A participant who disappears is marked `missingSince = now` but their session stays open.
 *   If they reappear within `leaveDebounceMs`, nothing happened (tile flicker, grid reshuffle).
 *   If they're still missing after the debounce window, the session is closed with
 *   `leftAt = missingSince` — the moment they actually vanished, not the moment we gave up.
 * - A participant who reappears after their session was closed opens a new session (rejoin).
 * - Identity is the participant key (normalised name + avatar hash). A snapshot entry whose
 *   avatar is unknown is matched to an existing same-name record so a person doesn't split in
 *   two when the avatar is visible in one DOM source but not another.
 */
import {
  keyAvatar,
  keyName,
  normalizeAvatarUrl,
  normalizeName,
  participantKey,
} from '../lib/participants';
import type { ParticipantRecord, SnapshotEntry, Timestamp, TrackerState } from '../lib/types';

export interface TrackerOptions {
  /** How long a participant may be missing before it counts as leaving. */
  leaveDebounceMs: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = { leaveDebounceMs: 10_000 };

export function createTrackerState(): TrackerState {
  return { participants: {}, lastTickAt: null };
}

const isOpen = (p: ParticipantRecord): boolean => {
  const last = p.sessions[p.sessions.length - 1];
  return last !== undefined && last.leftAt === null;
};

const cloneRecord = (p: ParticipantRecord): ParticipantRecord => ({
  ...p,
  sessions: p.sessions.map((s) => ({ ...s })),
});

/** Finds the existing record a snapshot entry belongs to, or null for a new person. */
function resolveRecord(
  entry: SnapshotEntry,
  records: Record<string, ParticipantRecord>,
  claimed: Set<string>,
): ParticipantRecord | null {
  const norm = normalizeName(entry.name);
  const avatar = participantKey(entry.name, entry.avatarUrl).split('#').pop() ?? '0';
  const candidates = Object.values(records).filter(
    (r) =>
      !claimed.has(r.key) &&
      keyName(r.key) === norm &&
      (keyAvatar(r.key) === avatar ||
        avatar === '0' ||
        (keyAvatar(r.key) === '0' && !hasDifferentAvatar(r, entry))),
  );
  if (candidates.length === 0) return null;
  // Prefer: exact avatar match, then currently open sessions, then most recently active.
  const score = (r: ParticipantRecord): number =>
    (keyAvatar(r.key) === avatar ? 4 : 0) +
    (isOpen(r) ? 2 : 0) +
    (r.avatarUrl === null || avatar === '0' ? 0 : 1);
  const lastActivity = (r: ParticipantRecord): number => {
    const last = r.sessions[r.sessions.length - 1];
    return last ? (last.leftAt ?? Number.POSITIVE_INFINITY) : 0;
  };
  return (
    candidates.sort((a, b) => score(b) - score(a) || lastActivity(b) - lastActivity(a))[0] ?? null
  );
}

function hasDifferentAvatar(r: ParticipantRecord, entry: SnapshotEntry): boolean {
  const a = normalizeAvatarUrl(r.avatarUrl);
  const b = normalizeAvatarUrl(entry.avatarUrl);
  return a !== null && b !== null && a !== b;
}

function uniqueKey(base: string, records: Record<string, ParticipantRecord>): string {
  if (!(base in records)) return base;
  let n = 2;
  while (`${base}~${n}` in records) n++;
  return `${base}~${n}`;
}

/**
 * Applies one DOM snapshot taken at `now`. Returns a new state; `prev` is not mutated.
 * Snapshots with a timestamp older than the last applied one are ignored.
 */
export function applySnapshot(
  prev: TrackerState,
  snapshot: readonly SnapshotEntry[],
  now: Timestamp,
  options: TrackerOptions = DEFAULT_TRACKER_OPTIONS,
): TrackerState {
  if (prev.lastTickAt !== null && now < prev.lastTickAt) return prev;

  const records: Record<string, ParticipantRecord> = {};
  for (const [k, p] of Object.entries(prev.participants)) records[k] = cloneRecord(p);

  const claimed = new Set<string>();
  for (const entry of snapshot) {
    const name = entry.name.trim();
    if (!name) continue;
    let record = resolveRecord(entry, records, claimed);
    if (!record) {
      const key = uniqueKey(participantKey(name, entry.avatarUrl), records);
      record = {
        key,
        name,
        avatarUrl: normalizeAvatarUrl(entry.avatarUrl),
        isSelf: entry.isSelf,
        sessions: [],
        missingSince: null,
      };
      records[key] = record;
    } else {
      record.name = name;
      record.avatarUrl ??= normalizeAvatarUrl(entry.avatarUrl);
      record.isSelf ||= entry.isSelf;
    }
    claimed.add(record.key);

    if (isOpen(record)) {
      record.missingSince = null; // flicker or still here: keep the session running
    } else {
      record.sessions.push({ joinedAt: now, leftAt: null });
      record.missingSince = null;
    }
  }

  for (const record of Object.values(records)) {
    if (claimed.has(record.key) || !isOpen(record)) continue;
    record.missingSince ??= now;
    if (now - record.missingSince >= options.leaveDebounceMs) {
      closeOpenSession(record, record.missingSince);
    }
  }

  return { participants: records, lastTickAt: now };
}

function closeOpenSession(record: ParticipantRecord, at: Timestamp): void {
  const last = record.sessions[record.sessions.length - 1];
  if (last && last.leftAt === null) last.leftAt = Math.max(at, last.joinedAt);
  record.missingSince = null;
}

/**
 * Closes every open session, e.g. when the call ends or tracking is paused. Participants who
 * were already missing are closed at the moment they went missing.
 */
export function finalizeTracker(prev: TrackerState, endedAt: Timestamp): TrackerState {
  const records: Record<string, ParticipantRecord> = {};
  for (const [k, p] of Object.entries(prev.participants)) {
    const record = cloneRecord(p);
    if (isOpen(record)) closeOpenSession(record, record.missingSince ?? endedAt);
    records[k] = record;
  }
  return { participants: records, lastTickAt: Math.max(prev.lastTickAt ?? endedAt, endedAt) };
}

/** Number of participants currently present (open session, including debounced ones). */
export function presentCount(state: TrackerState, excludeSelf = false): number {
  return Object.values(state.participants).filter((p) => isOpen(p) && !(excludeSelf && p.isSelf))
    .length;
}
