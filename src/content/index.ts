import { log } from '../lib/log';
import { MeetController } from './controller';

declare global {
  interface Window {
    __attendlyLoaded?: boolean;
  }
}

// Guard against double injection (e.g. extension reload while the tab stays open).
if (!window.__attendlyLoaded) {
  window.__attendlyLoaded = true;
  new MeetController()
    .start()
    .catch((err: unknown) => log.error('Content script failed to start', err));
}
