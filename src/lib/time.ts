/** Duration and date/time formatting helpers. */
import type { TimeFormat } from './types';

/** Formats a duration in milliseconds as H:MM:SS (or M:SS under an hour). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human-friendly duration: "1h 05m", "12m", "45s". */
export function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${totalSeconds}s`;
}

/** Whole minutes, rounded to one decimal place (used in exports). */
export function toMinutes(ms: number): number {
  return Math.round((Math.max(0, ms) / 60_000) * 10) / 10;
}

export function formatTime(ts: number, format: TimeFormat, locale?: string): string {
  return new Date(ts).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: format === '12h',
  });
}

export function formatDate(ts: number, locale?: string): string {
  return new Date(ts).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(ts: number, format: TimeFormat, locale?: string): string {
  return `${formatDate(ts, locale)} ${formatTime(ts, format, locale)}`;
}

/** Local ISO-like "YYYY-MM-DD HH:MM:SS", stable across locales (used in exports). */
export function formatIsoLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** "YYYY-MM-DD" for <input type="date"> values in local time. */
export function toDateInputValue(ts: number): string {
  return formatIsoLocal(ts).slice(0, 10);
}

/** Parses a "YYYY-MM-DD" date input as local midnight; returns null when empty/invalid. */
export function parseDateInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export const DAY_MS = 86_400_000;
