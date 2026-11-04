/** Browser-side file helpers for the dashboard (download, read, clipboard). */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(filename: string, text: string, type: string): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadBytes(filename: string, bytes: Uint8Array, type: string): void {
  // Copy into a fresh ArrayBuffer-backed view (Blob requires ArrayBuffer, not SharedArrayBuffer).
  downloadBlob(filename, new Blob([new Uint8Array(bytes)], { type }));
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function todayStamp(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
