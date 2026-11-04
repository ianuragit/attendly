/** Deterministic demo data for screenshots and UI tests. Names are invented. */
import type { Group, MeetingRecord, ParticipantRecord } from '../../src/lib/types';

const MIN = 60_000;
const STUDENTS = [
  'Amara Okoye',
  'Bruno Silva',
  'Chen Wei',
  'Dana Kowalski',
  'Elif Demir',
  'Farah Haddad',
  'Gabriel Moreau',
  'Hana Sato',
  'Isaac Mensah',
  'Julia Novak',
];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const key = (name: string) => `${name.toLowerCase()}#0`;

function person(name: string, isSelf: boolean, sessions: [number, number][]): ParticipantRecord {
  return {
    key: key(name),
    name,
    avatarUrl: null,
    isSelf,
    missingSince: null,
    sessions: sessions.map(([joinedAt, leftAt]) => ({ joinedAt, leftAt })),
  };
}

export function demoData(now: number): { groups: Group[]; meetings: MeetingRecord[] } {
  const groups: Group[] = [
    {
      id: 'g-physics',
      name: 'Physics 101 · Period 2',
      createdAt: now - 40 * 86_400_000,
      autoAssignCodes: ['phy-sics-one'],
    },
    { id: 'g-team', name: 'Team standup', createdAt: now - 40 * 86_400_000, autoAssignCodes: [] },
  ];
  const meetings: MeetingRecord[] = [];
  const day = 86_400_000;
  const base = new Date(now);
  base.setHours(9, 0, 0, 0);

  for (let i = 0; i < 6; i++) {
    const r = rng(42 + i);
    const start = base.getTime() - (i * 2 + 1) * day;
    const len = 50 * MIN;
    const participants = [person('Ms. Rivera', true, [[start, start + len]])];
    STUDENTS.forEach((name, idx) => {
      const roll = r();
      if (roll < 0.12 + (idx === 3 ? 0.4 : 0)) return; // absent
      const join = start + Math.floor(r() * 6) * MIN;
      if (roll > 0.85) {
        const drop = join + (10 + Math.floor(r() * 15)) * MIN;
        const back = drop + (2 + Math.floor(r() * 5)) * MIN;
        participants.push(
          person(name, false, [
            [join, drop],
            [back, start + len - Math.floor(r() * 3) * MIN],
          ]),
        );
      } else {
        participants.push(person(name, false, [[join, start + len - Math.floor(r() * 4) * MIN]]));
      }
    });
    meetings.push({
      id: `demo-phy-${i}`,
      code: 'phy-sics-one',
      detectedTitle: 'Physics 101',
      customTitle: null,
      notes: i === 0 ? 'Covered Newton’s second law. Homework: problems 4–9.' : '',
      startedAt: start,
      endedAt: start + len,
      lastSeenAt: start + len,
      status: 'ended',
      groupId: 'g-physics',
      participants,
      manualMarks: i === 1 ? { [key('Dana Kowalski')]: 'present' } : {},
      paused: false,
      schemaVersion: 1,
    });
  }

  for (let i = 0; i < 3; i++) {
    const start = base.getTime() - i * day + 30 * MIN;
    meetings.push({
      id: `demo-team-${i}`,
      code: 'tea-mstd-upx',
      detectedTitle: null,
      customTitle: 'Daily standup',
      notes: '',
      startedAt: start,
      endedAt: start + 15 * MIN,
      lastSeenAt: start + 15 * MIN,
      status: 'ended',
      groupId: 'g-team',
      participants: [
        person('Ms. Rivera', true, [[start, start + 15 * MIN]]),
        person('Priya Nair', false, [[start, start + 15 * MIN]]),
        person('Tomás Ortega', false, i === 1 ? [] : [[start + 2 * MIN, start + 14 * MIN]]),
      ].filter((p) => p.sessions.length > 0),
      manualMarks: {},
      paused: false,
      schemaVersion: 1,
    });
  }
  return { groups, meetings };
}
