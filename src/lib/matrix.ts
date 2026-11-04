/**
 * Pure attendance matrix for a group: rows = people, columns = meetings.
 *
 * Cross-meeting identity: people are matched by normalised name. If the same name appears more
 * than once *within one meeting* (two different people), those records keep their full key so
 * they stay separate rows.
 */
import { meetingNow, meetingTitle, summarizeParticipant } from './attendance';
import { keyName } from './participants';
import type { ManualMark, MeetingRecord, Settings } from './types';

export interface MatrixColumn {
  meetingId: string;
  title: string;
  startedAt: number;
  presentCount: number;
}

export interface MatrixCell {
  /** Whether the person counts as present in that meeting. */
  present: boolean;
  /** Whether they were detected at all (even below the minimum). */
  attended: boolean;
  totalMs: number;
  manualMark: ManualMark | null;
}

export interface MatrixRow {
  id: string;
  name: string;
  isSelf: boolean;
  cells: MatrixCell[];
  presentCount: number;
  /** 0–100, rounded to one decimal. */
  attendancePct: number;
  totalMs: number;
}

export interface AttendanceMatrix {
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

/** Identity of a participant across meetings (see module comment). */
export function personId(key: string, duplicateNames: ReadonlySet<string>): string {
  const name = keyName(key);
  return duplicateNames.has(name) ? key : name;
}

export function buildMatrix(
  meetings: readonly MeetingRecord[],
  settings: Pick<Settings, 'excludeSelf' | 'minPresentMs'>,
  clock: number,
): AttendanceMatrix {
  const sorted = [...meetings].sort((a, b) => a.startedAt - b.startedAt);
  const people = new Map<string, { name: string; isSelf: boolean; cells: (MatrixCell | null)[] }>();

  sorted.forEach((m, col) => {
    const now = meetingNow(m, clock);
    const counts = new Map<string, number>();
    for (const p of m.participants)
      counts.set(keyName(p.key), (counts.get(keyName(p.key)) ?? 0) + 1);
    const dupes = new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));

    for (const p of m.participants) {
      if (settings.excludeSelf && p.isSelf) continue;
      const id = personId(p.key, dupes);
      const s = summarizeParticipant(p, now, settings.minPresentMs, m.manualMarks[p.key] ?? null);
      let row = people.get(id);
      if (!row) {
        row = { name: p.name, isSelf: p.isSelf, cells: sorted.map(() => null) };
        people.set(id, row);
      }
      row.name = p.name; // latest spelling wins (meetings are processed oldest first)
      row.isSelf ||= p.isSelf;
      const prev = row.cells[col];
      // Merge if the same person somehow appears twice in one meeting.
      row.cells[col] = prev
        ? {
            present: prev.present || s.present,
            attended: true,
            totalMs: prev.totalMs + s.totalMs,
            manualMark: prev.manualMark ?? s.manualMark,
          }
        : {
            present: s.present,
            attended: s.sessionCount > 0,
            totalMs: s.totalMs,
            manualMark: s.manualMark,
          };
    }
  });

  const rows: MatrixRow[] = [...people].map(([id, r]) => {
    const cells = r.cells.map(
      (c) => c ?? { present: false, attended: false, totalMs: 0, manualMark: null },
    );
    const presentCount = cells.filter((c) => c.present).length;
    return {
      id,
      name: r.name,
      isSelf: r.isSelf,
      cells,
      presentCount,
      attendancePct: sorted.length ? Math.round((presentCount / sorted.length) * 1000) / 10 : 0,
      totalMs: cells.reduce((sum, c) => sum + c.totalMs, 0),
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const columns: MatrixColumn[] = sorted.map((m, i) => ({
    meetingId: m.id,
    title: meetingTitle(m),
    startedAt: m.startedAt,
    presentCount: rows.filter((r) => r.cells[i]?.present).length,
  }));
  return { columns, rows };
}
