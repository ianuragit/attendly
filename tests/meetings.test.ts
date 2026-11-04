import { describe, expect, it } from 'vitest';
import {
  closeStale,
  findResumable,
  mergeLive,
  newMeeting,
  RESUME_WINDOW_MS,
} from '../src/lib/meetings';
import type { LiveMeetingFields } from '../src/lib/messages';

const base = () => newMeeting('m1', 'abc-defg-hij', null, 1_000, 'g1');

describe('newMeeting', () => {
  it('creates an active meeting with defaults', () => {
    expect(base()).toMatchObject({
      id: 'm1',
      status: 'active',
      startedAt: 1_000,
      endedAt: null,
      groupId: 'g1',
      participants: [],
    });
  });
});

describe('findResumable', () => {
  it('picks the most recent meeting that ended within the window', () => {
    const a = { ...base(), id: 'a', endedAt: 10_000, lastSeenAt: 10_000, status: 'ended' as const };
    const b = { ...base(), id: 'b', endedAt: 20_000, lastSeenAt: 20_000, status: 'ended' as const };
    expect(findResumable([a, b], 25_000)?.id).toBe('b');
  });
  it('ignores meetings outside the window', () => {
    const a = { ...base(), endedAt: 10_000, lastSeenAt: 10_000, status: 'ended' as const };
    expect(findResumable([a], 10_000 + RESUME_WINDOW_MS + 1)).toBeUndefined();
  });
});

describe('mergeLive', () => {
  const live: LiveMeetingFields = {
    id: 'm1',
    code: 'abc-defg-hij',
    detectedTitle: 'Standup',
    startedAt: 1_000,
    lastSeenAt: 5_000,
    paused: false,
    participants: [
      {
        key: 'ana#0',
        name: 'Ana',
        avatarUrl: null,
        isSelf: false,
        missingSince: null,
        sessions: [{ joinedAt: 1_000, leftAt: null }],
      },
    ],
  };

  it('keeps user edits and applies tracker fields', () => {
    const stored = {
      ...base(),
      customTitle: 'Mine',
      notes: 'n',
      manualMarks: { 'x#0': 'present' as const },
    };
    const out = mergeLive(stored, live, null);
    expect(out).toMatchObject({
      customTitle: 'Mine',
      notes: 'n',
      groupId: 'g1',
      detectedTitle: 'Standup',
      lastSeenAt: 5_000,
      status: 'active',
    });
    expect(out.manualMarks).toEqual({ 'x#0': 'present' });
    expect(out.participants).toHaveLength(1);
  });

  it('ends the meeting when given an end time and re-activates on later saves', () => {
    const ended = mergeLive(base(), live, 6_000);
    expect(ended).toMatchObject({ status: 'ended', endedAt: 6_000 });
    expect(mergeLive(ended, { ...live, lastSeenAt: 7_000 }, null)).toMatchObject({
      status: 'active',
      endedAt: null,
    });
  });

  it('does not move lastSeenAt backwards or drop a known title', () => {
    const stored = { ...base(), lastSeenAt: 9_000, detectedTitle: 'Old' };
    expect(mergeLive(stored, { ...live, detectedTitle: null }, null)).toMatchObject({
      lastSeenAt: 9_000,
      detectedTitle: 'Old',
    });
  });
});

describe('closeStale', () => {
  it('closes the meeting and open sessions at the last save', () => {
    const m = {
      ...base(),
      lastSeenAt: 50_000,
      participants: [
        {
          key: 'a#0',
          name: 'A',
          avatarUrl: null,
          isSelf: false,
          missingSince: null,
          sessions: [{ joinedAt: 1_000, leftAt: null }],
        },
        {
          key: 'b#0',
          name: 'B',
          avatarUrl: null,
          isSelf: false,
          missingSince: 40_000,
          sessions: [{ joinedAt: 1_000, leftAt: null }],
        },
        {
          key: 'c#0',
          name: 'C',
          avatarUrl: null,
          isSelf: false,
          missingSince: null,
          sessions: [{ joinedAt: 1_000, leftAt: 2_000 }],
        },
      ],
    };
    const out = closeStale(m);
    expect(out).toMatchObject({ status: 'ended', endedAt: 50_000 });
    expect(out.participants.map((p) => p.sessions[0]!.leftAt)).toEqual([50_000, 40_000, 2_000]);
    expect(out.participants.every((p) => p.missingSince === null)).toBe(true);
  });
});
