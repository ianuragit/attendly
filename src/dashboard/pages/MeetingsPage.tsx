import { useMemo, useState } from 'react';
import { buildHistory, DEFAULT_QUERY, type HistoryQuery, type SortKey } from '../../lib/history';
import { formatDate, formatDurationShort, formatTime, parseDateInput } from '../../lib/time';
import type { Settings } from '../../lib/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Pill,
  Select,
  TextInput,
} from '../../ui/components';
import { useNow } from '../../ui/hooks';
import { useData } from '../data';
import { href } from '../router';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'title', label: 'Meeting' },
  { key: 'duration', label: 'Duration', className: 'text-right' },
  { key: 'attendees', label: 'Present', className: 'text-right' },
];

export function MeetingsPage({
  settings,
  onExportAll,
}: {
  settings: Settings;
  onExportAll?: () => void;
}) {
  const { meetings, groups, loaded, error } = useData();
  const now = useNow(5_000);
  const [query, setQuery] = useState<HistoryQuery>(DEFAULT_QUERY);
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  const rows = useMemo(
    () => buildHistory(meetings, query, settings, now),
    [meetings, query, settings, now],
  );
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const filtered =
    query.search || query.from !== null || query.to !== null || query.groupId !== null;

  const sortBy = (key: SortKey) =>
    setQuery((q) => ({
      ...q,
      sort: key,
      dir: q.sort === key ? (q.dir === 'asc' ? 'desc' : 'asc') : key === 'title' ? 'asc' : 'desc',
    }));

  const reset = () => {
    setQuery(DEFAULT_QUERY);
    setFromInput('');
    setToInput('');
  };

  return (
    <>
      <PageHeader
        title="Meetings"
        subtitle={
          loaded
            ? `${meetings.length} recorded meeting${meetings.length === 1 ? '' : 's'}`
            : 'Loading…'
        }
        actions={
          onExportAll && meetings.length > 0 ? (
            <Button onClick={onExportAll}>Export all…</Button>
          ) : undefined
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <Card className="mb-4 p-4">
        <form
          role="search"
          aria-label="Filter meetings"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end"
          onSubmit={(e) => e.preventDefault()}
        >
          <Field label="Search" htmlFor="search">
            <TextInput
              id="search"
              type="search"
              placeholder="Title, code, notes or attendee"
              value={query.search}
              onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value }))}
            />
          </Field>
          <Field label="From" htmlFor="from">
            <TextInput
              id="from"
              type="date"
              value={fromInput}
              onChange={(e) => {
                setFromInput(e.target.value);
                setQuery((q) => ({ ...q, from: parseDateInput(e.target.value) }));
              }}
            />
          </Field>
          <Field label="To" htmlFor="to">
            <TextInput
              id="to"
              type="date"
              value={toInput}
              onChange={(e) => {
                setToInput(e.target.value);
                setQuery((q) => ({ ...q, to: parseDateInput(e.target.value) }));
              }}
            />
          </Field>
          <Field label="Group" htmlFor="group-filter">
            <Select
              id="group-filter"
              value={query.groupId ?? ''}
              onChange={(e) => setQuery((q) => ({ ...q, groupId: e.target.value || null }))}
            >
              <option value="">All meetings</option>
              <option value="none">Not in a group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="ghost" onClick={reset} disabled={!filtered}>
            Clear filters
          </Button>
        </form>
      </Card>

      {!loaded ? null : meetings.length === 0 ? (
        <EmptyState title="No meetings recorded yet">
          Join a Meet call and Attendly will record attendance automatically. It will show up here.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No meetings match these filters" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Meeting history, sorted by {query.sort}{' '}
              {query.dir === 'asc' ? 'ascending' : 'descending'}
            </caption>
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <tr>
                {COLUMNS.map((c) => {
                  const active = query.sort === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                      className={`px-4 py-3 font-semibold ${c.className ?? ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => sortBy(c.key)}
                        className="inline-flex items-center gap-1 rounded uppercase hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:text-white"
                      >
                        {c.label}
                        <span aria-hidden="true">
                          {active ? (query.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(({ meeting: m, title, durationMs, attendees }) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="block">{formatDate(m.startedAt)}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                      {formatTime(m.startedAt, settings.timeFormat)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={href({ name: 'meeting', id: m.id })}
                      className="font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-brand-100"
                    >
                      {title}
                    </a>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-mono">{m.code}</span>
                      {m.status === 'active' && <Pill tone="green">Live</Pill>}
                      {m.groupId && groupName.get(m.groupId) && (
                        <Pill tone="blue">{groupName.get(m.groupId)}</Pill>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatDurationShort(durationMs)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{attendees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
