import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/lib/time';

describe('formatDuration', () => {
  it('formats sub-hour durations as M:SS', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
  });

  it('formats hour+ durations as H:MM:SS', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('clamps negative values and drops sub-second remainders', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
    expect(formatDuration(1_999)).toBe('0:01');
  });
});

import {
  formatDurationShort,
  formatIsoLocal,
  parseDateInput,
  toDateInputValue,
  toMinutes,
} from '../src/lib/time';

describe('other time helpers', () => {
  it('formats short durations', () => {
    expect(formatDurationShort(45_000)).toBe('45s');
    expect(formatDurationShort(12 * 60_000 + 5_000)).toBe('12m');
    expect(formatDurationShort(65 * 60_000)).toBe('1h 05m');
  });
  it('converts to minutes with one decimal', () => {
    expect(toMinutes(90_000)).toBe(1.5);
    expect(toMinutes(-1)).toBe(0);
    expect(toMinutes(61_234)).toBe(1);
  });
  it('round-trips date input values in local time', () => {
    const ts = new Date(2026, 0, 5, 13, 4, 9).getTime();
    expect(formatIsoLocal(ts)).toBe('2026-01-05 13:04:09');
    expect(toDateInputValue(ts)).toBe('2026-01-05');
    expect(parseDateInput('2026-01-05')).toBe(new Date(2026, 0, 5).getTime());
    expect(parseDateInput('nope')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });
});
