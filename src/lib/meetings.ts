/**
 * Pure helpers that build and merge MeetingRecords. Kept free of storage so they can be tested.
 */
import type { LiveMeetingFields } from './messages';
import type { MeetingRecord, Timestamp } from './types';

/** A call rejoined within this window continues the previous record instead of starting anew. */
export const RESUME_WINDOW_MS = 5 * 60_000;

/** Active meetings with no save for this long are considered abandoned (crash, killed tab). */
export const STALE_AFTER_MS = 3 * 60_000;

export function newMeeting(
  id: string,
  code: string,
  detectedTitle: string | null,
  at: Timestamp,
  groupId: string | null,
): MeetingRecord {
  return {
    id,
    code,
    detectedTitle,
    customTitle: null,
    notes: '',
    startedAt: at,
    endedAt: null,
    lastSeenAt: at,
    status: 'active',
    groupId,
    participants: [],
    manualMarks: {},
    paused: false,
    schemaVersion: 1,
  };
}

/**
 * Picks a recent meeting with the same code to resume, if any: ended (or abandoned) no more
 * than RESUME_WINDOW_MS before `at`.
 */
export function findResumable(
  candidates: readonly MeetingRecord[],
  at: Timestamp,
): MeetingRecord | undefined {
  return candidates
    .filter((m) => at - (m.endedAt ?? m.lastSeenAt) <= RESUME_WINDOW_MS && m.startedAt <= at)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];
}

/** Applies tracker-owned fields to a stored meeting, keeping user edits intact. */
export function mergeLive(
  stored: MeetingRecord,
  live: LiveMeetingFields,
  end: Timestamp | null,
): MeetingRecord {
  return {
    ...stored,
    detectedTitle: live.detectedTitle ?? stored.detectedTitle,
    lastSeenAt: Math.max(stored.lastSeenAt, live.lastSeenAt),
    participants: live.participants,
    paused: live.paused,
    status: end === null ? 'active' : 'ended',
    endedAt: end,
  };
}

/** Closes an abandoned meeting at its last save; open sessions end there too. */
export function closeStale(m: MeetingRecord): MeetingRecord {
  const end = m.lastSeenAt;
  return {
    ...m,
    status: 'ended',
    endedAt: end,
    participants: m.participants.map((p) => ({
      ...p,
      missingSince: null,
      sessions: p.sessions.map((s) =>
        s.leftAt === null ? { ...s, leftAt: Math.max(s.joinedAt, p.missingSince ?? end) } : s,
      ),
    })),
  };
}
