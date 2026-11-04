/** Pure filtering and sorting for the meeting history list. */
import { attendeeCount, meetingDurationMs, meetingTitle } from './attendance';
import { DAY_MS } from './time';
import type { MeetingRecord, Settings } from './types';

export type SortKey = 'date' | 'title' | 'duration' | 'attendees';
export type SortDir = 'asc' | 'desc';

export interface HistoryQuery {
  search: string;
  /** Local-midnight timestamp, inclusive. */
  from: number | null;
  /** Local-midnight timestamp of the last day included. */
  to: number | null;
  /** Group id, "none" for ungrouped, or null for all. */
  groupId: string | null;
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_QUERY: HistoryQuery = {
  search: '',
  from: null,
  to: null,
  groupId: null,
  sort: 'date',
  dir: 'desc',
};

export interface HistoryRow {
  meeting: MeetingRecord;
  title: string;
  durationMs: number;
  attendees: number;
}

export function buildHistory(
  meetings: readonly MeetingRecord[],
  query: HistoryQuery,
  settings: Pick<Settings, 'excludeSelf' | 'minPresentMs'>,
  clock: number,
): HistoryRow[] {
  const needle = query.search.trim().toLowerCase();
  const rows = meetings
    .filter((m) => query.from === null || m.startedAt >= query.from)
    .filter((m) => query.to === null || m.startedAt < query.to + DAY_MS)
    .filter((m) =>
      query.groupId === null
        ? true
        : query.groupId === 'none'
          ? m.groupId === null
          : m.groupId === query.groupId,
    )
    .map((m) => ({
      meeting: m,
      title: meetingTitle(m),
      durationMs: meetingDurationMs(m, clock),
      attendees: attendeeCount(m, settings, clock),
    }))
    .filter(
      (r) =>
        !needle ||
        r.title.toLowerCase().includes(needle) ||
        r.meeting.code.includes(needle) ||
        r.meeting.notes.toLowerCase().includes(needle) ||
        r.meeting.participants.some((p) => p.name.toLowerCase().includes(needle)),
    );

  const cmp: Record<SortKey, (a: HistoryRow, b: HistoryRow) => number> = {
    date: (a, b) => a.meeting.startedAt - b.meeting.startedAt,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    duration: (a, b) => a.durationMs - b.durationMs,
    attendees: (a, b) => a.attendees - b.attendees,
  };
  const sign = query.dir === 'asc' ? 1 : -1;
  return rows.sort(
    (a, b) => sign * cmp[query.sort](a, b) || b.meeting.startedAt - a.meeting.startedAt,
  );
}
