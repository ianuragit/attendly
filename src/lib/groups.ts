/** Pure helpers for groups. */
import { MEET_CODE_RE } from './messages';
import type { Group, MeetingRecord } from './types';

/** Parses a comma/space/newline separated list of meeting codes or Meet URLs. */
export function parseCodes(input: string): string[] {
  const codes = input
    .split(/[\s,;]+/)
    .map((token) => {
      const t = token.trim().toLowerCase();
      const fromUrl = /meet\.google\.com\/(?:lookup\/)?([a-z0-9-]+)/.exec(t);
      return fromUrl?.[1] ?? t;
    })
    .filter((c) => c && MEET_CODE_RE.test(c));
  return [...new Set(codes)];
}

export function newGroup(id: string, name: string, now: number, codes: string[] = []): Group {
  return {
    id,
    name: name.trim().slice(0, 120) || 'Untitled group',
    createdAt: now,
    autoAssignCodes: codes,
  };
}

/** Meetings (not already in this group) that the group's auto-assign rule would claim. */
export function meetingsMatchingRule(
  group: Group,
  meetings: readonly MeetingRecord[],
): MeetingRecord[] {
  const codes = new Set(group.autoAssignCodes);
  return meetings.filter((m) => m.groupId !== group.id && codes.has(m.code));
}
