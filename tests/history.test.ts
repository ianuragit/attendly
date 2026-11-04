import { describe, expect, it } from 'vitest';
import { buildHistory, DEFAULT_QUERY } from '../src/lib/history';
import { newMeeting } from '../src/lib/meetings';
import type { MeetingRecord } from '../src/lib/types';

const DAY = 86_400_000;
const d = (y: number, m: number, day: number, h = 10) => new Date(y, m - 1, day, h).getTime();
const S = { excludeSelf: false, minPresentMs: 0 };

const mk = (
  id: string,
  start: number,
  mins: number,
  extra: Partial<MeetingRecord> = {},
): MeetingRecord => ({
  ...newMeeting(id, `${id}${id}${id}-abcd-efg`, null, start, null),
  status: 'ended',
  endedAt: start + mins * 60_000,
  lastSeenAt: start + mins * 60_000,
  ...extra,
});

const meetings = [
  mk('a', d(2026, 3, 1), 30, { customTitle: 'Algebra', groupId: 'g1' }),
  mk('b', d(2026, 3, 2), 90, { detectedTitle: 'Biology' }),
  mk('c', d(2026, 3, 3, 23), 10, {
    customTitle: 'Chemistry',
    groupId: 'g1',
    participants: [
      {
        key: 'z#0',
        name: 'Zed',
        avatarUrl: null,
        isSelf: false,
        missingSince: null,
        sessions: [{ joinedAt: d(2026, 3, 3, 23), leftAt: d(2026, 3, 3, 23) + 60_000 }],
      },
    ],
  }),
];

const ids = (q: Partial<typeof DEFAULT_QUERY>) =>
  buildHistory(meetings, { ...DEFAULT_QUERY, ...q }, S, 0).map((r) => r.meeting.id);

describe('buildHistory', () => {
  it('sorts newest first by default', () => {
    expect(ids({})).toEqual(['c', 'b', 'a']);
  });
  it('sorts by title, duration and attendees in both directions', () => {
    expect(ids({ sort: 'title', dir: 'asc' })).toEqual(['a', 'b', 'c']);
    expect(ids({ sort: 'duration', dir: 'desc' })).toEqual(['b', 'a', 'c']);
    expect(ids({ sort: 'attendees', dir: 'desc' })[0]).toBe('c');
  });
  it('searches titles, codes and participant names', () => {
    expect(ids({ search: 'bio' })).toEqual(['b']);
    expect(ids({ search: 'zed' })).toEqual(['c']);
    expect(ids({ search: 'aaa-abcd' })).toEqual(['a']);
  });
  it('filters by inclusive date range', () => {
    expect(ids({ from: d(2026, 3, 2, 0), to: d(2026, 3, 3, 0) })).toEqual(['c', 'b']);
    expect(ids({ to: d(2026, 3, 1, 0) })).toEqual(['a']);
    expect(ids({ from: d(2026, 3, 1, 0) + 3 * DAY })).toEqual([]);
  });
  it('filters by group and ungrouped', () => {
    expect(ids({ groupId: 'g1' })).toEqual(['c', 'a']);
    expect(ids({ groupId: 'none' })).toEqual(['b']);
  });
});
