import { describe, expect, it } from 'vitest';
import { meetingsMatchingRule, newGroup, parseCodes } from '../src/lib/groups';
import { buildMatrix } from '../src/lib/matrix';
import { newMeeting } from '../src/lib/meetings';
import type { MeetingRecord, ParticipantRecord } from '../src/lib/types';

const M = 60_000;
const p = (
  name: string,
  mins: number,
  opts: { key?: string; self?: boolean } = {},
): ParticipantRecord => ({
  key: opts.key ?? `${name.toLowerCase()}#0`,
  name,
  avatarUrl: null,
  isSelf: opts.self ?? false,
  missingSince: null,
  sessions: mins > 0 ? [{ joinedAt: 0, leftAt: mins * M }] : [],
});
const meeting = (
  id: string,
  start: number,
  participants: ParticipantRecord[],
  marks: MeetingRecord['manualMarks'] = {},
): MeetingRecord => ({
  ...newMeeting(id, 'abc-defg-hij', null, start, 'g'),
  status: 'ended',
  endedAt: start + 60 * M,
  lastSeenAt: start + 60 * M,
  participants: participants.map((x) => ({
    ...x,
    sessions: x.sessions.map((s) => ({
      joinedAt: s.joinedAt + start,
      leftAt: (s.leftAt ?? 0) + start,
    })),
  })),
  manualMarks: marks,
});

const S = { excludeSelf: false, minPresentMs: 5 * M };

describe('buildMatrix', () => {
  const meetings = [
    meeting('m2', 2_000_000, [p('Ana', 30), p('Ben', 2), p('Me', 60, { self: true })]),
    meeting('m1', 1_000_000, [p('Ana', 40), p('Cy', 20), p('Me', 60, { self: true })]),
    meeting('m3', 3_000_000, [p('ana', 10)], { 'cy#0': 'present' }),
  ];

  it('orders columns by date and rows by name', () => {
    const mx = buildMatrix(meetings, S, 0);
    expect(mx.columns.map((c) => c.meetingId)).toEqual(['m1', 'm2', 'm3']);
    expect(mx.rows.map((r) => r.name)).toEqual(['ana', 'Ben', 'Cy', 'Me']);
  });

  it('computes cells, counts and attendance %', () => {
    const mx = buildMatrix(meetings, S, 0);
    const row = (n: string) => mx.rows.find((r) => r.name.toLowerCase() === n)!;
    expect(row('ana').cells.map((c) => c.present)).toEqual([true, true, true]);
    expect(row('ana').attendancePct).toBe(100);
    expect(row('ana').totalMs).toBe(80 * M);
    // Ben attended m2 but below the minimum.
    expect(row('ben').cells[1]).toMatchObject({ present: false, attended: true, totalMs: 2 * M });
    expect(row('ben').attendancePct).toBe(0);
    // Cy was absent from m3 but manually marked present.
    expect(row('cy').cells.map((c) => c.present)).toEqual([true, false, false]);
    expect(row('me').attendancePct).toBe(66.7);
    expect(mx.columns.map((c) => c.presentCount)).toEqual([3, 2, 1]);
  });

  it('applies manual marks only to people recorded in that meeting', () => {
    // Manual mark for someone not in the participant list has no row to attach to.
    const mx = buildMatrix(meetings, S, 0);
    expect(mx.rows.find((r) => r.name === 'Cy')!.cells[2]!.present).toBe(false);
  });

  it('excludes self when configured', () => {
    expect(
      buildMatrix(meetings, { ...S, excludeSelf: true }, 0).rows.map((r) => r.name),
    ).not.toContain('Me');
  });

  it('keeps same-name people in one meeting apart', () => {
    const mx = buildMatrix(
      [meeting('m', 0, [p('Sam', 30, { key: 'sam#aaaa' }), p('Sam', 30, { key: 'sam#bbbb' })])],
      S,
      0,
    );
    expect(mx.rows).toHaveLength(2);
  });

  it('handles empty groups', () => {
    expect(buildMatrix([], S, 0)).toEqual({ columns: [], rows: [] });
  });
});

describe('groups helpers', () => {
  it('parses codes and Meet URLs, dropping junk and duplicates', () => {
    expect(
      parseCodes(
        'abc-defg-hij, https://meet.google.com/XYZ-abcd-efg\nabc-defg-hij ; !! meet.google.com/lookup/myclass',
      ),
    ).toEqual(['abc-defg-hij', 'xyz-abcd-efg', 'myclass']);
    expect(parseCodes('')).toEqual([]);
  });

  it('creates groups with sane names', () => {
    expect(newGroup('g', '  ', 1).name).toBe('Untitled group');
    expect(newGroup('g', 'x'.repeat(500), 1).name).toHaveLength(120);
  });

  it('finds meetings matching the auto-assign rule', () => {
    const g = newGroup('g', 'G', 0, ['abc-defg-hij']);
    const a = { ...newMeeting('a', 'abc-defg-hij', null, 0, null) };
    const b = { ...newMeeting('b', 'abc-defg-hij', null, 0, 'g') };
    const c = { ...newMeeting('c', 'zzz-zzzz-zzz', null, 0, null) };
    expect(meetingsMatchingRule(g, [a, b, c]).map((m) => m.id)).toEqual(['a']);
  });
});
