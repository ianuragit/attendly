# Changelog

All notable changes to Attendly are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-04

First public release.

### Added

- Automatic attendance tracking in Google Meet calls: detects the in-call state (not the
  pre-join screen), reads participant tiles and the People panel, and records join, leave and
  rejoin times per participant with a 10-second debounce for flickering tiles.
- Large-call support: opens the People panel once when the grid can't show everyone
  (configurable), and never marks off-screen people as having left.
- Crash-safe storage: incremental saves every scan, finalisation on tab close, recovery of
  abandoned meetings after a crash, and continuation of a meeting rejoined within 5 minutes.
- Popup with meeting code, elapsed time, live count and pause switch; per-tab badge count.
- Dashboard: searchable/sortable/filterable meeting history; meeting detail with rename, notes,
  group assignment, manual present/absent marks, manually added attendees and per-person
  timelines.
- Groups with auto-assignment by meeting code and an attendance matrix with attendance %.
- Export to CSV (formula-injection safe) and Excel (.xlsx) for a meeting, a group matrix or all
  data; copy attendee list to the clipboard.
- JSON backup and validated restore (merge or replace).
- Settings: auto-track, poll interval, People-panel mode, minimum time to count as present,
  hide self, 12/24-hour time, system/light/dark theme, delete all data.
- Accessibility: keyboard navigation, labelled controls, live status announcements, axe-core
  WCAG 2.1 AA checks in CI for every page in both themes.
- Privacy: no network requests, no analytics, no remote code, strict CSP on extension pages,
  minimal permissions (`storage` and `https://meet.google.com/*`), enforced by a CI check.
- Hardening from a pre-release code audit (XLSX well-formedness, same-name identity, self
  detection, sleep/restart recovery, two-tab calls); see `docs/decisions.md`.
- Automated GitHub Release workflow publishing a ready-to-install `attendly.zip`.
- Documentation: README, privacy policy, Meet DOM notes, design decisions, store listing draft.

[1.0.0]: https://github.com/ianuragit/attendly/releases/tag/v1.0.0
