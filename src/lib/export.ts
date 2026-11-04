/**
 * Export formatting: turns meetings, groups and matrices into tables, then into CSV, XLSX or
 * plain text. Everything here is pure; the dashboard handles downloading/clipboard.
 */
import { meetingDurationMs, meetingNow, meetingTitle, summarizeMeeting } from './attendance';
import type { AttendanceMatrix } from './matrix';
import { formatIsoLocal, toMinutes } from './time';
import type { Group, MeetingRecord, Settings } from './types';
import { writeXlsx, type CellValue, type Sheet } from './xlsx';

type ExportSettings = Pick<Settings, 'excludeSelf' | 'minPresentMs'>;

// ------------------------------------------------------------------------------------- CSV

/**
 * Neutralises spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) would be
 * executed as a formula by Excel/Sheets. Prefixing an apostrophe keeps it as text. Negative
 * numbers are passed as numbers, so they are unaffected.
 */
export function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: CellValue): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text = guardFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings. */
export function toCsv(rows: readonly (readonly CellValue[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** UTF-8 BOM so Excel opens non-ASCII names correctly. */
export const CSV_BOM = '﻿';

// ---------------------------------------------------------------------------------- tables

const iso = (ts: number | null): CellValue => (ts === null ? null : formatIsoLocal(ts));

/** One row per attendee of a meeting. */
export function meetingAttendanceRows(
  meeting: MeetingRecord,
  settings: ExportSettings,
  clock: number,
): CellValue[][] {
  const end = meetingNow(meeting, clock);
  const header: CellValue[] = [
    'Name',
    'Status',
    'First join',
    'Last leave',
    'Total minutes',
    'Sessions',
    'Marked manually',
    'Timeline',
  ];
  const rows = summarizeMeeting(meeting, settings, clock).map((s) => {
    const p = meeting.participants.find((x) => x.key === s.key);
    const timeline = (p?.sessions ?? [])
      .map(
        (x) =>
          `${formatIsoLocal(x.joinedAt).slice(11, 16)}-${formatIsoLocal(x.leftAt ?? end).slice(11, 16)}`,
      )
      .join('; ');
    return [
      s.name,
      s.present ? 'Present' : 'Absent',
      iso(s.firstJoin),
      s.presentNow ? null : iso(s.lastLeave),
      toMinutes(s.totalMs),
      s.sessionCount,
      s.manualMark ? 'Yes' : 'No',
      timeline,
    ];
  });
  return [header, ...rows];
}

/** Key/value summary of a meeting. */
export function meetingInfoRows(
  meeting: MeetingRecord,
  settings: ExportSettings,
  clock: number,
  groupName: string | null,
): CellValue[][] {
  const summaries = summarizeMeeting(meeting, settings, clock);
  return [
    ['Field', 'Value'],
    ['Title', meetingTitle(meeting)],
    ['Meeting code', meeting.code],
    ['Group', groupName],
    ['Started', iso(meeting.startedAt)],
    ['Ended', iso(meeting.endedAt)],
    ['Duration (minutes)', toMinutes(meetingDurationMs(meeting, clock))],
    ['Participants', summaries.length],
    ['Counted present', summaries.filter((s) => s.present).length],
    ['Minimum minutes to count as present', toMinutes(settings.minPresentMs)],
    ['Notes', meeting.notes || null],
  ];
}

/** Matrix as a table: Person, one column per meeting, then totals. */
export function matrixRows(matrix: AttendanceMatrix, mode: 'mark' | 'minutes'): CellValue[][] {
  const header: CellValue[] = [
    'Person',
    ...matrix.columns.map((c) => `${formatIsoLocal(c.startedAt).slice(0, 10)} ${c.title}`),
    'Meetings present',
    'Attendance %',
  ];
  const rows = matrix.rows.map((r) => [
    r.name,
    ...r.cells.map((c): CellValue =>
      mode === 'minutes'
        ? c.attended
          ? toMinutes(c.totalMs)
          : 0
        : c.present
          ? 'P'
          : c.attended
            ? 'Partial'
            : 'A',
    ),
    r.presentCount,
    r.attendancePct,
  ]);
  const totals: CellValue[] = ['Present', ...matrix.columns.map((c) => c.presentCount), null, null];
  return [header, ...rows, totals];
}

/** One row per meeting. */
export function meetingsListRows(
  meetings: readonly MeetingRecord[],
  groups: readonly Group[],
  settings: ExportSettings,
  clock: number,
): CellValue[][] {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return [
    [
      'Title',
      'Meeting code',
      'Group',
      'Started',
      'Ended',
      'Duration (minutes)',
      'Participants',
      'Counted present',
      'Notes',
    ],
    ...meetings.map((m) => {
      const s = summarizeMeeting(m, settings, clock);
      return [
        meetingTitle(m),
        m.code,
        m.groupId ? (groupName.get(m.groupId) ?? null) : null,
        iso(m.startedAt),
        iso(m.endedAt),
        toMinutes(meetingDurationMs(m, clock)),
        s.length,
        s.filter((x) => x.present).length,
        m.notes || null,
      ];
    }),
  ];
}

/** One row per (meeting, attendee) — the "long" format that pivots well. */
export function allAttendanceRows(
  meetings: readonly MeetingRecord[],
  groups: readonly Group[],
  settings: ExportSettings,
  clock: number,
): CellValue[][] {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const rows: CellValue[][] = [
    [
      'Meeting',
      'Meeting code',
      'Group',
      'Meeting start',
      'Name',
      'Status',
      'First join',
      'Last leave',
      'Total minutes',
      'Sessions',
    ],
  ];
  for (const m of meetings) {
    for (const s of summarizeMeeting(m, settings, clock)) {
      rows.push([
        meetingTitle(m),
        m.code,
        m.groupId ? (groupName.get(m.groupId) ?? null) : null,
        iso(m.startedAt),
        s.name,
        s.present ? 'Present' : 'Absent',
        iso(s.firstJoin),
        s.presentNow ? null : iso(s.lastLeave),
        toMinutes(s.totalMs),
        s.sessionCount,
      ]);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------- workbooks

export function meetingWorkbook(
  meeting: MeetingRecord,
  settings: ExportSettings,
  clock: number,
  groupName: string | null,
): Uint8Array {
  return writeXlsx([
    { name: 'Attendance', rows: meetingAttendanceRows(meeting, settings, clock) },
    { name: 'Meeting', rows: meetingInfoRows(meeting, settings, clock, groupName) },
  ]);
}

export function matrixWorkbook(groupName: string, matrix: AttendanceMatrix): Uint8Array {
  return writeXlsx([
    { name: groupName || 'Matrix', rows: matrixRows(matrix, 'mark') },
    { name: 'Minutes', rows: matrixRows(matrix, 'minutes') },
  ]);
}

export function allDataWorkbook(
  meetings: readonly MeetingRecord[],
  groups: readonly Group[],
  settings: ExportSettings,
  clock: number,
): Uint8Array {
  const sheets: Sheet[] = [
    { name: 'Meetings', rows: meetingsListRows(meetings, groups, settings, clock) },
    { name: 'Attendance', rows: allAttendanceRows(meetings, groups, settings, clock) },
  ];
  return writeXlsx(sheets);
}

// ----------------------------------------------------------------------------- plain text

/** Plain-text attendee list for pasting into chat/email. */
export function meetingPlainText(
  meeting: MeetingRecord,
  settings: ExportSettings,
  clock: number,
): string {
  const summaries = summarizeMeeting(meeting, settings, clock);
  const present = summaries.filter((s) => s.present);
  const absent = summaries.filter((s) => !s.present);
  const lines = [
    `${meetingTitle(meeting)} — ${formatIsoLocal(meeting.startedAt).slice(0, 16)}`,
    `Present (${present.length}):`,
    ...present.map((s) => `- ${s.name}`),
  ];
  if (absent.length)
    lines.push(
      '',
      `Below minimum / absent (${absent.length}):`,
      ...absent.map((s) => `- ${s.name}`),
    );
  return lines.join('\n');
}

// ------------------------------------------------------------------------------ filenames

/** Filesystem-safe filename stem. */
export function safeFilename(stem: string): string {
  const cleaned = stem
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'attendly';
}
