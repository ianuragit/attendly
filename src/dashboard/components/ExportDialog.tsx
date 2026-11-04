import { useEffect, useRef, useState } from 'react';
import { log } from '../../lib/log';
import { Button } from '../../ui/components';

export interface ExportOption {
  label: string;
  description: string;
  run: () => void | Promise<void>;
}

/**
 * Modal built on the native <dialog> element, which provides focus containment, Escape to
 * close and returns focus to the trigger.
 */
export function ExportDialog({
  title,
  options,
  onClose,
}: {
  title: string;
  options: ExportOption[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="export-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close(); // backdrop click
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="p-5">
        <h2 id="export-title" className="text-lg font-semibold">
          {title}
        </h2>
        <ul className="mt-4 space-y-2">
          {options.map((o) => (
            <li key={o.label}>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  Promise.resolve()
                    .then(o.run)
                    .then(() => ref.current?.close())
                    .catch((err: unknown) => {
                      log.error('Export failed', err);
                      setError(`${o.label} failed. Please try again.`);
                    });
                }}
                className="w-full rounded-md border border-slate-200 px-4 py-3 text-left hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">
                  {o.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={() => ref.current?.close()}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}
