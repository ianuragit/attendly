import { describe, expect, it } from 'vitest';
import {
  attendeeCount,
  meetingDurationMs,
  meetingTitle,
  summarizeMeeting,
  summarizeParticipant,
  totalPresentMs,
} from '../src/lib/attendance';
import type { MeetingRecord, ParticipantRecord } from '../src/lib/types';

const M = 60_000;

const person = (
  name: string,
  sessions: [number, number | null][],
  isSelf = false,
): ParticipantRecord => ({
  key: `${name.toLowerCase()}#0`,
  name,
  avatarUrl: null,
  isSelf,
  missingSince: null,
  sessions: sessions.map(([joinedAt, leftAt]) => ({ joinedAt, leftAt })),
});

const meeting = (
  participants: ParticipantRecord[],
  over: Partial<MeetingRecord> = {},
): MeetingRecord => ({
  id: 'm1',
  code: 'abc-defg-hij',
  detectedTitle: null,
  customTitle: null,
  notes: '',
  startedAt: 0,
  endedAt: 60 * M,
  lastSeenAt: 60 * M,
  status: 'ended',
  groupId: null,
  participants,
  manualMarks: {},
  paused: false,
  schemaVersion: 1,
  ...over,
});

describe('totalPresentMs', () => {
  it('sums closed sessions', () => {
    expect(
      totalPresentMs(
        [
          { joinedAt: 0, leftAt: 10 },
          { joinedAt: 20, leftAt: 25 },
        ],
        100,
      ),
    ).toBe(15);
  });
  it('runs open sessions until now', () => {
    expect(totalPresentMs([{ joinedAt: 10, leftAt: null }], 100)).toBe(90);
  });
  it('does not double count overlaps and ignores inverted intervals', () => {
    expect(
      totalPresentMs(
        [
          { joinedAt: 0, leftAt: 50 },
          { joinedAt: 40, leftAt: 60 },
          { joinedAt: 70, leftAt: 65 },
        ],
        100,
      ),
    ).toBe(60);
  });
  it('is zero for no sessions', () => {
    expect(totalPresentMs([], 100)).toBe(0);
  });
});

describe('summarizeParticipant', () => {
  it('computes first join, last leave, total and session count', () => {
    const s = summarizeParticipant(
      person('Ana', [
        [0, 10 * M],
        [20 * M, 30 * M],
      ]),
      60 * M,
      M,
    );
    expect(s).toMatchObject({
      firstJoin: 0,
      lastLeave: 30 * M,
      totalMs: 20 * M,
      sessionCount: 2,
      present: true,
      presentNow: false,
    });
  });
  it('has no last leave while still present', () => {
    const s = summarizeParticipant(
      person('Ana', [
        [0, 10 * M],
        [20 * M, null],
      ]),
      25 * M,
      M,
    );
    expect(s.lastLeave).toBeNull();
    expect(s.presentNow).toBe(true);
    expect(s.totalMs).toBe(15 * M);
  });
  it('applies the minimum duration rule', () => {
    expect(summarizeParticipant(person('Ana', [[0, 30_000]]), M, M).present).toBe(false);
    expect(summarizeParticipant(person('Ana', [[0, M]]), M, M).present).toBe(true);
  });
  it('lets manual marks override', () => {
    expect(summarizeParticipant(person('Ana', [[0, 1]]), M, M, 'present').present).toBe(true);
    expect(summarizeParticipant(person('Ana', [[0, 50 * M]]), M, M, 'absent').present).toBe(false);
  });
});

describe('meeting summaries', () => {
  const m = meeting([
    person('Ben', [[5 * M, 50 * M]]),
    person('Me', [[0, 60 * M]], true),
    person('Ana', [[5 * M, 5 * M + 10_000]]),
  ]);

  it('sorts by first join then name and applies exclude-self', () => {
    expect(
      summarizeMeeting(m, { excludeSelf: false, minPresentMs: M }, 0).map((s) => s.name),
    ).toEqual(['Me', 'Ana', 'Ben']);
    expect(
      summarizeMeeting(m, { excludeSelf: true, minPresentMs: M }, 0).map((s) => s.name),
    ).toEqual(['Ana', 'Ben']);
  });

  it('counts attendees meeting the minimum', () => {
    expect(attendeeCount(m, { excludeSelf: true, minPresentMs: M }, 0)).toBe(1);
    expect(attendeeCount(m, { excludeSelf: false, minPresentMs: 0 }, 0)).toBe(3);
  });

  it('uses the clock for active meetings', () => {
    const live = meeting([person('Ana', [[0, null]])], {
      endedAt: null,
      status: 'active',
      lastSeenAt: 5 * M,
    });
    expect(meetingDurationMs(live, 10 * M)).toBe(10 * M);
    expect(
      summarizeMeeting(live, { excludeSelf: false, minPresentMs: 0 }, 10 * M)[0]!.totalMs,
    ).toBe(10 * M);
    expect(meetingDurationMs(m, 999 * M)).toBe(60 * M);
  });

  it('picks the best title', () => {
    expect(meetingTitle(m)).toBe('abc-defg-hij');
    expect(meetingTitle({ ...m, detectedTitle: 'Standup' })).toBe('Standup');
    expect(meetingTitle({ ...m, detectedTitle: 'Standup', customTitle: ' Math 101 ' })).toBe(
      'Math 101',
    );
  });
});
