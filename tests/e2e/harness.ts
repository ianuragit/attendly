/**
 * Playwright harness: launches Chromium with the built extension and serves a fake Meet page
 * at https://meet.google.com/<code> via request interception (no network, no Google account).
 */
import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { meetHtml, type FakePerson } from '../fixtures/meet-dom';

export const DIST = resolve(import.meta.dirname, '../../dist');

export interface Harness {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  close: () => Promise<void>;
}

export async function launch(): Promise<Harness> {
  if (!existsSync(resolve(DIST, 'manifest.json')))
    throw new Error('Run `npm run build` before e2e tests');
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    ...(process.env.ATTENDLY_CHROMIUM ? { executablePath: process.env.ATTENDLY_CHROMIUM } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;
  await context.route('https://meet.google.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Meet</title></head><body></body></html>',
    }),
  );
  return { context, sw, extensionId, close: () => context.close() };
}

export async function setMeet(page: Page, opts: Parameters<typeof meetHtml>[0]): Promise<void> {
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, meetHtml(opts));
}

export type { FakePerson };

/** Reads all meetings from the extension's IndexedDB via the service worker. */
export function readMeetings(sw: Worker): Promise<
  Array<
    Record<string, unknown> & {
      participants: Array<{
        name: string;
        sessions: Array<{ joinedAt: number; leftAt: number | null }>;
      }>;
    }
  >
> {
  return sw.evaluate(
    () =>
      new Promise((resolveP, reject) => {
        const req = indexedDB.open('attendly');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('meetings')) {
            db.close();
            resolveP([]);
            return;
          }
          const get = db.transaction('meetings').objectStore('meetings').getAll();
          get.onsuccess = () => {
            db.close();
            resolveP(get.result);
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}
