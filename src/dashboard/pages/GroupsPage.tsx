import { useMemo, useState, type FormEvent } from 'react';
import * as db from '../../lib/db';
import { meetingsMatchingRule, newGroup, parseCodes } from '../../lib/groups';
import { formatDate } from '../../lib/time';
import {
  Button,
  Card,
  EmptyState,
  Field,
  LiveRegion,
  PageHeader,
  TextInput,
} from '../../ui/components';
import { notifyDataChanged } from '../../ui/notify';
import { useData } from '../data';
import { href } from '../router';

export function GroupsPage() {
  const { groups, meetings, loaded, reload } = useData();
  const [name, setName] = useState('');
  const [codes, setCodes] = useState('');
  const [status, setStatus] = useState('');

  const counts = useMemo(() => {
    const map = new Map<string, { count: number; last: number | null }>();
    for (const m of meetings) {
      if (!m.groupId) continue;
      const cur = map.get(m.groupId) ?? { count: 0, last: null };
      map.set(m.groupId, { count: cur.count + 1, last: Math.max(cur.last ?? 0, m.startedAt) });
    }
    return map;
  }, [meetings]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const group = newGroup(crypto.randomUUID(), name, Date.now(), parseCodes(codes));
    await db.putGroup(group);
    // Apply the rule to meetings already recorded with those codes.
    const matching = meetingsMatchingRule(group, meetings).filter((m) => m.groupId === null);
    for (const m of matching)
      await db.updateMeeting(m.id, (cur) => ({ ...cur, groupId: group.id }));
    setName('');
    setCodes('');
    await reload();
    notifyDataChanged();
    setStatus(
      `Group "${group.name}" created${matching.length ? ` with ${matching.length} existing meeting${matching.length === 1 ? '' : 's'}` : ''}.`,
    );
  };

  return (
    <>
      <LiveRegion message={status} />
      <PageHeader
        title="Groups"
        subtitle="Group meetings by class, team or course to see attendance across sessions."
      />

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-base font-semibold">New group</h2>
        <form
          onSubmit={(e) => void create(e)}
          className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
        >
          <Field label="Name" htmlFor="group-name">
            <TextInput
              id="group-name"
              required
              maxLength={120}
              placeholder="e.g. Physics 101 · Period 2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Auto-assign meeting codes (optional)"
            htmlFor="group-codes"
            hint="New calls with these codes join this group automatically. Paste codes or Meet links."
          >
            <TextInput
              id="group-codes"
              placeholder="abc-defg-hij"
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Create group
          </Button>
        </form>
      </Card>

      {!loaded ? null : groups.length === 0 ? (
        <EmptyState title="No groups yet">
          Create a group above, then assign meetings to it from a meeting’s page.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const info = counts.get(g.id);
            return (
              <li key={g.id}>
                <Card className="h-full p-4">
                  <a
                    href={href({ name: 'group', id: g.id })}
                    className="text-base font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-brand-100"
                  >
                    {g.name}
                  </a>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {info?.count ?? 0} meeting{info?.count === 1 ? '' : 's'}
                    {info?.last ? ` · last ${formatDate(info.last)}` : ''}
                  </p>
                  {g.autoAssignCodes.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      Auto-assigns:{' '}
                      <span className="font-mono">{g.autoAssignCodes.join(', ')}</span>
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
