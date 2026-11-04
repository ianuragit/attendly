/**
 * JSON backup format and strict validation for restore. A backup file is untrusted input:
 * everything is checked and normalised before it touches the database.
 */
import { isParticipant, MEET_CODE_RE } from './messages';
import { sanitizeSettings } from './settings';
import type { Group, ManualMark, MeetingRecord, Settings } from './types';

export const BACKUP_APP = 'attendly';
export const BACKUP_VERSION = 1;
/** Refuse absurdly large files before parsing. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  settings: Settings;
  groups: Group[];
  meetings: MeetingRecord[];
}

export function createBackup(
  meetings: MeetingRecord[],
  groups: Group[],
  settings: Settings,
  now: number,
): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    settings,
    groups,
    meetings,
  };
}

export class BackupError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, field: string, max = 1_000): string => {
  if (typeof v !== 'string' || v.length > max) throw new BackupError(`Invalid ${field}`);
  return v;
};
const nullableStr = (v: unknown, field: string, max = 1_000): string | null =>
  v === null || v === undefined ? null : str(v, field, max);
const num = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BackupError(`Invalid ${field}`);
  return v;
};
const nullableNum = (v: unknown, field: string): number | null =>
  v === null || v === undefined ? null : num(v, field);

function parseGroup(v: unknown, i: number): Group {
  if (!isObj(v)) throw new BackupError(`Group ${i + 1} is not an object`);
  const codes = Array.isArray(v.autoAssignCodes) ? v.autoAssignCodes : [];
  return {
    id: str(v.id, 'group id', 100),
    name: str(v.name, 'group name', 120),
    createdAt: num(v.createdAt, 'group createdAt'),
    autoAssignCodes: codes
      .filter((c): c is string => typeof c === 'string' && MEET_CODE_RE.test(c))
      .slice(0, 200),
  };
}

function parseMeeting(v: unknown, i: number, groupIds: ReadonlySet<string>): MeetingRecord {
  const where = `Meeting ${i + 1}`;
  if (!isObj(v)) throw new BackupError(`${where} is not an object`);
  const code = str(v.code, `${where} code`, 64);
  if (!MEET_CODE_RE.test(code)) throw new BackupError(`${where} has an invalid code`);
  if (!Array.isArray(v.participants) || v.participants.length > 5_000) {
    throw new BackupError(`${where} has invalid participants`);
  }
  const seenKeys = new Set<string>();
  const participants = v.participants.map((p, j) => {
    if (!isParticipant(p)) throw new BackupError(`${where}, participant ${j + 1} is invalid`);
    if (seenKeys.has(p.key)) throw new BackupError(`${where} has a duplicate participant`);
    seenKeys.add(p.key);
    return {
      key: p.key,
      name: p.name,
      avatarUrl: p.avatarUrl,
      isSelf: p.isSelf,
      missingSince: null,
      sessions: p.sessions.map((s) => ({ joinedAt: s.joinedAt, leftAt: s.leftAt })),
    };
  });
  const startedAt = num(v.startedAt, `${where} startedAt`);
  const endedAt = nullableNum(v.endedAt, `${where} endedAt`);
  const lastSeenAt = nullableNum(v.lastSeenAt, `${where} lastSeenAt`) ?? endedAt ?? startedAt;
  const marks: Record<string, ManualMark> = {};
  if (isObj(v.manualMarks)) {
    for (const [k, m] of Object.entries(v.manualMarks)) {
      // Only keep marks for participants that exist in this meeting.
      if ((m === 'present' || m === 'absent') && seenKeys.has(k)) marks[k] = m;
    }
  }
  const groupId = nullableStr(v.groupId, `${where} groupId`, 100);
  return {
    id: str(v.id, `${where} id`, 100),
    code: code.toLowerCase(),
    detectedTitle: nullableStr(v.detectedTitle, `${where} title`, 500),
    customTitle: nullableStr(v.customTitle, `${where} title`, 500),
    notes: typeof v.notes === 'string' ? v.notes.slice(0, 20_000) : '',
    startedAt,
    // Restored meetings are never live: close anything that was active when backed up.
    endedAt: endedAt ?? lastSeenAt,
    lastSeenAt,
    status: 'ended',
    groupId: groupId !== null && groupIds.has(groupId) ? groupId : null,
    participants: participants.map((p) => ({
      ...p,
      sessions: p.sessions.map((s) =>
        s.leftAt === null ? { ...s, leftAt: Math.max(s.joinedAt, endedAt ?? lastSeenAt) } : s,
      ),
    })),
    manualMarks: marks,
    paused: false,
    schemaVersion: 1,
  };
}

/** Parses and validates backup JSON text. Throws BackupError with a readable message. */
export function parseBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES)
    throw new BackupError('File is too large to be an Attendly backup');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('File is not valid JSON');
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) throw new BackupError('Not an Attendly backup file');
  if (raw.version !== BACKUP_VERSION)
    throw new BackupError(`Unsupported backup version: ${String(raw.version)}`);
  if (!Array.isArray(raw.groups) || !Array.isArray(raw.meetings))
    throw new BackupError('Backup is missing data');
  if (raw.meetings.length > 100_000 || raw.groups.length > 10_000)
    throw new BackupError('Backup has too many records');

  const groups = raw.groups.map(parseGroup);
  const groupIds = new Set(groups.map((g) => g.id));
  const meetings = raw.meetings.map((m, i) => parseMeeting(m, i, groupIds));
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt.slice(0, 40) : '',
    settings: sanitizeSettings(raw.settings),
    groups,
    meetings,
  };
}
