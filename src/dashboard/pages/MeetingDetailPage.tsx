import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  meetingDurationMs,
  meetingNow,
  meetingTitle,
  summarizeMeeting,
} from '../../lib/attendance';
import * as db from '../../lib/db';
import { formatDate, formatDateTime, formatDurationShort, formatTime } from '../../lib/time';
import type { ManualMark, MeetingRecord, Settings } from '../../lib/types';
import {
  Avatar,
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
import { TimelineBar } from '../components/TimelineBar';
import { useData } from '../data';
import { href, navigate } from '../router';

export interface MeetingActions {
  exportMeeting?: (m: MeetingRecord) => void;
  copyMeeting?: (m: MeetingRecord) => Promise<void>;
}

export function MeetingDetailPage({
  id,
  settings,
  actions = {},
}: {
  id: string;
  settings: Settings;
  actions?: MeetingActions;
}) {
  const { meetings, groups, loaded, reload } = useData();
  const meeting = meetings.find((m) => m.id === id);
  const now = useNow(meeting?.status === 'active' ? 1_000 : 60_000);
  const [status, setStatus] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (meeting) document.title = `${meetingTitle(meeting)} · Attendly`;
  }, [meeting]);

  const summaries = useMemo(
    () => (meeting ? summarizeMeeting(meeting, settings, now) : []),
    [meeting, settings, now],
  );

  if (!loaded) return null;
  if (!meeting) {
    return (
      <EmptyState title="Meeting not found">
        It may have been deleted.{' '}
        <a
          className="text-brand-700 underline dark:text-brand-100"
          href={href({ name: 'meetings' })}
        >
          Back to meetings
        </a>
      </EmptyState>
    );
  }

  const update = async (fn: (m: MeetingRecord) => MeetingRecord, message: string) => {
    await db.updateMeeting(meeting.id, fn);
    await reload();
    notifyDataChanged();
    setStatus(message);
  };

  const saveTitle = async (e: FormEvent) => {
    e.preventDefault();
    const title = titleDraft.trim().slice(0, 300);
    await update((m) => ({ ...m, customTitle: title || null }), 'Title saved');
    setRenaming(false);
  };

  const saveNotes = async () => {
    if (notesDraft === null || notesDraft === meeting.notes) return;
    const notes = notesDraft.slice(0, 20_000);
    await update((m) => ({ ...m, notes }), 'Notes saved');
  };

  const setMark = (key: string, value: string) =>
    update((m) => {
      const manualMarks: Record<string, ManualMark> = Object.fromEntries(
        Object.entries(m.manualMarks).filter(([k]) => k !== key),
      );
      if (value === 'present' || value === 'absent') manualMarks[key] = value;
      return { ...m, manualMarks };
    }, 'Attendance updated');

  const remove = async () => {
    if (!window.confirm(`Delete "${meetingTitle(meeting)}"? This cannot be undone.`)) return;
    await db.deleteMeeting(meeting.id);
    notifyDataChanged();
    await reload();
    navigate({ name: 'meetings' });
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const end = meetingNow(meeting, now);
  const presentCount = summaries.filter((s) => s.present).length;
  const allExpanded = summaries.length > 0 && summaries.every((s) => expanded.has(s.key));

  return (
    <>
      <LiveRegion message={status} />
      <p className="mb-2 text-sm">
        <a
          className="text-brand-700 hover:underline dark:text-brand-100"
          href={href({ name: 'meetings' })}
        >
          ← All meetings
        </a>
      </p>

      <PageHeader
        title={
          renaming ? (
            <form onSubmit={(e) => void saveTitle(e)} className="flex flex-wrap items-center gap-2">
              <label htmlFor="title-input" className="sr-only">
                Meeting title
              </label>
              <TextInput
                id="title-input"
                autoFocus
                value={titleDraft}
                maxLength={300}
                placeholder={meeting.detectedTitle ?? meeting.code}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
                className="w-72 text-base"
              />
              <Button type="submit" variant="primary" size="sm">
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {meetingTitle(meeting)}
              {meeting.status === 'active' && (
                <Pill tone="green">{meeting.paused ? 'Live · paused' : 'Live'}</Pill>
              )}
            </span>
          )
        }
        subtitle={
          <>
            {formatDate(meeting.startedAt)}, {formatTime(meeting.startedAt, settings.timeFormat)}
            {meeting.endedAt !== null &&
              ` – ${formatTime(meeting.endedAt, settings.timeFormat)}`} ·{' '}
            <span className="font-mono">{meeting.code}</span>
          </>
        }
        actions={
          <>
            {!renaming && (
              <Button
                onClick={() => {
                  setTitleDraft(meeting.customTitle ?? '');
                  setRenaming(true);
                }}
              >
                Rename
              </Button>
            )}
            {actions.copyMeeting && (
              <Button
                onClick={() =>
                  void actions.copyMeeting?.(meeting).then(() => setStatus('Attendee list copied'))
                }
              >
                Copy list
              </Button>
            )}
            {actions.exportMeeting && (
              <Button onClick={() => actions.exportMeeting?.(meeting)}>Export…</Button>
            )}
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Duration', formatDurationShort(meetingDurationMs(meeting, now))],
          ['Counted present', `${presentCount} of ${summaries.length}`],
          ['Started', formatDateTime(meeting.startedAt, settings.timeFormat)],
          [
            'Ended',
            meeting.endedAt === null
              ? 'In progress'
              : formatDateTime(meeting.endedAt, settings.timeFormat),
          ],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-medium tracking-wide text-slate-600 uppercase dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="p-4">
          <Field
            label="Group"
            htmlFor="group-select"
            hint={groups.length === 0 ? 'Create groups on the Groups page.' : undefined}
          >
            <Select
              id="group-select"
              value={meeting.groupId ?? ''}
              onChange={(e) =>
                void update((m) => ({ ...m, groupId: e.target.value || null }), 'Group updated')
              }
            >
              <option value="">Not in a group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        <Card className="p-4">
          <label htmlFor="notes" className="mb-1 block text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            maxLength={20_000}
            value={notesDraft ?? meeting.notes}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => void saveNotes()}
            placeholder="Agenda, homework, follow-ups… (saved when you leave the field)"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          />
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Attendees</h2>
        {summaries.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={allExpanded}
            onClick={() =>
              setExpanded(allExpanded ? new Set() : new Set(summaries.map((s) => s.key)))
            }
          >
            {allExpanded ? 'Collapse all timelines' : 'Expand all timelines'}
          </Button>
        )}
      </div>

      {summaries.length === 0 ? (
        <EmptyState title="Nobody recorded yet">
          {meeting.status === 'active'
            ? 'Participants will appear here as they are detected.'
            : 'No participants were detected in this meeting.'}
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Attendance for {meetingTitle(meeting)}</caption>
            <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-600 uppercase dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  First join
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Last leave
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Sessions
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Attendance
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Timeline</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summaries.map((s) => {
                const p = meeting.participants.find((x) => x.key === s.key);
                const open = expanded.has(s.key);
                const rowId = `timeline-${s.key.replace(/[^a-z0-9]/gi, '_')}`;
                return (
                  <Fragment key={s.key}>
                    <tr className="align-middle">
                      <th scope="row" className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-2">
                          <Avatar name={s.name} />
                          <span className="min-w-0 break-words">{s.name}</span>
                          {s.isSelf && <Pill tone="slate">You</Pill>}
                          {s.presentNow && meeting.status === 'active' && (
                            <Pill tone="green">Here</Pill>
                          )}
                        </span>
                      </th>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {s.firstJoin === null ? '—' : formatTime(s.firstJoin, settings.timeFormat)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {s.presentNow
                          ? 'Still here'
                          : s.lastLeave === null
                            ? '—'
                            : formatTime(s.lastLeave, settings.timeFormat)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatDurationShort(s.totalMs)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.sessionCount}</td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`mark-${rowId}`}>
                          Attendance for {s.name}
                        </label>
                        <Select
                          id={`mark-${rowId}`}
                          value={s.manualMark ?? 'auto'}
                          onChange={(e) => void setMark(s.key, e.target.value)}
                          className={`w-auto py-1 ${s.present ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}
                        >
                          <option value="auto">
                            Auto ({s.totalMs >= settings.minPresentMs ? 'present' : 'absent'})
                          </option>
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={open}
                          aria-controls={rowId}
                          onClick={() => toggle(s.key)}
                        >
                          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                          Timeline
                          <span className="sr-only"> for {s.name}</span>
                        </Button>
                      </td>
                    </tr>
                    {open && p && (
                      <tr id={rowId} className="bg-slate-50 dark:bg-slate-800/40">
                        <td colSpan={7} className="px-4 py-3">
                          <TimelineBar
                            sessions={p.sessions}
                            start={meeting.startedAt}
                            end={end}
                            now={end}
                            timeFormat={settings.timeFormat}
                            label={s.name}
                          />
                          <div className="mt-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                            <span>{formatTime(meeting.startedAt, settings.timeFormat)}</span>
                            <span>
                              {meeting.endedAt === null
                                ? 'now'
                                : formatTime(end, settings.timeFormat)}
                            </span>
                          </div>
                          <ol className="mt-2 space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
                            {p.sessions.map((sess, i) => (
                              <li key={i} className="tabular-nums">
                                Session {i + 1}: {formatTime(sess.joinedAt, settings.timeFormat)} –{' '}
                                {sess.leftAt === null
                                  ? 'now'
                                  : formatTime(sess.leftAt, settings.timeFormat)}{' '}
                                ({formatDurationShort((sess.leftAt ?? end) - sess.joinedAt)})
                              </li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        “Auto” counts someone present after {formatDurationShort(settings.minPresentMs)} in the call
        {settings.excludeSelf ? '; you are hidden from this list' : ''}. Change this in Settings.
      </p>
    </>
  );
}
