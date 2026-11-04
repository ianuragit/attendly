import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

/**
 * Manifest V3 definition. Permissions are deliberately minimal:
 * - "storage": persist settings (chrome.storage.sync) and live session state.
 * - host permission for https://meet.google.com/* only, so the content script
 *   can read participant names from the Meet page.
 * See README "Permissions explained" for the full justification.
 */
export default defineManifest(({ mode }) => ({
  manifest_version: 3,
  name: 'Attendly – Attendance for Meet calls',
  short_name: 'Attendly',
  description:
    'Automatically records who joined, left and rejoined your Google Meet calls. Data stays on your device.',
  version: pkg.version,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Attendly',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    },
  },
  options_page: 'src/dashboard/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://meet.google.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage'],
  host_permissions: ['https://meet.google.com/*'],
  // Production pages may not load anything remote: no scripts, images or connections.
  // (Dev mode is left alone so Vite's HMR websocket keeps working.)
  ...(mode === 'production'
    ? {
        content_security_policy: {
          extension_pages:
            "default-src 'self'; script-src 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      }
    : {}),
}));
