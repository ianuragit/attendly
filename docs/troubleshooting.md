# Troubleshooting

## The popup says "Not in a meeting" during a call

Work through these in order.

1. **Reload the Meet tab.** Chrome only starts an extension in tabs opened _after_ it was
   installed, updated or reloaded. A tab that was already open has no Attendly in it. Reload it
   (or rejoin the call); it's the most common cause.
2. **Read what the popup says.** Since 1.0.1 the popup explains what it sees:
   - _"Meeting abc-defg-hij is open. Recording starts as soon as you join…"_: Attendly found
     the meeting but doesn't think you've joined yet. If you _have_ joined, Meet's controls
     probably changed; run the diagnostic below.
   - _"…is already being recorded in another tab"_: the same call is open twice; only one tab
     records.
   - _"Automatic tracking is turned off"_: switch it on in Settings.
   - The generic message: Attendly isn't running in this tab. Reload the tab (step 1).
3. **Check the console.** On the Meet tab press <kbd>F12</kbd> (<kbd>⌥⌘I</kbd> on Mac), open
   **Console** and type `Attendly` in the filter box. You'll see lines such as
   `[Attendly] On meeting page abc-defg-hij; waiting until you join…` or
   `[Attendly] Tracking meeting abc-defg-hij`.
4. **Check Attendly is enabled** in `chrome://extensions` and has access to
   `meet.google.com` (Details → _Site access_ should not be "On click").

## Diagnostic for reporting a detection problem

If Attendly still doesn't detect a call you've joined, this snippet collects the few page
details Attendly relies on. It **only reads** the page and prints a short summary. It doesn't
change anything or send anything anywhere. It does include the participant names visible on
screen, so remove or replace them before sharing if you prefer.

1. Join the call and open the console (step 3 above).
2. If Chrome asks you to type `allow pasting`, do so.
3. Paste this and press <kbd>Enter</kbd>:

```js
(() => {
  const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const sample = (list, n = 15) => Array.from(list).slice(0, n);
  const glyphs = sample(document.querySelectorAll('i, span, div'), 100000)
    .filter(
      (el) =>
        el.children.length === 0 &&
        /^[a-z_]{3,30}$/.test(t(el)) &&
        /icon|symbol/i.test(el.className),
    )
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}="${t(el)}" in <${el.closest('button,[role=button]')?.tagName.toLowerCase() ?? 'none'}>`,
    );
  const report = {
    path: location.pathname,
    title: document.title,
    controls: sample(
      document.querySelectorAll('button[aria-label], [role=button][aria-label]'),
      40,
    ).map((b) => b.getAttribute('aria-label')),
    iconGlyphs: [...new Set(glyphs)].slice(0, 40),
    participantIdCount: document.querySelectorAll('[data-participant-id]').length,
    requestedParticipantIdCount: document.querySelectorAll('[data-requested-participant-id]')
      .length,
    selfName: sample(document.querySelectorAll('[data-self-name]'), 3).map(
      (e) => `${e.getAttribute('data-self-name')} / ${t(e)}`,
    ),
    tileTexts: sample(document.querySelectorAll('[data-participant-id]'), 8).map((e) =>
      t(e).slice(0, 60),
    ),
    lists: sample(document.querySelectorAll('[role=list]'), 8).map(
      (l) =>
        `${l.getAttribute('aria-label')} (${l.querySelectorAll('[role=listitem]').length} items)`,
    ),
    meetingTitleAttr:
      document.querySelector('[data-meeting-title]')?.getAttribute('data-meeting-title') ?? null,
  };
  console.log(JSON.stringify(report, null, 2));
  return 'Copy the JSON above into a GitHub issue.';
})();
```

4. Copy the printed JSON into a
   [GitHub issue](https://github.com/ianuragit/attendly/issues/new) together with the popup
   message and any `[Attendly]` console lines.

Maintainers: the fields map to the hooks in `src/content/selectors.ts`. `iconGlyphs` and
`controls` show what the leave-call and People buttons look like now. `participantIdCount` and
`selfName` cover tiles. `lists` covers the People panel. Update the selectors and record the
change in `docs/meet-dom-notes.md`.
