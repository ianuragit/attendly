import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../src/lib/db';
import { newMeeting } from '../src/lib/meetings';

afterEach(async () => {
  await db.clearAllData();
});

describe('db', () => {
  it('stores and lists meetings newest first', async () => {
    await db.putMeeting(newMeeting('a', 'aaa-bbbb-ccc', null, 1_000, null));
    await db.putMeeting(newMeeting('b', 'aaa-bbbb-ccc', null, 2_000, null));
    expect((await db.listMeetings()).map((m) => m.id)).toEqual(['b', 'a']);
    expect(await db.listMeetingsByCode('aaa-bbbb-ccc')).toHaveLength(2);
    expect(await db.listMeetingsByStatus('active')).toHaveLength(2);
  });

  it('updates atomically and returns undefined for unknown ids', async () => {
    await db.putMeeting(newMeeting('a', 'aaa-bbbb-ccc', null, 1_000, null));
    const out = await db.updateMeeting('a', (m) => ({ ...m, notes: 'hi' }));
    expect(out?.notes).toBe('hi');
    expect((await db.getMeeting('a'))?.notes).toBe('hi');
    expect(await db.updateMeeting('zzz', (m) => m)).toBeUndefined();
    expect((await db.updateMeeting('a', () => null))?.notes).toBe('hi');
  });

  it('deleting a group unassigns its meetings', async () => {
    await db.putGroup({ id: 'g', name: 'Class', createdAt: 0, autoAssignCodes: ['aaa-bbbb-ccc'] });
    await db.putMeeting(newMeeting('a', 'aaa-bbbb-ccc', null, 1_000, 'g'));
    expect((await db.findGroupForCode('aaa-bbbb-ccc'))?.id).toBe('g');
    await db.deleteGroup('g');
    expect(await db.listGroups()).toEqual([]);
    expect((await db.getMeeting('a'))?.groupId).toBeNull();
  });

  it('bulkPut merges or replaces', async () => {
    await db.putMeeting(newMeeting('a', 'aaa-bbbb-ccc', null, 1_000, null));
    await db.bulkPut([newMeeting('b', 'aaa-bbbb-ccc', null, 2_000, null)], [], false);
    expect(await db.listMeetings()).toHaveLength(2);
    await db.bulkPut([newMeeting('c', 'aaa-bbbb-ccc', null, 3_000, null)], [], true);
    expect((await db.listMeetings()).map((m) => m.id)).toEqual(['c']);
  });
});
