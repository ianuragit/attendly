import { useState, type ReactNode } from 'react';
import * as db from '../../lib/db';
import { saveSettings } from '../../lib/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../lib/types';
import { Button, Card, LiveRegion, PageHeader, Select, TextInput } from '../../ui/components';
import { notifyDataChanged } from '../../ui/notify';
import { BackupPanel } from '../components/BackupPanel';
import { useData } from '../data';

function Row({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[1fr_16rem] sm:items-center">
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        {hint && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Switch({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        checked ? 'bg-brand-600' : 'bg-slate-400 dark:bg-slate-600'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-600">
      <legend className="sr-only">{legend}</legend>
      {options.map(([v, label]) => (
        <label
          key={v}
          className={`cursor-pointer rounded px-3 py-1.5 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
            value === v
              ? 'bg-brand-600 text-white'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/** Number input that commits on blur/Enter so typing "1" on the way to "15" isn't clamped. */
function NumberSetting({
  id,
  value,
  min,
  max,
  unit,
  onCommit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <TextInput
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-28"
      />
      <span className="text-sm text-slate-600 dark:text-slate-400">{unit}</span>
    </div>
  );
}

export function SettingsPage({ settings }: { settings: Settings }) {
  const { meetings, reload } = useData();
  const [status, setStatus] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const set = async (patch: Partial<Settings>) => {
    await saveSettings(patch);
    setStatus('Settings saved');
  };

  const deleteAll = async () => {
    await db.clearAllData();
    await reload();
    notifyDataChanged();
    setConfirmText('');
    setStatus('All meetings and groups were deleted');
  };

  return (
    <>
      <LiveRegion message={status} />
      <PageHeader
        title="Settings"
        subtitle="Settings sync across your Chrome profile. Meeting data never leaves this device."
      />

      <div className="space-y-6">
        <Card className="px-5">
          <h2 className="pt-5 text-base font-semibold">Tracking</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <Row
              label="Track meetings automatically"
              htmlFor="autoTrack"
              hint="When off, Attendly records nothing."
            >
              <Switch
                id="autoTrack"
                label="Track meetings automatically"
                checked={settings.autoTrack}
                onChange={(v) => void set({ autoTrack: v })}
              />
            </Row>
            <Row
              label="Check for changes every"
              htmlFor="poll"
              hint="Attendly also reacts to page changes instantly; this is a safety net. 1–60 seconds."
            >
              <NumberSetting
                id="poll"
                value={settings.pollIntervalMs / 1000}
                min={1}
                max={60}
                unit="seconds"
                onCommit={(v) => void set({ pollIntervalMs: Math.round(v * 1000) })}
              />
            </Row>
            <Row
              label="Open the People panel in large calls"
              htmlFor="panel"
              hint="When some people have no video tile, Attendly can open Meet’s People panel once per call to see everyone. It replaces any side panel you had open."
            >
              <Select
                id="panel"
                value={settings.peoplePanelMode}
                onChange={(e) =>
                  void set({ peoplePanelMode: e.target.value === 'never' ? 'never' : 'auto' })
                }
              >
                <option value="auto">Automatically (recommended)</option>
                <option value="never">Never</option>
              </Select>
            </Row>
          </div>
        </Card>

        <Card className="px-5">
          <h2 className="pt-5 text-base font-semibold">Attendance rules</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <Row
              label="Minimum time to count as present"
              htmlFor="minPresent"
              hint="Total time across all of someone’s sessions. Manual marks override this."
            >
              <NumberSetting
                id="minPresent"
                value={settings.minPresentMs / 60_000}
                min={0}
                max={240}
                unit="minutes"
                onCommit={(v) => void set({ minPresentMs: Math.round(v * 60_000) })}
              />
            </Row>
            <Row
              label="Hide myself from lists and exports"
              htmlFor="excludeSelf"
              hint="You are still recorded, so turning this off brings you back."
            >
              <Switch
                id="excludeSelf"
                label="Hide myself from lists and exports"
                checked={settings.excludeSelf}
                onChange={(v) => void set({ excludeSelf: v })}
              />
            </Row>
          </div>
        </Card>

        <Card className="px-5">
          <h2 className="pt-5 text-base font-semibold">Appearance</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <Row label="Theme">
              <Segmented
                name="theme"
                legend="Theme"
                value={settings.theme}
                options={[
                  ['system', 'System'],
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                ]}
                onChange={(v) => void set({ theme: v })}
              />
            </Row>
            <Row label="Time format">
              <Segmented
                name="timeFormat"
                legend="Time format"
                value={settings.timeFormat}
                options={[
                  ['24h', '24-hour'],
                  ['12h', '12-hour'],
                ]}
                onChange={(v) => void set({ timeFormat: v })}
              />
            </Row>
          </div>
        </Card>

        <BackupPanel settings={settings} />

        <Card className="border-red-200 p-5 dark:border-red-900">
          <h2 className="text-base font-semibold text-red-800 dark:text-red-300">
            Delete all data
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Permanently deletes all {meetings.length} meetings and every group from this device.
            Settings are kept. Download a backup first if you might need it.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="confirm-delete" className="mb-1 block text-sm">
                Type <strong>DELETE</strong> to confirm
              </label>
              <TextInput
                id="confirm-delete"
                value={confirmText}
                autoComplete="off"
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              variant="danger"
              disabled={confirmText !== 'DELETE'}
              onClick={() => void deleteAll()}
            >
              Delete all data
            </Button>
          </div>
        </Card>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          <Button size="sm" variant="ghost" onClick={() => void set(DEFAULT_SETTINGS)}>
            Reset settings to defaults
          </Button>
        </p>
      </div>
    </>
  );
}
