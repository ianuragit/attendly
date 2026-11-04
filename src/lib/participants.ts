/**
 * Pure helpers for turning raw names/avatars scraped from the Meet DOM into clean,
 * stable participant identities. No DOM access here, so everything is unit-testable.
 */
import type { SnapshotEntry } from './types';

export interface CleanedName {
  name: string;
  /** The raw label carried a "(You)"-style marker. */
  selfMarker: boolean;
  /** The label describes a screen-share tile rather than a person. */
  presentation: boolean;
}

// Suffixes Meet appends to a display name. English only; other UI languages fall back to
// the language-independent data attributes in selectors.ts for self detection.
const SELF_SUFFIX = /\s*[(（]\s*(you|me)\s*[)）]\s*$/i;
const BARE_SELF_SUFFIX = /\s+you$/i;
const DECORATION_SUFFIXES: RegExp[] = [
  /\s*[(（]\s*(presenting|host|meeting host|co-host|guest|external)\s*[)）]\s*$/i,
  /\s*[·•|-]?\s*(meeting host|co-host|presenting|is presenting)\s*$/i,
];
const PRESENTATION = /[(（]\s*presentation\s*[)）]\s*$|\bis presenting$|^you are presenting$/i;

/** Strips Meet decorations ("(You)", "Presenting", "Meeting host", …) from a display name. */
export function cleanName(raw: string): CleanedName {
  let name = raw.replace(/\s+/g, ' ').trim();
  const presentation = PRESENTATION.test(name);
  let selfMarker = false;

  // Decorations can stack ("Ana (You) Presenting"), so strip until stable.
  for (let i = 0; i < 5; i++) {
    const before = name;
    if (SELF_SUFFIX.test(name)) {
      selfMarker = true;
      name = name.replace(SELF_SUFFIX, '');
    }
    for (const re of DECORATION_SUFFIXES) name = name.replace(re, '');
    name = name.trim();
    if (name === before) break;
  }
  // "Ana You" only counts as a self marker when something precedes it.
  if (BARE_SELF_SUFFIX.test(name) && name.split(' ').length > 1 && raw.trim().endsWith('You')) {
    selfMarker = true;
    name = name.replace(BARE_SELF_SUFFIX, '').trim();
  }
  return { name, selfMarker, presentation };
}

/** Lowercased, accent-insensitive, whitespace-collapsed form used for matching. */
export function normalizeName(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Google avatar URLs carry size/crop parameters ("=s64-p-k-rw-no", "?sz=32") that differ
 * between tiles and the People panel. Strip them so the same picture hashes identically.
 */
export function normalizeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return null; // ignore data:, blob:, relative URLs
  return trimmed.replace(/=[swh]\d+[^/?#]*$/i, '').replace(/[?#].*$/, '');
}

/** 32-bit FNV-1a, hex encoded. Not cryptographic; just a compact stable fingerprint. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable participant key: normalised name + avatar hash ("0" when there is no avatar). */
export function participantKey(name: string, avatarUrl: string | null): string {
  const avatar = normalizeAvatarUrl(avatarUrl);
  return `${normalizeName(name)}#${avatar ? hashString(avatar) : '0'}`;
}

/** Normalised name part of a key. */
export function keyName(key: string): string {
  const i = key.lastIndexOf('#');
  return i === -1 ? key : key.slice(0, i);
}

/** Avatar-hash part of a key, or "0". */
export function keyAvatar(key: string): string {
  const i = key.lastIndexOf('#');
  const rest = i === -1 ? '0' : key.slice(i + 1);
  return rest.split('~')[0] ?? '0';
}

/**
 * Merges participant lists read from several DOM sources (video tiles, People panel) into one
 * entry per person.
 *
 * For each name, the source that lists it the most times decides how many people share that
 * name (two "Sam"s in the panel really are two people). Avatars and the self flag found in
 * other sources are then filled in where they don't conflict.
 */
export function mergeSources(sources: readonly (readonly SnapshotEntry[])[]): SnapshotEntry[] {
  const order: string[] = [];
  const bySource = sources.map((source) => {
    const groups = new Map<string, SnapshotEntry[]>();
    for (const raw of source) {
      const name = raw.name.replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const norm = normalizeName(name);
      if (!order.includes(norm)) order.push(norm);
      const entry: SnapshotEntry = { ...raw, name, avatarUrl: normalizeAvatarUrl(raw.avatarUrl) };
      const list = groups.get(norm);
      if (list) list.push(entry);
      else groups.set(norm, [entry]);
    }
    return groups;
  });

  const out: SnapshotEntry[] = [];
  for (const norm of order) {
    const groups = bySource
      .map((g) => g.get(norm))
      .filter((g): g is SnapshotEntry[] => g !== undefined);
    const avatarCount = (g: SnapshotEntry[]) => g.filter((e) => e.avatarUrl).length;
    const base = groups.reduce((best, g) =>
      g.length > best.length || (g.length === best.length && avatarCount(g) > avatarCount(best))
        ? g
        : best,
    );
    const merged = base.map((e) => ({ ...e }));
    for (const group of groups) {
      if (group === base) continue;
      for (const extra of group) {
        let target = extra.avatarUrl
          ? merged.find((m) => m.avatarUrl === extra.avatarUrl)
          : undefined;
        if (!target && extra.avatarUrl) {
          target = merged.find((m) => m.avatarUrl === null);
          if (target) target.avatarUrl = extra.avatarUrl;
        }
        if (extra.isSelf && !merged.some((m) => m.isSelf)) {
          const selfTarget = target ?? merged[0];
          if (selfTarget) selfTarget.isSelf = true;
        }
      }
    }
    out.push(...merged);
  }
  return out;
}
