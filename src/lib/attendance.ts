/**
 * Pure attendance maths over participant timelines: durations, presence, summaries.
 */
import type {
  ManualMark,
  MeetingRecord,
  ParticipantRecord,
  Session,
  Settings,
  Timestamp,
} from './types';

export interface ParticipantSummary {
  key: string;
  name: string;
  avatarUrl: string | null;
  isSelf: boolean;
  firstJoin: Timestamp | null;
  /** null while still present (or never joined). */
  lastLeave: Timestamp | null;
  totalMs: number;
  sessionCount: number;
  presentNow: boolean;
  manualMark: ManualMark | null;
  /** Final verdict after applying the minimum-duration rule and any manual mark. */
  present: boolean;
}

/**
 * Total time covered by the sessions. Open sessions run until `now`. Overlapping sessions
 * (which the tracker never produces, but imported data might) are not double counted.
 */
export function totalPresentMs(sessions: readonly Session[], now: Timestamp): number {
  const intervals = sessions
    .map((s) => [s.joinedAt, s.leftAt ?? now] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart: number | null = null;
  let curEnd = 0;
  for (const [a, b] of intervals) {
    if (curStart === null || a > curEnd) {
      if (curStart !== null) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else {
      curEnd = Math.max(curEnd, b);
    }
  }
  if (curStart !== null) total += curEnd - curStart;
  return total;
}

export function summarizeParticipant(
  p: ParticipantRecord,
  now: Timestamp,
  minPresentMs: number,
  manualMark: ManualMark | null = null,
): ParticipantSummary {
  const sessions = p.sessions;
  const presentNow = sessions.some((s) => s.leftAt === null);
  const firstJoin = sessions.length ? Math.min(...sessions.map((s) => s.joinedAt)) : null;
  const lastLeave =
    presentNow || sessions.length === 0 ? null : Math.max(...sessions.map((s) => s.leftAt ?? 0));
  const totalMs = totalPresentMs(sessions, now);
  const present = manualMark ? manualMark === 'present' : totalMs >= minPresentMs;
  return {
    key: p.key,
    name: p.name,
    avatarUrl: p.avatarUrl,
    isSelf: p.isSelf,
    firstJoin,
    lastLeave,
    totalMs,
    sessionCount: sessions.length,
    presentNow,
    manualMark,
    present,
  };
}

/**
 * Manual mark for a participant. Uses an own-property check so keys such as "constructor" or
 * "toString" (possible in imported data) don't resolve to Object.prototype members.
 */
export function markFor(
  meeting: Pick<MeetingRecord, 'manualMarks'>,
  key: string,
): ManualMark | null {
  if (!Object.hasOwn(meeting.manualMarks, key)) return null;
  const mark = meeting.manualMarks[key];
  return mark === 'present' || mark === 'absent' ? mark : null;
}

/** The time "now" means for a meeting: its end if ended, otherwise the given clock. */
export function meetingNow(meeting: MeetingRecord, clock: Timestamp): Timestamp {
  return meeting.endedAt ?? Math.max(clock, meeting.lastSeenAt);
}

export function meetingDurationMs(meeting: MeetingRecord, clock: Timestamp): number {
  return Math.max(0, meetingNow(meeting, clock) - meeting.startedAt);
}

/** Attendee summaries for a meeting, honouring the exclude-self and min-duration settings. */
export function summarizeMeeting(
  meeting: MeetingRecord,
  settings: Pick<Settings, 'excludeSelf' | 'minPresentMs'>,
  clock: Timestamp,
): ParticipantSummary[] {
  const now = meetingNow(meeting, clock);
  return meeting.participants
    .filter((p) => !(settings.excludeSelf && p.isSelf))
    .map((p) => summarizeParticipant(p, now, settings.minPresentMs, markFor(meeting, p.key)))
    .sort(
      (a, b) =>
        (a.firstJoin ?? Infinity) - (b.firstJoin ?? Infinity) || a.name.localeCompare(b.name),
    );
}

/** Number of people counted as present in a meeting. */
export function attendeeCount(
  meeting: MeetingRecord,
  settings: Pick<Settings, 'excludeSelf' | 'minPresentMs'>,
  clock: Timestamp,
): number {
  return summarizeMeeting(meeting, settings, clock).filter((s) => s.present).length;
}

export function meetingTitle(
  meeting: Pick<MeetingRecord, 'customTitle' | 'detectedTitle' | 'code'>,
): string {
  return meeting.customTitle?.trim() || meeting.detectedTitle?.trim() || meeting.code;
}
