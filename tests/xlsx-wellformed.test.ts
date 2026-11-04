// @vitest-environment jsdom
/** Every part of a generated workbook must be well-formed XML (audit #1). */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { allDataWorkbook, matrixWorkbook, meetingWorkbook } from '../src/lib/export';
import { buildMatrix } from '../src/lib/matrix';
import { demoData } from './fixtures/demo-data';

const S = { excludeSelf: false, minPresentMs: 60_000 };
const { meetings, groups } = demoData(Date.UTC(2026, 10, 4));

const books: [string, Uint8Array][] = [
  ['meeting', meetingWorkbook(meetings[0]!, S, 0, 'Physics <&> "1"')],
  ['matrix', matrixWorkbook('Physics: 101/2', buildMatrix(meetings.slice(0, 6), S, 0))],
  ['all data', allDataWorkbook(meetings, groups, S, 0)],
];

describe('XLSX well-formedness', () => {
  for (const [name, bytes] of books) {
    it(`${name} workbook parts all parse`, () => {
      const parts = unzipSync(bytes);
      for (const [path, data] of Object.entries(parts)) {
        const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
        const error = doc.getElementsByTagName('parsererror')[0];
        expect(error?.textContent ?? null, `${path} is not well-formed`).toBeNull();
      }
    });
  }
});
