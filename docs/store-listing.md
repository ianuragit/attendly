# Chrome Web Store listing (draft)

## Name

Attendly – Attendance for Meet calls

## Short description (≤ 132 characters)

Automatically records who joined, left and rejoined your Google Meet calls. Export to Excel or CSV. Data stays on your device.

_(126 characters)_

## Category

Productivity → Education (alternative: Workflow & Planning)

## Language

English

## Detailed description

Attendly takes attendance in your Google Meet calls automatically, so you can focus on the
meeting instead of the roll call.

Join a call as usual. Attendly notices when you're in (not on the pre-join screen) and quietly
records when each participant joins, leaves and rejoins. When the call ends, the meeting is
saved with a full timeline for every person.

WHAT YOU GET
• Automatic tracking: no buttons to press, nothing to remember
• Join, leave and rejoin times, total time present and number of sessions for each person
• A live head-count on the toolbar icon, and a pause switch in the popup
• Meeting history you can search, sort and filter by date or group
• Per-person timelines, meeting notes, and renaming
• Manual present/absent marks, and adding people who dialled in by phone
• Groups for classes and teams, with an attendance matrix and attendance % per person
• Auto-file meetings into a group by meeting code
• Export a meeting, a group or everything to Excel (.xlsx) or CSV, or copy a plain list
• Backup and restore as JSON
• Minimum-time rule (e.g. 1 minute) so quick drop-ins don't count as attendance
• Light and dark themes, 12/24-hour time, keyboard and screen-reader friendly

PRIVATE BY DESIGN
• All data stays in your browser on your computer
• No accounts, no servers, no analytics, no ads
• No network requests at all, enforced by a strict content security policy
• Only two permissions: storage, and access to meet.google.com
• Participant photos are never downloaded

GOOD TO KNOW
• Attendly reads names as Google Meet displays them; email addresses aren't available.
• In very large calls Attendly may open Meet's People panel once so it can see everyone
(you can turn this off in Settings).
• Please follow your organisation's policies and local law about recording attendance.

Attendly is open source (MIT). It is an independent project, not affiliated with or endorsed
by Google. Google Meet is a trademark of Google LLC.

## Single purpose

Record attendance (participant names and join/leave times) for Google Meet calls the user joins,
and let the user review and export those records.

## Permission justifications

**storage**
Saves the user's settings (chrome.storage.sync) and the live status of a call in progress
(chrome.storage.session) so the toolbar popup and badge can show it. Meeting records are kept
in the extension's local IndexedDB.

**Host permission: https://meet.google.com/\***
Attendly's content script runs only on Google Meet. It reads the meeting code, the meeting title
and participant display names from the page in order to record attendance. It does not run on
any other site.

**Remote code**
No. All code is bundled in the package. No scripts, modules or WebAssembly are loaded from
the network, and no `eval` is used.

## Data usage disclosures (Privacy practices tab)

Data collected:

- **Personally identifiable information**: participant display names (as shown in the meeting).
- **Website content**: meeting code, meeting title, and participant presence times read from
  Google Meet pages.

Not collected: health, financial, authentication, personal communications (chat, audio, video),
location, web history, user activity outside Google Meet.

Certifications (all true):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Additional statement: all data is stored locally on the user's device and is never transmitted
by the extension.

## Privacy policy URL

https://github.com/ianuragit/attendly/blob/main/PRIVACY.md

## Assets checklist

- [x] Icon 128×128: `public/icons/icon-128.png` (placeholder; consider a designed icon)
- [ ] Screenshots 1280×800: crop/resize from `docs/screenshots/` (history, meeting detail,
      group matrix, popup over a call, settings)
- [ ] Small promo tile 440×280 (optional)
- [ ] Marquee 1400×560 (optional)

## Reviewer notes (optional field)

To test: install, join any Google Meet call with at least one other participant, and open the
toolbar popup. The dashboard (Options page) lists the recorded meeting. No login or test account
is needed; Attendly has no backend.
