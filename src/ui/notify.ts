import { sendRuntimeMessage } from '../lib/messages';

/** Tells other extension pages (popup, other dashboard tabs) that stored data changed. */
export function notifyDataChanged(): void {
  void sendRuntimeMessage({ type: 'db:changed' });
}
