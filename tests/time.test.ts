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
