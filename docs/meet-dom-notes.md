# Google Meet DOM notes

Attendly reads Meet's page structure to find participants. Meet's markup is minified and
changes without notice, so this file records **what Attendly relies on, why, and how sure we
are**. Every selector lives in [`src/content/selectors.ts`](../src/content/selectors.ts).

> **Verification status (v1.0.0 development):** the selectors below were written from
> knowledge of Meet's DOM as of 2025–2026 and exercised against a Meet-like fixture
> (`tests/fixtures/meet-dom.ts`) in jsdom unit tests and a Playwright end-to-end test that
> loads the real extension in Chromium. **They have not yet been checked against a live Meet
> call** — the build environment had no Google account or access to meet.google.com.
> Before publishing, run the checklist at the bottom on a real call and update this file.

## Hooks, in order of preference

| What                    | Primary hook                                                      | Fallbacks                                                           | Confidence |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | ---------- |
| In the call (not lobby) | A `<button>` containing a Material icon whose text is `call_end`  | `aria-label` containing "Leave call"/"Hang up"; `[jsname=CQylAd]`   | High       |
| Meeting code            | URL path `/abc-defg-hij` (also `/lookup/<name>`)                  | —                                                                   | High       |
| Meeting title           | `[data-meeting-title]` attribute                                  | `document.title` of the form "Meet – Title"                         | Medium     |
| Participant tile        | `[data-participant-id]`                                           | `[data-requested-participant-id]`                                   | High       |
| Name inside a tile      | `[data-self-name]` (own tile), `.notranslate`                     | `[jsname=EydYod]`, `.zWGUib`, tile `aria-label`                     | Medium     |
| Self                    | `[data-self-name]` inside the tile; "(You)" in the People panel   | Name suffix "(You)"                                                 | Medium     |
| People panel list       | `[role=list]` with `aria-label` containing "participant"/"people" | Any `[role=list]` containing `[role=listitem][data-participant-id]` | Medium     |
| People panel row name   | Row `aria-label`                                                  | `.notranslate`, `.zWGUib`                                           | Medium     |
| People button           | `button[data-panel-id="1"]`                                       | Icon text `people`/`group`/`groups`; English `aria-label`           | Low–Medium |
| Participant count       | Digits in the People button (icon text removed)                   | Digits in its `aria-label`                                          | Low        |
| Avatar                  | `<img src="https://lh3.googleusercontent.com/…">` in tile/row     | Any `https://` image                                                | Medium     |
| Overflow tile           | Tile whose label is "N others"                                    | —                                                                   | Medium     |

Language independence: the icon-ligature (`call_end`, `people`) and `data-*` hooks work in any
UI language. The English `aria-label` and suffix ("(You)", "Presenting") fallbacks only work
in English; for other languages self detection relies on `[data-self-name]`.

## Tiles vs the People panel

Meet renders tiles only for people who fit in the grid (and hides some with "N others"),
so tiles alone under-count large calls. The People panel lists everyone. Attendly:

1. always reads tiles and, if open, the People panel, and merges the two;
2. if the grid is visibly incomplete (overflow tile, or the People-button count is higher
   than what we can see) and the panel is closed, opens the People panel **once** per call
   (Settings → "People panel: auto"). If you close it again, Attendly respects that;
3. while the view is known to be incomplete, records joins but never marks anyone as having
   left (the tracker's `complete: false` mode), so off-screen people aren't logged as leaving.

Trade-off: auto-opening the panel replaces whatever side panel (e.g. chat) you had open.
Set "People panel: never" to keep the view untouched at the cost of incomplete data in
large calls.

## Failure signals

- `[Attendly] In a call but no participants were detected…` — three consecutive scans in a
  call found nobody (you are always in your own call, so this means the tile/name hooks broke).
  Empty scans are ignored by the tracker so a breakage doesn't log everyone as leaving.
- `[Attendly] Could not find the People button…` — large calls may be incomplete.

## Live-call verification checklist

Run on a real call with 3+ participants (use a second browser profile / phone as guests):

- [ ] Lobby page: no meeting recorded; joining creates one with the right code.
- [ ] Title appears for a Calendar-scheduled meeting.
- [ ] Own entry is flagged as self (check `isSelf` in the dashboard JSON backup).
- [ ] A guest leaving is recorded ~10s later; rejoining creates a second session.
- [ ] Turning a camera on/off, pinning, and switching layouts do not create extra sessions.
- [ ] Screen share does not add a "presentation" participant.
- [ ] With > grid-size participants, the People panel opens once and everyone is listed.
- [ ] Leaving via the red button ends the meeting within ~15s; closing the tab ends it at once.
- [ ] Repeat with the Meet UI language set to something other than English.
