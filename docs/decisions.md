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

## Phase 6 — Groups and matrix

- **Cross-meeting identity in the matrix** is the normalised name. Avatar hashes are not used
  across meetings because whether an avatar was visible varies between calls. When a name
  occurs twice _within one meeting_, those records keep their full key and stay separate rows.
- **Cells:** ✓ present (meets the minimum or marked present), ~ joined but under the minimum,
  ✗ absent. Attendance % = present meetings / meetings in the group.
- **Auto-assign rule:** a group holds a list of meeting codes; the worker assigns new calls with
  those codes when they start. Creating a group applies the rule to _ungrouped_ past meetings;
  "Apply code rule to past meetings" on the group page also moves meetings from other groups.
- **Manual attendees:** the meeting page can add someone who wasn't detected (e.g. dialled in
  by phone). They are stored as a participant with no sessions plus a "present" mark, and live
  saves preserve them.
- **Deleting a group** keeps its meetings (they become ungrouped).

## Phase 7 — Export and backup

- **XLSX: own minimal writer instead of SheetJS.** The brief suggested SheetJS. The npm `xlsx`
  package is frozen at 0.18.5 with published advisories (CVE-2023-30533, CVE-2024-22363), and
  SheetJS's patched builds are distributed only from `cdn.sheetjs.com`, which this build
  environment's network policy blocks. Attendly only _writes_ simple tables, so
  `src/lib/xlsx.ts` emits the SpreadsheetML parts directly and zips them with `fflate`
  (~9 KB, no dependencies). Output was verified to open in openpyxl and LibreOffice. Strings
  are written as inline strings, never formulas. To switch to SheetJS later, replace
  `writeXlsx()`; the export tables in `lib/export.ts` are library-agnostic.
- **CSV:** RFC 4180, CRLF, UTF-8 with BOM (so Excel shows accents correctly). Cells starting
  with `= + - @ TAB CR` are prefixed with `'` to prevent formula injection — participant names
  come from other people and are untrusted.
- **Times in exports** are local "YYYY-MM-DD HH:MM:SS" strings (locale-independent and sortable);
  durations are minutes with one decimal.
- **Exports honour the current settings** (exclude self, minimum duration, manual marks).
- **Backup format:** `{ app: "attendly", version: 1, exportedAt, settings, groups, meetings }`.
  Restore validates every field, drops unknown keys, clamps sizes, closes any meetings that were
  live at backup time, and drops group references that aren't in the file. "Merge" upserts by id;
  "Replace" clears data first (and restores settings) after a confirmation.

## Phase 8 — Settings, theme, accessibility

- **Settings save immediately** (no Save button) and announce "Settings saved" via a live region.
  Number fields commit on blur/Enter so partially typed values aren't clamped mid-typing.
- **Delete all data** requires typing `DELETE`; settings are kept.
- **Theme** is class-based (`.dark` on `<html>`), resolved from the setting or the OS preference,
  and applied in both popup and dashboard.
- **Accessibility is tested automatically:** `tests/e2e/a11y.spec.ts` runs axe-core (WCAG 2.1
  A/AA) on every page in light and dark mode. Manual checks: everything is reachable by
  keyboard (native buttons/links/inputs, `<dialog>` for modals), visible focus rings, skip link,
  `aria-sort` on sortable headers, `aria-expanded` on disclosure buttons, `role="switch"` toggles,
  text alternatives for the timeline bars and matrix cells, and a polite live region for status
  messages.

## Code audit (pre-1.0.0)

An independent review of the whole codebase found the issues below; all are fixed with
regression tests (unit tests unless noted).

| #   | Severity | Issue                                                                                                             | Fix                                                                                                                       |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | `xl/styles.xml` was malformed (missing `>`), so Excel would offer to "repair" every export                        | Fixed; a test now XML-parses every part of every workbook                                                                 |
| 2   | High     | An avatar-less tile listed first could take a same-name person's record → duplicate + false leave                 | Entries with an avatar are resolved first                                                                                 |
| 3   | Medium   | "(You)"/"(me)" typed into a display name, or the surname "You", marked a guest as self (hidden by "exclude self") | Self comes only from `data-self-name` or a separate "(You)" element; ambiguous multi-self snapshots are ignored           |
| 4   | Medium   | A save after the computer slept reopened a closed meeting and credited the gap as attendance                      | Worker refuses saves to ended meetings and the tab resumes by id; scan gaps > 150 s close sessions at the last scan (e2e) |
| 5   | Medium   | Deleting/replacing data during a live call silently stopped recording for the rest of it                          | Worker replies `restart`; the tab starts a new record (e2e). Delete confirmation warns for live meetings                  |
| 6   | Medium   | Matrix split a regular attendee's row whenever a namesake joined once                                             | The longest-present same-name record keeps the shared row                                                                 |
| 7   | Low–Med  | Same call in two tabs created two meetings; concurrent starts could race                                          | Starts are serialised; a second tab stays passive (e2e)                                                                   |
| 8   | Low      | Avatar selector returned the first https image in DOM order, not the profile picture                              | Selectors are tried in priority order                                                                                     |
| 9   | Low      | Imported keys like `constructor` resolved to `Object.prototype` members                                           | Own-property mark lookup; participant keys must match the key format and be unique                                        |
| 10  | Low      | After an extension update mid-call the orphaned content script kept running                                       | It detects the invalidated context, stops and logs a reload hint                                                          |
| 11  | Low      | A malformed URL hash crashed the dashboard                                                                        | Hash segments are decoded defensively                                                                                     |

Known limitation kept: after a worker-requested restart, up to one heartbeat (15 s) of the call
between the deletion/closure and the restart is not counted.

- **Node 22 for development/CI:** `jsdom` 30 (used by DOM unit tests) requires Node ≥ 22.22, and
  GitHub Actions has deprecated Node 20. The extension itself runs in Chrome and is unaffected.
