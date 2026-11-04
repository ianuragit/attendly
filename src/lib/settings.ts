/** Settings live in chrome.storage.sync so they follow the user across their Chrome profiles. */
import { DEFAULT_SETTINGS, type Settings } from './types';

const KEY = 'settings';

const clamp = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

/** Coerces arbitrary stored data into a valid Settings object (unknown keys are dropped). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    pollIntervalMs: clamp(r.pollIntervalMs, 1_000, 60_000, d.pollIntervalMs),
    excludeSelf: typeof r.excludeSelf === 'boolean' ? r.excludeSelf : d.excludeSelf,
    minPresentMs: clamp(r.minPresentMs, 0, 4 * 3_600_000, d.minPresentMs),
    autoTrack: typeof r.autoTrack === 'boolean' ? r.autoTrack : d.autoTrack,
    timeFormat: oneOf(r.timeFormat, ['12h', '24h'] as const, d.timeFormat),
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, d.theme),
    peoplePanelMode: oneOf(r.peoplePanelMode, ['auto', 'never'] as const, d.peoplePanelMode),
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return sanitizeSettings(stored[KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch });
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

/** Subscribes to settings changes from any context. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && KEY in changes) cb(sanitizeSettings(changes[KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
