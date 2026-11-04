/** Dashboard data context: all meetings and groups, reloaded whenever the worker reports changes. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { listGroups, listMeetings } from '../lib/db';
import { log } from '../lib/log';
import type { Group, MeetingRecord } from '../lib/types';
import { useDbChanges } from '../ui/hooks';

interface Data {
  meetings: MeetingRecord[];
  groups: Group[];
  loaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const DataContext = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Data, 'reload'>>({
    meetings: [],
    groups: [],
    loaded: false,
    error: null,
  });

  const reload = useCallback(async () => {
    try {
      const [meetings, groups] = await Promise.all([listMeetings(), listGroups()]);
      setState({ meetings, groups, loaded: true, error: null });
    } catch (err) {
      log.error('Failed to load data', err);
      setState((s) => ({ ...s, loaded: true, error: 'Could not read stored meetings.' }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);
  useDbChanges(reload);

  return <DataContext.Provider value={{ ...state, reload }}>{children}</DataContext.Provider>;
}

export function useData(): Data {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
