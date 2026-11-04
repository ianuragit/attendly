import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  allAttendanceRows,
  csvCell,
  guardFormula,
  matrixRows,
  meetingAttendanceRows,
  meetingInfoRows,
  meetingPlainText,
  meetingsListRows,
  meetingWorkbook,
  safeFilename,
  toCsv,
} from '../src/lib/export';
import { buildMatrix } from '../src/lib/matrix';
import { newMeeting } from '../src/lib/meetings';
import type { MeetingRecord } from '../src/lib/types';
import { columnName, safeSheetNames, writeXlsx, xmlEscape } from '../src/lib/xlsx';

const M = 60_000;
const T = new Date(2026, 2, 10, 9, 0, 0).getTime();
const S = { excludeSelf: false, minPresentMs: 5 * M };

const meeting: MeetingRecord = {
  ...newMeeting('m1', 'abc-defg-hij', 'Physics, "Period 2"', T, 'g1'),
  status: 'ended',
  endedAt: T + 60 * M,
  lastSeenAt: T + 60 * M,
  notes: 'Line 1\nLine 2',
  participants: [
    {
      key: 'ana#0',
      name: 'Ana',
      avatarUrl: null,
      isSelf: false,
      missingSince: null,
      sessions: [
        { joinedAt: T, leftAt: T + 20 * M },
        { joinedAt: T + 30 * M, leftAt: T + 60 * M },
      ],
    },
    {
      key: '=cmd#0',
      name: '=HYPERLINK("x")',
      avatarUrl: null,
      isSelf: false,
      missingSince: null,
      sessions: [{ joinedAt: T + 5 * M, leftAt: T + 7 * M }],
    },
    {
      key: 'me#0',
      name: 'Me',
      avatarUrl: null,
      isSelf: true,
      missingSince: null,
      sessions: [{ joinedAt: T, leftAt: T + 60 * M }],
    },
  ],
  manualMarks: { 'me#0': 'absent' },
};

describe('CSV', () => {
  it('guards against formula injection', () => {
    for (const v of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1'])
      expect(guardFormula(v)).toBe(`'${v}`);
    expect(guardFormula('Ana')).toBe('Ana');
    expect(csvCell(-5)).toBe('-5');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('TRUE');
  });

  it('joins rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', null],
      ]),
    ).toBe('a,1\r\nb,\r\n');
  });
});

describe('tables', () => {
  it('builds the per-meeting attendance table', () => {
    const rows = meetingAttendanceRows(meeting, S, 0);
    expect(rows[0]).toEqual([
      'Name',
      'Status',
      'First join',
      'Last leave',
      'Total minutes',
      'Sessions',
      'Marked manually',
      'Timeline',
    ]);
    const ana = rows.find((r) => r[0] === 'Ana')!;
    expect(ana).toEqual([
      'Ana',
      'Present',
      '2026-03-10 09:00:00',
      '2026-03-10 10:00:00',
      50,
      2,
      'No',
      '09:00-09:20; 09:30-10:00',
    ]);
    expect(rows.find((r) => r[0] === 'Me')!.slice(0, 2)).toEqual(['Me', 'Absent']);
    expect(rows.find((r) => String(r[0]).startsWith('='))![1]).toBe('Absent');
  });

  it('honours exclude-self', () => {
    expect(
      meetingAttendanceRows(meeting, { ...S, excludeSelf: true }, 0).some((r) => r[0] === 'Me'),
    ).toBe(false);
  });

  it('builds the info, list and long-format tables', () => {
    const info = meetingInfoRows(meeting, S, 0, 'Physics');
    expect(info).toContainEqual(['Duration (minutes)', 60]);
    expect(info).toContainEqual(['Group', 'Physics']);
    expect(info).toContainEqual(['Counted present', 1]);
    const list = meetingsListRows(
      [meeting],
      [{ id: 'g1', name: 'Physics', createdAt: 0, autoAssignCodes: [] }],
      S,
      0,
    );
    expect(list[1]).toEqual([
      'Physics, "Period 2"',
      'abc-defg-hij',
      'Physics',
      '2026-03-10 09:00:00',
      '2026-03-10 10:00:00',
      60,
      3,
      1,
      'Line 1\nLine 2',
    ]);
    expect(allAttendanceRows([meeting], [], S, 0)).toHaveLength(4);
  });

  it('builds matrix tables in both modes', () => {
    const mx = buildMatrix([meeting], S, 0);
    const marks = matrixRows(mx, 'mark');
    expect(marks[0]).toEqual([
      'Person',
      '2026-03-10 Physics, "Period 2"',
      'Meetings present',
      'Attendance %',
    ]);
    expect(marks.find((r) => r[0] === 'Ana')).toEqual(['Ana', 'P', 1, 100]);
    expect(marks.find((r) => r[0] === 'Me')).toEqual(['Me', 'Partial', 0, 0]);
    expect(marks.at(-1)).toEqual(['Present', 1, null, null]);
    expect(matrixRows(mx, 'minutes').find((r) => r[0] === 'Ana')).toEqual(['Ana', 50, 1, 100]);
  });

  it('produces a plain-text list', () => {
    expect(meetingPlainText(meeting, S, 0)).toBe(
      [
        'Physics, "Period 2" — 2026-03-10 09:00',
        'Present (1):',
        '- Ana',
        '',
        'Below minimum / absent (2):',
        '- Me',
        '- =HYPERLINK("x")',
      ].join('\n'),
    );
  });

  it('makes safe filenames', () => {
    expect(safeFilename('Physics: "Period 2" / Zoë')).toBe('Physics-Period-2-Zoe');
    expect(safeFilename('///')).toBe('attendly');
  });
});

describe('XLSX writer', () => {
  it('names columns', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('makes valid unique sheet names', () => {
    expect(safeSheetNames(['a/b', 'A/B', '', 'x'.repeat(40), "'q'"])).toEqual([
      'a b',
      'A B (2)',
      'Sheet',
      'x'.repeat(31),
      'q',
    ]);
  });

  it('escapes XML and strips invalid characters', () => {
    expect(xmlEscape('<a & "b">\u0001')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });

  it('writes a workbook with the expected parts and cells', () => {
    const files = unzipSync(
      writeXlsx([
        {
          name: 'Data',
          rows: [
            ['Name', 'Minutes'],
            ['=1+1 <x>', 12.5],
            [null, true],
          ],
        },
      ]),
    );
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>',
    );
    expect(sheet).toContain(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve">=1+1 &lt;x&gt;</t></is></c>',
    );
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="B3" t="b"><v>1</v></c>');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('state="frozen"');
    expect(strFromU8(files['xl/workbook.xml']!)).toContain(
      '<sheet name="Data" sheetId="1" r:id="rId1"/>',
    );
  });

  it('writes the meeting workbook with two sheets', () => {
    const files = unzipSync(meetingWorkbook(meeting, S, 0, null));
    expect(files['xl/worksheets/sheet2.xml']).toBeDefined();
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Meeting"');
  });
});
