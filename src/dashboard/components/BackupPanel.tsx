import { useRef, useState } from 'react';
import {
  BackupError,
  createBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  type Backup,
} from '../../lib/backup';
import * as db from '../../lib/db';
import { log } from '../../lib/log';
import { saveSettings } from '../../lib/settings';
import type { Settings } from '../../lib/types';
import { Button, Card } from '../../ui/components';
import { notifyDataChanged } from '../../ui/notify';
import { useData } from '../data';
import { downloadText, todayStamp } from '../download';

/** JSON backup export and restore (merge or replace). */
export function BackupPanel({ settings }: { settings: Settings }) {
  const { meetings, groups, reload } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const exportJson = () => {
    const backup = createBackup(meetings, groups, settings, Date.now());
    downloadText(
      `attendly-backup-${todayStamp()}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
    setMessage({
      tone: 'ok',
      text: `Backup of ${meetings.length} meetings and ${groups.length} groups downloaded.`,
    });
  };

  const onFile = async (file: File | undefined) => {
    setPending(null);
    setMessage(null);
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new BackupError('File is too large to be an Attendly backup');
      setPending(parseBackup(await file.text()));
    } catch (err) {
      log.warn('Backup rejected', err);
      setMessage({
        tone: 'error',
        text: err instanceof BackupError ? err.message : 'Could not read that file.',
      });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const restore = async (replace: boolean) => {
    if (!pending) return;
    if (
      replace &&
      !window.confirm(
        'Replace ALL current meetings and groups with this backup? This cannot be undone.',
      )
    ) {
      return;
    }
    try {
      await db.bulkPut(pending.meetings, pending.groups, replace);
      if (replace) await saveSettings(pending.settings);
      await reload();
      notifyDataChanged();
      setMessage({
        tone: 'ok',
        text: `Restored ${pending.meetings.length} meetings and ${pending.groups.length} groups${replace ? ' (replaced existing data)' : ''}.`,
      });
      setPending(null);
    } catch (err) {
      log.error('Restore failed', err);
      setMessage({ tone: 'error', text: 'Restore failed; your existing data was not changed.' });
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Backup and restore</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Save everything (meetings, groups and settings) to a JSON file, or restore from one. Useful
        for moving to another computer.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={exportJson}>Download backup (.json)</Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700">
          Choose backup file…
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      </div>

      {pending && (
        <div className="mt-4 rounded-md border border-brand-500/40 bg-brand-50 p-4 text-sm dark:bg-brand-700/20">
          <p>
            Backup from{' '}
            {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : 'an unknown date'}{' '}
            contains <strong>{pending.meetings.length}</strong> meetings and{' '}
            <strong>{pending.groups.length}</strong> groups.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void restore(false)}>
              Merge into current data
            </Button>
            <Button variant="danger" onClick={() => void restore(true)}>
              Replace everything
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Merge keeps your data and adds or updates records from the file (same IDs are
            overwritten).
          </p>
        </div>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}
