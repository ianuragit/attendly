/**
 * IndexedDB persistence (via `idb`). Used by the service worker and the dashboard; both run
 * on the extension origin and therefore share the same database. Content scripts run on the
 * Meet origin and never touch this directly — they message the service worker instead.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Group, MeetingRecord } from './types';

export const DB_NAME = 'attendly';
export const DB_VERSION = 1;

interface AttendlyDB extends DBSchema {
  meetings: {
    key: string;
    value: MeetingRecord;
    indexes: { 'by-startedAt': number; 'by-code': string; 'by-status': string };
  };
  groups: {
    key: string;
    value: Group;
  };
}

let dbPromise: Promise<IDBPDatabase<AttendlyDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AttendlyDB>> {
  dbPromise ??= openDB<AttendlyDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const meetings = db.createObjectStore('meetings', { keyPath: 'id' });
      meetings.createIndex('by-startedAt', 'startedAt');
      meetings.createIndex('by-code', 'code');
      meetings.createIndex('by-status', 'status');
      db.createObjectStore('groups', { keyPath: 'id' });
    },
    blocking() {
      // Another context wants to upgrade: close so it isn't blocked forever.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** For tests: drop the cached connection. */
export async function resetDbConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

// ---------------------------------------------------------------------------------- meetings

export async function getMeeting(id: string): Promise<MeetingRecord | undefined> {
  return (await getDb()).get('meetings', id);
}

/** All meetings, newest first. */
export async function listMeetings(): Promise<MeetingRecord[]> {
  const all = await (await getDb()).getAllFromIndex('meetings', 'by-startedAt');
  return all.reverse();
}

export async function listMeetingsByStatus(
  status: MeetingRecord['status'],
): Promise<MeetingRecord[]> {
  return (await getDb()).getAllFromIndex('meetings', 'by-status', status);
}

export async function listMeetingsByCode(code: string): Promise<MeetingRecord[]> {
  return (await getDb()).getAllFromIndex('meetings', 'by-code', code);
}

export async function putMeeting(meeting: MeetingRecord): Promise<void> {
  await (await getDb()).put('meetings', meeting);
}

/**
 * Atomic read-modify-write of one meeting. `fn` returns the new record, or null to leave it
 * unchanged. Returns the stored result (undefined when the meeting doesn't exist).
 */
export async function updateMeeting(
  id: string,
  fn: (m: MeetingRecord) => MeetingRecord | null,
): Promise<MeetingRecord | undefined> {
  const tx = (await getDb()).transaction('meetings', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return undefined;
  }
  const next = fn(current);
  if (next) await tx.store.put(next);
  await tx.done;
  return next ?? current;
}

export async function deleteMeeting(id: string): Promise<void> {
  await (await getDb()).delete('meetings', id);
}

// ------------------------------------------------------------------------------------ groups

export async function listGroups(): Promise<Group[]> {
  const groups = await (await getDb()).getAll('groups');
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGroup(id: string): Promise<Group | undefined> {
  return (await getDb()).get('groups', id);
}

export async function putGroup(group: Group): Promise<void> {
  await (await getDb()).put('groups', group);
}

/** Deletes a group and unassigns its meetings (the meetings themselves are kept). */
export async function deleteGroup(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['groups', 'meetings'], 'readwrite');
  await tx.objectStore('groups').delete(id);
  let cursor = await tx.objectStore('meetings').openCursor();
  while (cursor) {
    if (cursor.value.groupId === id) await cursor.update({ ...cursor.value, groupId: null });
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Group whose auto-assign rule matches a meeting code, if any. */
export async function findGroupForCode(code: string): Promise<Group | undefined> {
  const groups = await listGroups();
  return groups.find((g) => g.autoAssignCodes.includes(code));
}

// ---------------------------------------------------------------------------------- bulk ops

export async function clearAllData(): Promise<void> {
  const tx = (await getDb()).transaction(['groups', 'meetings'], 'readwrite');
  await Promise.all([
    tx.objectStore('groups').clear(),
    tx.objectStore('meetings').clear(),
    tx.done,
  ]);
}

/** Replaces or merges records in one transaction (used by backup restore). */
export async function bulkPut(
  meetings: MeetingRecord[],
  groups: Group[],
  replace: boolean,
): Promise<void> {
  const tx = (await getDb()).transaction(['groups', 'meetings'], 'readwrite');
  const ms = tx.objectStore('meetings');
  const gs = tx.objectStore('groups');
  if (replace) await Promise.all([ms.clear(), gs.clear()]);
  for (const g of groups) await gs.put(g);
  for (const m of meetings) await ms.put(m);
  await tx.done;
}
