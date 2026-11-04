import { describe, expect, it } from 'vitest';
import { isMessage } from '../src/lib/messages';
import { sanitizeSettings } from '../src/lib/settings';
import { DEFAULT_SETTINGS } from '../src/lib/types';

const meeting = {
  id: 'm1',
  code: 'abc-defg-hij',
  detectedTitle: null,
  startedAt: 1,
  lastSeenAt: 2,
  paused: false,
  participants: [
    {
      key: 'a#0',
      name: 'A',
      avatarUrl: null,
      isSelf: false,
      missingSince: null,
      sessions: [{ joinedAt: 1, leftAt: null }],
    },
  ],
};

describe('isMessage', () => {
  it('accepts well-formed messages', () => {
    expect(
      isMessage({
        type: 'meeting:start',
        code: 'abc-defg-hij',
        detectedTitle: null,
        at: 1,
        resumeId: null,
      }),
    ).toBe(true);
    expect(isMessage({ type: 'meeting:save', meeting })).toBe(true);
    expect(isMessage({ type: 'meeting:end', meeting, endedAt: 3 })).toBe(true);
    expect(isMessage({ type: 'live:get', tabId: 4 })).toBe(true);
    expect(isMessage({ type: 'live:setPaused', tabId: 4, paused: true })).toBe(true);
    expect(isMessage({ type: 'page:status', state: 'waiting-to-join', code: 'bpn-qubw-rjo' })).toBe(
      true,
    );
    expect(isMessage({ type: 'page:status', state: 'no-meeting', code: null })).toBe(true);
    expect(isMessage({ type: 'page:get', tabId: 3 })).toBe(true);
  });

  it('rejects malformed messages', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage({ type: 'nope' })).toBe(false);
    expect(isMessage({ type: 'meeting:start', code: '../../x', detectedTitle: null, at: 1 })).toBe(
      false,
    );
    expect(
      isMessage({
        type: 'meeting:start',
        code: 'abc-defg-hij',
        detectedTitle: null,
        at: Number.NaN,
      }),
    ).toBe(false);
    expect(
      isMessage({ type: 'meeting:save', meeting: { ...meeting, participants: [{ key: 1 }] } }),
    ).toBe(false);
    expect(isMessage({ type: 'meeting:save', meeting: { ...meeting, participants: 'x' } })).toBe(
      false,
    );
    expect(
      isMessage({
        type: 'meeting:save',
        meeting: { ...meeting, detectedTitle: 'x'.repeat(10_000) },
      }),
    ).toBe(false);
    expect(isMessage({ type: 'live:get', tabId: '4' })).toBe(false);
    expect(isMessage({ type: 'page:status', state: 'hacked', code: null })).toBe(false);
    expect(isMessage({ type: 'page:status', state: 'no-meeting', code: '<b>' })).toBe(false);
    expect(
      isMessage({ type: 'meeting:start', code: 'abc-defg-hij', detectedTitle: null, at: 1 }),
    ).toBe(false);
    // Keys must have the participant-key shape and be unique (audit #9).
    const bad = (key: string) => ({ ...meeting.participants[0], key });
    expect(
      isMessage({
        type: 'meeting:save',
        meeting: { ...meeting, participants: [bad('constructor')] },
      }),
    ).toBe(false);
    expect(
      isMessage({
        type: 'meeting:save',
        meeting: { ...meeting, participants: [bad('a#0'), bad('a#0')] },
      }),
    ).toBe(false);
    expect(
      isMessage({
        type: 'meeting:save',
        meeting: { ...meeting, participants: [bad('a#0~2'), bad('b#1f2e3d4c')] },
      }),
    ).toBe(true);
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps and validates fields', () => {
    const s = sanitizeSettings({
      pollIntervalMs: 10,
      minPresentMs: -5,
      theme: 'neon',
      timeFormat: '12h',
      excludeSelf: true,
      extra: 1,
    });
    expect(s.pollIntervalMs).toBe(1_000);
    expect(s.minPresentMs).toBe(0);
    expect(s.theme).toBe('system');
    expect(s.timeFormat).toBe('12h');
    expect(s.excludeSelf).toBe(true);
    expect(s).not.toHaveProperty('extra');
  });
});
