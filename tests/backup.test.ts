import { describe, expect, it } from 'vitest';
import { BackupError, createBackup, parseBackup } from '../src/lib/backup';
import { newMeeting } from '../src/lib/meetings';
import { DEFAULT_SETTINGS } from '../src/lib/types';

const group = {
  id: 'g1',
  name: 'Class',
  createdAt: 1,
  autoAssignCodes: ['abc-defg-hij', 'BAD CODE'],
};
const meeting = {
  ...newMeeting('m1', 'abc-defg-hij', 'T', 1_000, 'g1'),
  participants: [
    {
      key: 'a#0',
      name: 'A',
      avatarUrl: null,
      isSelf: false,
      missingSince: 5,
      sessions: [{ joinedAt: 1_000, leftAt: null }],
    },
  ],
  manualMarks: { 'a#0': 'present', 'b#0': 'maybe' },
};

const roundTrip = (data: unknown) => parseBackup(JSON.stringify(data));

describe('backup', () => {
  it('round-trips a backup and normalises live state', () => {
    const backup = createBackup([meeting as never], [group], DEFAULT_SETTINGS, 0);
    const out = roundTrip(backup);
    expect(out.groups[0]!.autoAssignCodes).toEqual(['abc-defg-hij']);
    const m = out.meetings[0]!;
    expect(m.status).toBe('ended');
    expect(m.endedAt).toBe(1_000);
    expect(m.participants[0]!.missingSince).toBeNull();
    expect(m.participants[0]!.sessions[0]!.leftAt).toBe(1_000);
    expect(m.manualMarks).toEqual({ 'a#0': 'present' });
    expect(m.groupId).toBe('g1');
  });

  it('drops references to groups that are not in the file', () => {
    const out = roundTrip(createBackup([meeting as never], [], DEFAULT_SETTINGS, 0));
    expect(out.meetings[0]!.groupId).toBeNull();
  });

  it('sanitises settings', () => {
    const out = roundTrip({
      ...createBackup([], [], DEFAULT_SETTINGS, 0),
      settings: { pollIntervalMs: -1, theme: 'x' },
    });
    expect(out.settings.pollIntervalMs).toBe(1_000);
    expect(out.settings.theme).toBe('system');
  });

  it.each([
    ['not json', '{'],
    ['wrong app', JSON.stringify({ app: 'other', version: 1, groups: [], meetings: [] })],
    ['wrong version', JSON.stringify({ app: 'attendly', version: 99, groups: [], meetings: [] })],
    ['missing arrays', JSON.stringify({ app: 'attendly', version: 1 })],
    [
      'bad code',
      JSON.stringify({
        app: 'attendly',
        version: 1,
        groups: [],
        meetings: [{ ...meeting, code: '<script>' }],
      }),
    ],
    [
      'bad participant',
      JSON.stringify({
        app: 'attendly',
        version: 1,
        groups: [],
        meetings: [{ ...meeting, participants: [{ key: 1 }] }],
      }),
    ],
    [
      'bad timestamp',
      JSON.stringify({
        app: 'attendly',
        version: 1,
        groups: [],
        meetings: [{ ...meeting, startedAt: 'yesterday' }],
      }),
    ],
  ])('rejects %s', (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });

  it('ignores prototype-pollution keys', () => {
    const text =
      '{"app":"attendly","version":1,"groups":[],"meetings":[],"__proto__":{"polluted":true}}';
    parseBackup(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
