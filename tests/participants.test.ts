import { describe, expect, it } from 'vitest';
import {
  cleanName,
  hashString,
  keyAvatar,
  keyName,
  mergeSources,
  resolveSelf,
  normalizeAvatarUrl,
  normalizeName,
  participantKey,
} from '../src/lib/participants';

describe('cleanName', () => {
  it.each([
    ['Ana Lima', 'Ana Lima', false],
    ['Ana Lima (You)', 'Ana Lima', true],
    ['Ana Lima (you)', 'Ana Lima', true],
    ['Ana Lima You', 'Ana Lima You', false],
    ['Jae-suk You', 'Jae-suk You', false],
    ['Ana Lima (Presenting)', 'Ana Lima', false],
    ['Ana Lima Presenting', 'Ana Lima', false],
    ['Ana Lima (You) (Presenting)', 'Ana Lima', true],
    ['Ana Lima Meeting host', 'Ana Lima', false],
    ['  Ana   Lima  ', 'Ana Lima', false],
  ])('%s → %s', (raw, name, self) => {
    const out = cleanName(raw);
    expect(out.name).toBe(name);
    expect(out.selfMarker).toBe(self);
  });

  it('does not strip "You" from a single-word name', () => {
    expect(cleanName('You').name).toBe('You');
  });

  it('flags presentation tiles', () => {
    expect(cleanName('Ana Lima (Presentation)').presentation).toBe(true);
    expect(cleanName('Ana Lima is presenting').presentation).toBe(true);
    expect(cleanName('Ana Lima').presentation).toBe(false);
  });
});

describe('normalisation and keys', () => {
  it('normalises names for matching', () => {
    expect(normalizeName('  Zoë   SMITH ')).toBe('zoe smith');
  });

  it('strips avatar size params and rejects non-https URLs', () => {
    expect(normalizeAvatarUrl('https://lh3.googleusercontent.com/a/abc=s64-p-k-rw-no')).toBe(
      'https://lh3.googleusercontent.com/a/abc',
    );
    expect(normalizeAvatarUrl('https://lh3.googleusercontent.com/a/abc?sz=32')).toBe(
      'https://lh3.googleusercontent.com/a/abc',
    );
    expect(normalizeAvatarUrl('data:image/png;base64,xx')).toBeNull();
    expect(normalizeAvatarUrl('')).toBeNull();
    expect(normalizeAvatarUrl(null)).toBeNull();
  });

  it('hashes deterministically', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('builds keys from name + avatar hash and splits them back', () => {
    const k = participantKey('Ana', 'https://lh3.googleusercontent.com/a/x=s32');
    expect(k).toBe(participantKey('ana', 'https://lh3.googleusercontent.com/a/x=s96-c'));
    expect(keyName(k)).toBe('ana');
    expect(keyAvatar(k)).toMatch(/^[0-9a-f]{8}$/);
    expect(participantKey('Ana', null)).toBe('ana#0');
    expect(keyAvatar('ana#0~2')).toBe('0');
    expect(keyName('a#b#0')).toBe('a#b');
  });
});

describe('mergeSources', () => {
  const e = (name: string, avatarUrl: string | null = null, isSelf = false) => ({
    name,
    avatarUrl,
    isSelf,
  });

  it('merges the same person seen in tiles and the People panel', () => {
    const out = mergeSources([[e('Ana')], [e('Ana', 'https://x.test/a=s32', true)]]);
    expect(out).toEqual([e('Ana', 'https://x.test/a', true)]);
  });

  it('keeps genuine same-name duplicates from the most complete source', () => {
    const out = mergeSources([
      [e('Sam')],
      [e('Sam', 'https://x.test/1'), e('Sam', 'https://x.test/2')],
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.avatarUrl)).toEqual(['https://x.test/1', 'https://x.test/2']);
  });

  it('fills a missing avatar from another source', () => {
    const out = mergeSources([[e('Sam'), e('Sam')], [e('Sam', 'https://x.test/1')]]);
    expect(out).toHaveLength(2);
    expect(out.filter((o) => o.avatarUrl)).toHaveLength(1);
  });

  it('drops empty names and preserves first-seen order', () => {
    const out = mergeSources([
      [e('Ben'), e(' ')],
      [e('Ana'), e('Ben')],
    ]);
    expect(out.map((o) => o.name)).toEqual(['Ben', 'Ana']);
  });
});

describe('resolveSelf', () => {
  const e = (name: string, isSelf: boolean) => ({ name, avatarUrl: null, isSelf });
  it('keeps a single self', () => {
    expect(resolveSelf([e('Me', true), e('Ana', false)])).toEqual({
      entries: [e('Me', true), e('Ana', false)],
      ambiguous: false,
    });
  });
  it('drops the self flag when several entries claim it', () => {
    const out = resolveSelf([e('Me', true), e('Kim', true)]);
    expect(out.ambiguous).toBe(true);
    expect(out.entries.every((x) => !x.isSelf)).toBe(true);
  });
});
