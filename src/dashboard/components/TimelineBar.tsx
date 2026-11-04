import { formatTime } from '../../lib/time';
import type { Session, TimeFormat } from '../../lib/types';

/**
 * Horizontal bar showing when someone was present between `start` and `end`.
 * Exposed to assistive tech as an image with a text description of every session.
 */
export function TimelineBar({
  sessions,
  start,
  end,
  now,
  timeFormat,
  label,
}: {
  sessions: readonly Session[];
  start: number;
  end: number;
  now: number;
  timeFormat: TimeFormat;
  label: string;
}) {
  const span = Math.max(1, end - start);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
  const description = sessions.length
    ? sessions
        .map(
          (s) =>
            `${formatTime(s.joinedAt, timeFormat)} to ${s.leftAt === null ? 'now' : formatTime(s.leftAt, timeFormat)}`,
        )
        .join(', ')
    : 'no sessions';

  return (
    <div
      role="img"
      aria-label={`${label}: present ${description}`}
      className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
    >
      {sessions.map((s, i) => {
        const left = pct(s.joinedAt);
        const width = Math.max(0.6, pct(s.leftAt ?? now) - left);
        return (
          <span
            key={i}
            className={`absolute inset-y-0 rounded-full ${s.leftAt === null ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}
