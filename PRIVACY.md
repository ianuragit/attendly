# Attendly Privacy Policy

_Last updated: 4 November 2026 · applies to Attendly version 1.0.0 and later_

Attendly is a browser extension that records attendance in Google Meet calls you join. This
policy explains what it handles and where that data goes. In short: **everything stays on your
device.**

## What Attendly collects

When you are in a Google Meet call (on `https://meet.google.com`), Attendly reads from the page:

- the **meeting code** from the address bar (e.g. `abc-defg-hij`) and the meeting **title** if
  Meet shows one;
- the **display names** of participants, as shown on screen;
- the **address of each participant's profile picture**, if shown. This is used only to tell
  apart two people with the same name. The picture itself is never downloaded or displayed;
- the **times** each participant appeared in and disappeared from the call.

You may also add your own **meeting titles, notes, group names and manual attendance marks**.

Attendly does **not** read or record audio, video, screen shares, chat messages, email
addresses, or anything on websites other than Google Meet.

## Where it is stored

- Meeting records, groups and notes are stored in the extension's **IndexedDB database on your
  computer**.
- Your settings are stored with `chrome.storage.sync`. If you have Chrome Sync turned on, Google
  syncs these **settings only** (e.g. theme, minimum attendance time) between your Chrome
  profiles, as it does for any extension's settings. Meeting data is never put in sync storage.
- The status of an ongoing call is kept in `chrome.storage.session`, which is cleared when the
  browser closes.

## Who it is shared with

**No one.** Attendly has no servers and makes **no network requests**. It contains no analytics,
advertising, tracking or crash-reporting code, and loads no remote code. Its pages use a
content security policy that blocks network connections.

Data leaves your device only when **you** choose to export it (CSV, Excel, plain text or a JSON
backup). What happens to an exported file is up to you.

## Your control over the data

- **View and edit** everything in the Attendly dashboard.
- **Pause** tracking for a call from the popup, or turn off automatic tracking in Settings.
- **Delete** a single meeting, a group, or all data (_Settings → Delete all data_).
- **Export** a full copy as JSON (_Settings → Backup and restore_).
- **Uninstall** the extension to remove all of its stored data from Chrome.

## Other people's information

Attendance records contain the names of other meeting participants. You are responsible for
using Attendly in line with your organisation's policies and the laws that apply to you, which
may include telling participants that attendance is being recorded.

## Children

Attendly is a tool for meeting organisers and teachers. It does not knowingly collect data from
children beyond the display names visible in a meeting the user attends, and it sends no data
anywhere.

## Changes

If this policy changes, the new version will be published in the project repository with a new
"Last updated" date, and significant changes will be noted in the changelog.

## Contact

Questions or concerns: open an issue at <https://github.com/ianuragit/attendly/issues>.

_Attendly is not affiliated with Google. Google Meet is a trademark of Google LLC._
