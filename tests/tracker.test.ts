import { describe, expect, it } from 'vitest';
import {
  applySnapshot,
  createTrackerState,
  finalizeTracker,
  presentCount,
  type TrackerOptions,
} from '../src/content/tracker';
import type { SnapshotEntry, TrackerState } from '../src/lib/types';

const OPTS: TrackerOptions = { leaveDebounceMs: 10_000 };
const S = 1_000;
const T0 = 1_700_000_000_000;

const p = (name: string, extra: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
  name,
  avatarUrl: null,
  isSelf: false,
  ...extra,
});

/** Runs a sequence of [secondsSinceT0, snapshot] ticks. */
function run(ticks: [number, SnapshotEntry[]][], state: TrackerState = createTrackerState()) {
  return ticks.reduce((st, [sec, snap]) => applySnapshot(st, snap, T0 + sec * S, OPTS), state);
}

const byName = (st: TrackerState, name: string) => {
  const found = Object.values(st.participants).filter((r) => r.name === name);
  expect(found.length).toBeGreaterThan(0);
  return found;
};
const one = (st: TrackerState, name: string) => {
  const found = byName(st, name);
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe('tracker: joins', () => {
  it('opens a session for each new participant', () => {
    const st = run([[0, [p('Ana'), p('Ben')]]]);
    expect(Object.keys(st.participants)).toHaveLength(2);
    expect(one(st, 'Ana').sessions).toEqual([{ joinedAt: T0, leftAt: null }]);
    expect(presentCount(st)).toBe(2);
    expect(st.lastTickAt).toBe(T0);
  });

  it('records late joiners at the tick they first appear', () => {
    const st = run([
      [0, [p('Ana')]],
      [5, [p('Ana')]],
      [10, [p('Ana'), p('Ben')]],
    ]);
    expect(one(st, 'Ben').sessions).toEqual([{ joinedAt: T0 + 10 * S, leftAt: null }]);
    expect(one(st, 'Ana').sessions).toHaveLength(1);
  });

  it('does not mutate the previous state', () => {
    const a = run([[0, [p('Ana')]]]);
    const snapshot = JSON.stringify(a);
    run(
      [
        [5, []],
        [30, []],
      ],
      a,
    );
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it('ignores blank names', () => {
    const st = run([[0, [p('   '), p('')]]]);
    expect(Object.keys(st.participants)).toHaveLength(0);
  });

  it('ignores out-of-order (older) snapshots', () => {
    const a = run([[10, [p('Ana')]]]);
    const b = applySnapshot(a, [], T0, OPTS);
    expect(b).toBe(a);
  });
});

describe('tracker: leaves (with debounce)', () => {
  it('keeps the session open while missing for less than the debounce window', () => {
    const st = run([
      [0, [p('Ana')]],
      [5, []],
      [10, []],
    ]);
    const ana = one(st, 'Ana');
    expect(ana.sessions[0]!.leftAt).toBeNull();
    expect(ana.missingSince).toBe(T0 + 5 * S);
    expect(presentCount(st)).toBe(1);
  });

  it('closes the session at the moment of disappearance once the debounce window passes', () => {
    const st = run([
      [0, [p('Ana'), p('Ben')]],
      [5, [p('Ben')]],
      [10, [p('Ben')]],
      [15, [p('Ben')]],
    ]);
    const ana = one(st, 'Ana');
    expect(ana.sessions).toEqual([{ joinedAt: T0, leftAt: T0 + 5 * S }]);
    expect(ana.missingSince).toBeNull();
    expect(presentCount(st)).toBe(1);
  });

  it('closes after a single long gap between ticks', () => {
    const st = run([
      [0, [p('Ana')]],
      [5, []],
      [60, []],
    ]);
    expect(one(st, 'Ana').sessions[0]!.leftAt).toBe(T0 + 5 * S);
  });
});

describe('tracker: flickering tiles', () => {
  it('treats a short disappearance as continuous presence', () => {
    const st = run([
      [0, [p('Ana')]],
      [5, []],
      [9, [p('Ana')]],
      [20, [p('Ana')]],
    ]);
    const ana = one(st, 'Ana');
    expect(ana.sessions).toEqual([{ joinedAt: T0, leftAt: null }]);
    expect(ana.missingSince).toBeNull();
  });

  it('survives repeated flicker without creating sessions', () => {
    const ticks: [number, SnapshotEntry[]][] = [];
    for (let i = 0; i < 20; i++) ticks.push([i * 3, i % 2 ? [] : [p('Ana')]]);
    const st = run(ticks);
    expect(one(st, 'Ana').sessions).toHaveLength(1);
  });

  it('restarts the debounce window after a reappearance', () => {
    const st = run([
      [0, [p('Ana')]],
      [5, []], // missing since 5
      [8, [p('Ana')]], // back
      [12, []], // missing since 12
      [20, []], // 8s missing — still within window
    ]);
    const ana = one(st, 'Ana');
    expect(ana.sessions[0]!.leftAt).toBeNull();
    expect(ana.missingSince).toBe(T0 + 12 * S);
  });
});

describe('tracker: rejoins', () => {
  it('opens a new session when someone returns after leaving', () => {
    const st = run([
      [0, [p('Ana')]],
      [10, []],
      [30, []],
      [60, [p('Ana')]],
      [90, [p('Ana')]],
    ]);
    expect(one(st, 'Ana').sessions).toEqual([
      { joinedAt: T0, leftAt: T0 + 10 * S },
      { joinedAt: T0 + 60 * S, leftAt: null },
    ]);
  });

  it('handles several leave/rejoin cycles', () => {
    const ticks: [number, SnapshotEntry[]][] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      const base = cycle * 100;
      ticks.push([base, [p('Ana')]], [base + 20, []], [base + 40, []]);
    }
    const st = run(ticks);
    const ana = one(st, 'Ana');
    expect(ana.sessions).toHaveLength(3);
    expect(ana.sessions.every((s) => s.leftAt !== null)).toBe(true);
    expect(ana.sessions.map((s) => s.joinedAt - T0)).toEqual([0, 100 * S, 200 * S]);
  });
});

describe('tracker: identity and duplicate names', () => {
  it('keeps two same-name people apart when their avatars differ', () => {
    const st = run([
      [
        0,
        [
          p('Sam', { avatarUrl: 'https://lh3.googleusercontent.com/a/one=s64' }),
          p('Sam', { avatarUrl: 'https://lh3.googleusercontent.com/a/two=s64' }),
        ],
      ],
    ]);
    expect(byName(st, 'Sam')).toHaveLength(2);
    expect(presentCount(st)).toBe(2);
  });

  it('keeps two same-name people without avatars apart via suffixed keys', () => {
    const st = run([
      [0, [p('Sam'), p('Sam')]],
      [5, [p('Sam'), p('Sam')]],
    ]);
    const sams = byName(st, 'Sam');
    expect(sams).toHaveLength(2);
    expect(new Set(sams.map((s) => s.key)).size).toBe(2);
    expect(sams.every((s) => s.sessions.length === 1)).toBe(true);
  });

  it('closes only one of two same-name people when one leaves', () => {
    const a = 'https://lh3.googleusercontent.com/a/one';
    const b = 'https://lh3.googleusercontent.com/a/two';
    const st = run([
      [0, [p('Sam', { avatarUrl: a }), p('Sam', { avatarUrl: b })]],
      [5, [p('Sam', { avatarUrl: a })]],
      [20, [p('Sam', { avatarUrl: a })]],
    ]);
    const [withA, withB] = [a, b].map((url) =>
      Object.values(st.participants).find((r) => r.avatarUrl === url)!,
    );
    expect(withA!.sessions[0]!.leftAt).toBeNull();
    expect(withB!.sessions[0]!.leftAt).toBe(T0 + 5 * S);
  });

  it('matches a participant whose avatar appears or disappears between ticks', () => {
    const url = 'https://lh3.googleusercontent.com/a/ana=s32';
    const st = run([
      [0, [p('Ana')]],
      [5, [p('Ana', { avatarUrl: url })]],
      [10, [p('Ana')]],
      [15, [p('Ana', { avatarUrl: 'https://lh3.googleusercontent.com/a/ana=s128-c' })]],
    ]);
    const ana = one(st, 'Ana');
    expect(ana.sessions).toHaveLength(1);
    expect(ana.avatarUrl).toBe('https://lh3.googleusercontent.com/a/ana');
  });

  it('matches names case- and accent-insensitively but keeps the latest display form', () => {
    const st = run([
      [0, [p('Zoë Smith')]],
      [5, [p('zoe  smith')]],
    ]);
    const all = Object.values(st.participants);
    expect(all).toHaveLength(1);
    expect(all[0]!.sessions).toHaveLength(1);
    expect(all[0]!.name).toBe('zoe  smith');
  });

  it('rejoining duplicate prefers the closed record with a matching avatar', () => {
    const a = 'https://lh3.googleusercontent.com/a/one';
    const b = 'https://lh3.googleusercontent.com/a/two';
    const st = run([
      [0, [p('Sam', { avatarUrl: a }), p('Sam', { avatarUrl: b })]],
      [5, []],
      [30, []],
      [40, [p('Sam', { avatarUrl: b })]],
    ]);
    const withB = Object.values(st.participants).find((r) => r.avatarUrl === b)!;
    const withA = Object.values(st.participants).find((r) => r.avatarUrl === a)!;
    expect(withB.sessions).toHaveLength(2);
    expect(withA.sessions).toHaveLength(1);
  });
});

describe('tracker: self', () => {
  it('flags the local user and can exclude them from the live count', () => {
    const st = run([[0, [p('Me', { isSelf: true }), p('Ana')]]]);
    expect(one(st, 'Me').isSelf).toBe(true);
    expect(presentCount(st)).toBe(2);
    expect(presentCount(st, true)).toBe(1);
  });

  it('keeps the self flag once seen even if a later source omits it', () => {
    const st = run([
      [0, [p('Me', { isSelf: true })]],
      [5, [p('Me')]],
    ]);
    expect(one(st, 'Me').isSelf).toBe(true);
  });
});

describe('tracker: finalize', () => {
  it('closes open sessions at the end time', () => {
    const st = finalizeTracker(run([[0, [p('Ana')]]]), T0 + 100 * S);
    expect(one(st, 'Ana').sessions).toEqual([{ joinedAt: T0, leftAt: T0 + 100 * S }]);
    expect(presentCount(st)).toBe(0);
  });

  it('closes debounced-missing participants at the moment they went missing', () => {
    const st = finalizeTracker(
      run([
        [0, [p('Ana'), p('Ben')]],
        [50, [p('Ben')]],
      ]),
      T0 + 55 * S,
    );
    expect(one(st, 'Ana').sessions[0]!.leftAt).toBe(T0 + 50 * S);
    expect(one(st, 'Ben').sessions[0]!.leftAt).toBe(T0 + 55 * S);
  });

  it('leaves already-closed sessions untouched and resumes cleanly afterwards', () => {
    const paused = finalizeTracker(run([[0, [p('Ana')]]]), T0 + 10 * S);
    const resumed = applySnapshot(paused, [p('Ana')], T0 + 20 * S, OPTS);
    expect(one(resumed, 'Ana').sessions).toEqual([
      { joinedAt: T0, leftAt: T0 + 10 * S },
      { joinedAt: T0 + 20 * S, leftAt: null },
    ]);
  });
});
