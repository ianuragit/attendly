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
