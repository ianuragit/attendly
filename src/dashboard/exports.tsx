/** Wires the pure export functions to dialogs, downloads and the clipboard. */
import { useState, type ReactNode } from 'react';
import { meetingTitle } from '../lib/attendance';
import {
  allAttendanceRows,
  allDataWorkbook,
  CSV_BOM,
  matrixRows,
  matrixWorkbook,
  meetingAttendanceRows,
  meetingPlainText,
  meetingWorkbook,
  safeFilename,
  toCsv,
} from '../lib/export';
import type { AttendanceMatrix } from '../lib/matrix';
import { toDateInputValue } from '../lib/time';
import type { Group, MeetingRecord, Settings } from '../lib/types';
import { XLSX_MIME } from '../lib/xlsx';
import { ExportDialog, type ExportOption } from './components/ExportDialog';
import { copyText, downloadBytes, downloadText, todayStamp } from './download';

const CSV_MIME = 'text/csv;charset=utf-8';

type Request = { title: string; options: ExportOption[] } | null;

export function useExports(settings: Settings, meetings: MeetingRecord[], groups: Group[]) {
  const [request, setRequest] = useState<Request>(null);
  const groupName = (id: string | null) =>
    id ? (groups.find((g) => g.id === id)?.name ?? null) : null;

  const exportMeeting = (m: MeetingRecord) => {
    const stem = safeFilename(`attendly-${toDateInputValue(m.startedAt)}-${meetingTitle(m)}`);
    setRequest({
      title: `Export “${meetingTitle(m)}”`,
      options: [
        {
          label: 'Excel workbook (.xlsx)',
          description: 'Attendance sheet plus a meeting summary sheet.',
          run: () =>
            downloadBytes(
              `${stem}.xlsx`,
              meetingWorkbook(m, settings, Date.now(), groupName(m.groupId)),
              XLSX_MIME,
            ),
        },
        {
          label: 'CSV (.csv)',
          description: 'One row per attendee. Opens in Excel, Numbers and Google Sheets.',
          run: () =>
            downloadText(
              `${stem}.csv`,
              CSV_BOM + toCsv(meetingAttendanceRows(m, settings, Date.now())),
              CSV_MIME,
            ),
        },
        {
          label: 'Copy as plain text',
          description: 'A simple list of who was present, ready to paste.',
          run: () => copyText(meetingPlainText(m, settings, Date.now())),
        },
      ],
    });
  };

  const copyMeeting = (m: MeetingRecord) => copyText(meetingPlainText(m, settings, Date.now()));

  const exportGroup = (group: Group, matrix: AttendanceMatrix) => {
    const stem = safeFilename(`attendly-${group.name}-${todayStamp()}`);
    setRequest({
      title: `Export “${group.name}” matrix`,
      options: [
        {
          label: 'Excel workbook (.xlsx)',
          description: 'Present/absent matrix and a minutes matrix, one sheet each.',
          run: () => downloadBytes(`${stem}.xlsx`, matrixWorkbook(group.name, matrix), XLSX_MIME),
        },
        {
          label: 'CSV — present/absent (.csv)',
          description: 'P = present, Partial = joined below the minimum, A = absent.',
          run: () =>
            downloadText(`${stem}.csv`, CSV_BOM + toCsv(matrixRows(matrix, 'mark')), CSV_MIME),
        },
        {
          label: 'CSV — minutes (.csv)',
          description: 'Minutes present per person per meeting.',
          run: () =>
            downloadText(
              `${stem}-minutes.csv`,
              CSV_BOM + toCsv(matrixRows(matrix, 'minutes')),
              CSV_MIME,
            ),
        },
      ],
    });
  };

  const exportAll = () => {
    const stem = `attendly-all-${todayStamp()}`;
    setRequest({
      title: 'Export all meetings',
      options: [
        {
          label: 'Excel workbook (.xlsx)',
          description: `${meetings.length} meetings: a meetings sheet and a one-row-per-attendee sheet.`,
          run: () =>
            downloadBytes(
              `${stem}.xlsx`,
              allDataWorkbook(meetings, groups, settings, Date.now()),
              XLSX_MIME,
            ),
        },
        {
          label: 'CSV (.csv)',
          description: 'One row per attendee per meeting — easy to pivot.',
          run: () =>
            downloadText(
              `${stem}.csv`,
              CSV_BOM + toCsv(allAttendanceRows(meetings, groups, settings, Date.now())),
              CSV_MIME,
            ),
        },
      ],
    });
  };

  const dialog: ReactNode = request ? (
    <ExportDialog
      title={request.title}
      options={request.options}
      onClose={() => setRequest(null)}
    />
  ) : null;

  return { exportMeeting, copyMeeting, exportGroup, exportAll, dialog };
}
