import { useMemo, useState, type FormEvent } from 'react';
import * as db from '../../lib/db';
import { meetingsMatchingRule, parseCodes } from '../../lib/groups';
import { buildMatrix, type AttendanceMatrix } from '../../lib/matrix';
import { formatDate, formatDurationShort, toMinutes } from '../../lib/time';
import type { Group, Settings } from '../../lib/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  LiveRegion,
  PageHeader,
  Pill,
  Select,
  TextInput,
} from '../../ui/components';
import { useNow } from '../../ui/hooks';
import { notifyDataChanged } from '../../ui/notify';
import { useData } from '../data';
import { href, navigate } from '../router';

type CellMode = 'mark' | 'minutes';

export interface GroupActions {
  exportGroup?: (group: Group, matrix: AttendanceMatrix) => void;
}

export function GroupDetailPage({
  id,
  settings,
  actions = {},
}: {
  id: string;
  settings: Settings;
  actions?: GroupActions;
}) {
  const { groups, meetings, loaded, reload } = useData();
  const group = groups.find((g) => g.id === id);
  const now = useNow(30_000);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<CellMode>('mark');
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [codesDraft, setCodesDraft] = useState('');
  const [addId, setAddId] = useState('');

  const groupMeetings = useMemo(() => meetings.filter((m) => m.groupId === id), [meetings, id]);
  const others = useMemo(() => meetings.filter((m) => m.groupId !== id), [meetings, id]);
  const matrix = useMemo(
    () => buildMatrix(groupMeetings, settings, now),
    [groupMeetings, settings, now],
  );

  if (!loaded) return null;
  if (!group) {
    return (
      <EmptyState title="Group not found">
        <a className="text-brand-700 underline dark:text-brand-100" href={href({ name: 'groups' })}>
          Back to groups
        </a>
      </EmptyState>
    );
  }

  const done = async (message: string) => {
    await reload();
    notifyDataChanged();
    setStatus(message);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nameDraft.trim().slice(0, 120) || group.name;
    await db.putGroup({ ...group, name, autoAssignCodes: parseCodes(codesDraft) });
    setEditing(false);
    await done('Group saved');
  };

  const remove = async () => {
    if (!window.confirm(`Delete the group "${group.name}"? Its meetings are kept, just ungrouped.`))
      return;
    await db.deleteGroup(group.id);
    await done('Group deleted');
    navigate({ name: 'groups' });
  };

  const assign = async (meetingId: string, groupId: string | null, message: string) => {
    await db.updateMeeting(meetingId, (m) => ({ ...m, groupId }));
    await done(message);
  };

  const applyRule = async () => {
    const matching = meetingsMatchingRule(group, meetings);
    for (const m of matching)
      await db.updateMeeting(m.id, (cur) => ({ ...cur, groupId: group.id }));
    await done(`${matching.length} meeting${matching.length === 1 ? '' : 's'} added by rule`);
  };

  const ruleMatches = meetingsMatchingRule(group, meetings).length;

  return (
    <>
      <LiveRegion message={status} />
      <p className="mb-2 text-sm">
        <a
          className="text-brand-700 hover:underline dark:text-brand-100"
          href={href({ name: 'groups' })}
        >
          ← All groups
        </a>
      </p>
      <PageHeader
        title={group.name}
        subtitle={`${groupMeetings.length} meeting${groupMeetings.length === 1 ? '' : 's'} · ${matrix.rows.length} ${matrix.rows.length === 1 ? 'person' : 'people'}`}
        actions={
          <>
            {actions.exportGroup && groupMeetings.length > 0 && (
              <Button onClick={() => actions.exportGroup?.(group, matrix)}>Export matrix…</Button>
            )}
            <Button
              onClick={() => {
                setNameDraft(group.name);
                setCodesDraft(group.autoAssignCodes.join(', '));
                setEditing((v) => !v);
              }}
              aria-expanded={editing}
              aria-controls="group-edit"
            >
              Edit group
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete group
            </Button>
          </>
        }
      />

      {editing && (
        <Card className="mb-6 p-4">
          <form
            id="group-edit"
            onSubmit={(e) => void saveEdit(e)}
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
          >
            <Field label="Name" htmlFor="edit-name">
              <TextInput
                id="edit-name"
                maxLength={120}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
            </Field>
            <Field
              label="Auto-assign meeting codes"
              htmlFor="edit-codes"
              hint="Comma-separated codes or Meet links."
            >
              <TextInput
                id="edit-codes"
                value={codesDraft}
                onChange={(e) => setCodesDraft(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6 flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-60 flex-1">
          <Field label="Add a meeting to this group" htmlFor="add-meeting">
            <Select id="add-meeting" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Choose a meeting…</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatDate(m.startedAt)} — {m.customTitle ?? m.detectedTitle ?? m.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          disabled={!addId}
          onClick={() => {
            void assign(addId, group.id, 'Meeting added');
            setAddId('');
          }}
        >
          Add
        </Button>
        {group.autoAssignCodes.length > 0 && (
          <Button variant="ghost" disabled={ruleMatches === 0} onClick={() => void applyRule()}>
            Apply code rule to past meetings ({ruleMatches})
          </Button>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Attendance matrix</h2>
        <fieldset className="flex items-center gap-1 rounded-md border border-slate-300 p-0.5 dark:border-slate-600">
          <legend className="sr-only">Cell display</legend>
          {(
            [
              ['mark', 'Present / absent'],
              ['minutes', 'Minutes'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                mode === value ? 'bg-brand-600 text-white' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <input
                type="radio"
                name="cell-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>

      {groupMeetings.length === 0 ? (
        <EmptyState title="No meetings in this group yet">
          Add meetings above, or set auto-assign codes so new calls land here automatically.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Attendance matrix for {group.name}: one row per person, one column per meeting
            </caption>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase dark:bg-slate-900 dark:text-slate-400"
                >
                  Person
                </th>
                {matrix.columns.map((c) => (
                  <th
                    key={c.meetingId}
                    scope="col"
                    className="px-2 py-3 text-center text-xs font-medium whitespace-nowrap"
                  >
                    <a
                      href={href({ name: 'meeting', id: c.meetingId })}
                      className="text-brand-700 hover:underline dark:text-brand-100"
                      title={c.title}
                    >
                      {formatDate(c.startedAt)}
                    </a>
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400"
                >
                  Attendance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {matrix.rows.map((r) => (
                <tr key={r.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium whitespace-nowrap dark:bg-slate-900"
                  >
                    {r.name} {r.isSelf && <Pill tone="slate">You</Pill>}
                  </th>
                  {r.cells.map((cell, i) => {
                    const col = matrix.columns[i];
                    const label = `${r.name}, ${col ? formatDate(col.startedAt) : ''}: ${
                      cell.present ? 'present' : 'absent'
                    }${cell.attended ? `, ${formatDurationShort(cell.totalMs)}` : ''}${cell.manualMark ? ' (marked manually)' : ''}`;
                    return (
                      <td key={i} className="px-2 py-2 text-center tabular-nums" title={label}>
                        <span className="sr-only">{label}</span>
                        <span
                          aria-hidden="true"
                          className={`inline-flex min-w-9 items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                            cell.present
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                              : cell.attended
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          } ${cell.manualMark ? 'ring-1 ring-brand-500' : ''}`}
                        >
                          {mode === 'minutes'
                            ? cell.attended
                              ? toMinutes(cell.totalMs)
                              : '–'
                            : cell.present
                              ? '✓'
                              : cell.attended
                                ? '~'
                                : '✗'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {r.attendancePct}%{' '}
                    <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
                      ({r.presentCount}/{matrix.columns.length})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 dark:border-slate-800">
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 bg-white px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase dark:bg-slate-900 dark:text-slate-400"
                >
                  Present
                </th>
                {matrix.columns.map((c) => (
                  <td
                    key={c.meetingId}
                    className="px-2 py-2 text-center text-xs font-semibold tabular-nums"
                  >
                    {c.presentCount}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        ✓ present · ~ joined but under {formatDurationShort(settings.minPresentMs)} · ✗ absent ·
        outlined cells were marked manually.
      </p>

      {groupMeetings.length > 0 && (
        <section className="mt-8" aria-labelledby="group-meetings">
          <h2 id="group-meetings" className="mb-3 text-lg font-semibold">
            Meetings in this group
          </h2>
          <Card>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupMeetings.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                >
                  <a
                    href={href({ name: 'meeting', id: m.id })}
                    className="text-sm text-brand-700 hover:underline dark:text-brand-100"
                  >
                    {formatDate(m.startedAt)} — {m.customTitle ?? m.detectedTitle ?? m.code}
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void assign(m.id, null, 'Meeting removed from group')}
                  >
                    Remove<span className="sr-only"> {formatDate(m.startedAt)} from group</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}
