import { describe, expect, it } from 'vitest';
import { href, parseHash } from '../src/dashboard/router';

describe('router', () => {
  it.each([
    ['', { name: 'meetings' }],
    ['#/', { name: 'meetings' }],
    ['#/meetings', { name: 'meetings' }],
    ['#/meetings/abc', { name: 'meeting', id: 'abc' }],
    ['#/groups', { name: 'groups' }],
    ['#/groups/g%201', { name: 'group', id: 'g 1' }],
    ['#/settings', { name: 'settings' }],
    ['#/whatever', { name: 'meetings' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
  it('round-trips', () => {
    expect(parseHash(href({ name: 'group', id: 'a/b' }))).toEqual({ name: 'group', id: 'a/b' });
  });
});
