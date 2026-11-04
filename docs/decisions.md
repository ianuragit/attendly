# Design decisions

A running log of judgement calls made where the brief was ambiguous.

## Phase 1 — Scaffold

- **Build tooling:** Vite 8 + `@crxjs/vite-plugin` 3 (MV3-aware: bundles the service worker and
  content script, rewrites manifest paths, supports HMR for extension pages in `npm run dev`).
- **TypeScript pinned to ~6.0:** TypeScript 7 (native) is out, but `typescript-eslint` currently
  supports `<6.1`. Revisit when typescript-eslint adds TS 7 support.
- **Tailwind v4** via `@tailwindcss/vite` (no PostCSS/config file). Dark mode uses a `.dark` class
  variant so the in-app theme setting can override the OS preference.
- **Zip packaging:** `scripts/zip.mjs` uses `fflate` (tiny, no transitive deps) rather than
  `archiver`, whose dependency tree currently carries audit warnings.
- **SheetJS deferred to Phase 7:** the `xlsx` package on npm is frozen at 0.18.5, which has
  published advisories (they concern _parsing_ untrusted files). SheetJS ships fixed releases from
  its own CDN, which is not reachable from this build environment. Decision is made in Phase 7;
  Attendly only _writes_ XLSX, so the parsing advisories don't apply either way.
- **Icons:** generated procedurally by `scripts/generate-icons.mjs` (blue rounded square + check
  mark) so they are original and reproducible.
- **Branch:** the automation running this build is restricted to pushing to its designated feature
  branch, so phases are pushed there rather than directly to `main`; merge via PR.
- **CI** runs on every push and PR: `npm ci`, lint, prettier check, typecheck, test, build, zip,
  and uploads the zip as a workflow artifact.
- **Content-script loader:** CRXJS emits the content script as a small loader that `import()`s
  the bundled module, which requires listing those chunks in `web_accessible_resources` for
  `meet.google.com` only. This is standard for ES-module content scripts; the exposed files
  contain only Attendly's own code.

## Phase 2 — Tracker

- **Identity:** key = normalised name (lowercase, accents stripped) + FNV-1a hash of the avatar
  URL with size parameters removed (`#0` when there is no avatar). Same-name people with no
  avatar get `~2`, `~3` suffixes. An entry without an avatar is matched to an existing
  same-name record so a person doesn't split when their photo is visible in one place only.
- **Leave timestamp:** a leave is recorded at the first scan where the person was missing, not
  when the 10 s debounce expires.
- **Self is always tracked** (flagged `isSelf`); "exclude self" is a _view_ filter applied to
  lists, matrices, counts and exports. Toggling it is therefore retroactive and lossless.
- **Pause** closes everyone's open session; paused time is not counted. Resuming opens new
  sessions for whoever is present.

## Phase 3 — Content script, worker, storage

- **No live-call verification:** the build environment cannot join a real Meet call. Selectors
  are tested against a fixture and in a Playwright e2e test with the real extension. See
  `docs/meet-dom-notes.md` for the checklist to run before publishing.
- **The content script owns the tracker; the service worker owns storage.** Content scripts
  run on Meet's origin and can't reach the extension's IndexedDB, so they send full tracker
  state each scan (small: a few KB). The worker merges only tracker-owned fields so dashboard
  edits (title, notes, group, manual marks) made during a live call are never overwritten.
- **Data-loss bound:** saves every scan (default 5 s; heartbeat at least every 15 s). Tab close →
  worker finalises from the last save. Browser crash → meetings with no save for 3 min are
  closed at their last save on next worker start.
- **Rejoin window:** rejoining the same meeting code within 5 minutes continues the same record
  (new sessions are appended) instead of creating a second meeting.
- **Call end:** the leave button missing for 15 s, a different meeting code in the URL,
  `pagehide`, or the tab closing.
- **Empty scans are ignored** (you are always in your own call), so a selector breakage doesn't
  log everyone as having left.
- **No "activeTab", "tabs" or "alarms" permissions:** tab-close detection uses
  `chrome.tabs.onRemoved` (no permission needed for the tab id) and stale sweeps run on worker
  start-up.
- **Badge** is set per tab, so it only shows on the Meet tab that is being tracked.

## Phase 4–5 — Popup and dashboard

- **No remote images:** stored avatar URLs are used only for identity hashing and are never
  rendered; the UI shows initials. Rendering them would fetch from Google's image CDN and
  break the "no network calls" promise. Production builds add a strict CSP to extension pages
  (`default-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`) to enforce this.
- **Hash routing** (`#/meetings/<id>`, `#/groups/<id>`, `#/settings`) instead of a router
  library; the popup deep-links into it.
- **Live refresh:** the worker broadcasts `db:changed` after each save; open dashboard/popup
  pages reload. Dashboard edits broadcast the same message so other open pages stay in sync.
- **Popup `?tabId=` parameter** exists only so automated tests can open the popup as a tab.
- **History search** matches title, code, notes and attendee names. Date filters are inclusive
  local-calendar days.
- **Manual marks** are stored per meeting per participant key and override the
  minimum-duration rule everywhere (detail page, counts, matrix, exports).
