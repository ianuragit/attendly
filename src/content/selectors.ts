/**
 * Google Meet DOM adapter. EVERY selector Attendly uses on meet.google.com lives in this file.
 *
 * Meet's markup is minified and changes frequently, so:
 * - Prefer stable hooks: data-* attributes, ARIA roles/labels, Material icon ligature text
 *   (icon names like "call_end" are language-independent). Obfuscated class names and
 *   `jsname` values are used only as last-resort fallbacks.
 * - Every lookup has several strategies tried in order; the first that yields results wins.
 * - When all strategies fail we log one "[Attendly]" warning (see `warnOnce`) instead of
 *   silently recording nothing.
 *
 * See docs/meet-dom-notes.md for what each hook targets and how to update this file.
 */
import { cleanName } from '../lib/participants';
import { log } from '../lib/log';
import type { SnapshotEntry } from '../lib/types';

// ------------------------------------------------------------------------------- raw selectors

export const SELECTORS = {
  /**
   * Leave-call button: present only once you are actually in the call (not in the lobby /
   * green room). Strategies: Material icon ligature text, English aria-label, legacy jsname.
   */
  leaveCallIcon:
    'button i.google-material-icons, button i.google-symbols, button i.material-icons-extended',
  leaveCallIconText: ['call_end'],
  leaveCallAria: 'button[aria-label*="leave call" i], button[aria-label*="hang up" i]',
  leaveCallJsname: '[jsname="CQylAd"]',

  /** Video tile of one participant (also used for screen-share tiles). */
  participantTile: '[data-participant-id], [data-requested-participant-id]',
  /** Element inside your own tile that carries the self marker. */
  selfNameAttr: '[data-self-name]',
  /** Name text inside a tile; Meet marks user-generated text with `notranslate`. */
  tileName: '[data-self-name], .notranslate, [jsname="EydYod"], .zWGUib',

  /** People panel: list of everyone in the call (includes people without a visible tile). */
  peopleList: '[role="list"][aria-label*="participant" i], [role="list"][aria-label*="people" i]',
  peopleListItem: '[role="listitem"]',
  /** Fallback when the list's aria-label is localised: listitems that carry a participant id. */
  peopleListItemById: '[role="listitem"][data-participant-id]',
  /** Name inside a People-panel row. */
  peopleRowName: '.notranslate, .zWGUib, [jsname="YEtHCd"] span',

  /** Toggle button for the People panel. */
  peopleButtonAria:
    'button[aria-label*="people" i], button[aria-label*="participants" i], button[aria-label*="everyone" i]',
  peopleButtonIcon:
    'button i.google-material-icons, button i.google-symbols, button i.material-icons-extended',
  peopleButtonIconText: ['people', 'group', 'groups', 'people_outline'],
  peopleButtonPanelId: 'button[data-panel-id="1"]',

  /** Avatar image within a tile or a People-panel row. */
  avatarImg: ['img[src^="https://lh3.googleusercontent.com/"]', 'img[src^="https://"]'],

  /** Meeting title, when Meet exposes it (scheduled/calendar meetings). */
  meetingTitleAttr: '[data-meeting-title]',
} as const;

/** Meet tile labels that are not people. */
const NOT_A_PERSON = [/^\d+\s+others?$/i, /^you$/i, /^presentation$/i];

// ------------------------------------------------------------------------------------ helpers

const warned = new Set<string>();
/** Logs a detection warning once per page load so the console isn't flooded. */
export function warnOnce(id: string, message: string): void {
  if (warned.has(id)) return;
  warned.add(id);
  log.warn(message);
}

const text = (el: Element | null | undefined): string =>
  el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Finds buttons containing a Material icon whose ligature text is one of `names`. */
function buttonsByIcon(
  root: ParentNode,
  iconSelector: string,
  names: readonly string[],
): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll(iconSelector).forEach((icon) => {
    if (names.includes(text(icon))) {
      const button = icon.closest('button');
      if (button) out.push(button);
    }
  });
  return out;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

// ------------------------------------------------------------------------------ call presence

/** Meet code from a URL path such as "/abc-defg-hij" (null on the landing page, etc.). */
export function meetingCodeFromPath(pathname: string): string | null {
  const m = /^\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})(?:$|[/?#])/i.exec(pathname);
  if (m?.[1]) return m[1].toLowerCase();
  const lookup = /^\/lookup\/([a-z0-9-]{3,63})/i.exec(pathname);
  return lookup?.[1]?.toLowerCase() ?? null;
}

/** The leave-call button, if present (i.e. we are in the call, not the lobby). */
export function findLeaveButton(root: ParentNode = document): HTMLElement | null {
  const byIcon = buttonsByIcon(root, SELECTORS.leaveCallIcon, SELECTORS.leaveCallIconText);
  if (byIcon[0]) return byIcon[0];
  const byAria = root.querySelector<HTMLElement>(SELECTORS.leaveCallAria);
  if (byAria) return byAria;
  return root.querySelector<HTMLElement>(SELECTORS.leaveCallJsname);
}

export function isInCall(root: ParentNode = document): boolean {
  return findLeaveButton(root) !== null;
}

/** Meeting title if Meet shows one; otherwise null (the code is used instead). */
export function readMeetingTitle(
  root: ParentNode = document,
  docTitle = document.title,
): string | null {
  const attr = root
    .querySelector(SELECTORS.meetingTitleAttr)
    ?.getAttribute('data-meeting-title')
    ?.trim();
  if (attr) return attr.slice(0, 300);
  // document.title is e.g. "Meet - abc-defg-hij" or "Meet – Weekly sync".
  const m = /^(?:google\s+)?meet\s*[-–—:]\s*(.+)$/i.exec(docTitle.trim());
  const candidate = m?.[1]?.trim();
  if (candidate && !/^[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}$/i.test(candidate))
    return candidate.slice(0, 300);
  return null;
}

// ------------------------------------------------------------------------------- participants

function avatarOf(el: Element): string | null {
  // Try each selector in priority order (a combined selector list would return the first
  // match in DOM order, letting an unrelated https image win over the profile picture).
  for (const selector of SELECTORS.avatarImg) {
    const img = el.querySelector<HTMLImageElement>(selector);
    if (img?.src) return img.src;
  }
  return null;
}

/**
 * Builds a snapshot entry. `isSelf` comes only from structural signals found by the caller
 * (data-self-name, a separate "(You)" element); a "(You)" typed into a display name is stripped
 * but ignored, otherwise any guest could hide themselves from "exclude self" lists.
 */
function entryFromLabel(
  rawName: string,
  avatarUrl: string | null,
  isSelf: boolean,
): SnapshotEntry | null {
  const cleaned = cleanName(rawName);
  if (!cleaned.name || cleaned.presentation) return null;
  if (NOT_A_PERSON.some((re) => re.test(cleaned.name))) return null;
  return { name: cleaned.name.slice(0, 200), avatarUrl, isSelf };
}

/** A People-panel row marks the local user with a separate "(You)" element next to the name. */
function rowHasSelfBadge(row: Element, nameEl: Element | null): boolean {
  if (row.querySelector(SELECTORS.selfNameAttr)) return true;
  return Array.from(row.querySelectorAll('span, div')).some(
    (el) =>
      el !== nameEl &&
      !el.contains(nameEl) &&
      el.children.length === 0 &&
      /^[(（]\s*you\s*[)）]$/i.test(text(el)),
  );
}

export interface TileScan {
  entries: SnapshotEntry[];
  /** Meet shows an "N others" overflow tile, i.e. the grid does not contain everyone. */
  overflow: boolean;
}

/** Participants visible as video tiles. */
export function readTiles(root: ParentNode = document): TileScan {
  const entries: SnapshotEntry[] = [];
  let overflow = false;
  const seenIds = new Set<string>();
  root.querySelectorAll(SELECTORS.participantTile).forEach((tile) => {
    // Nested matches (an inner element with the same attribute) would double count.
    if (tile.parentElement?.closest(SELECTORS.participantTile)) return;
    const id =
      tile.getAttribute('data-participant-id') ??
      tile.getAttribute('data-requested-participant-id');
    if (id && seenIds.has(id)) return;
    if (id) seenIds.add(id);

    const selfEl = tile.querySelector(SELECTORS.selfNameAttr);
    const nameEl = tile.querySelector(SELECTORS.tileName);
    const raw = text(nameEl) || tile.getAttribute('aria-label') || '';
    if (/^\d+\s+others?$/i.test(raw.trim())) {
      overflow = true;
      return;
    }
    const entry = entryFromLabel(raw, avatarOf(tile), selfEl !== null);
    if (entry) entries.push(entry);
  });
  return { entries, overflow };
}

/** The People panel list element, if the panel is open. */
export function findPeopleList(root: ParentNode = document): Element | null {
  const labelled = root.querySelector(SELECTORS.peopleList);
  if (labelled) return labelled;
  const item = root.querySelector(SELECTORS.peopleListItemById);
  return item?.closest('[role="list"]') ?? null;
}

/** Participants listed in the People panel (null when the panel is closed). */
export function readPeoplePanel(root: ParentNode = document): SnapshotEntry[] | null {
  const list = findPeopleList(root);
  if (!list) return null;
  const entries: SnapshotEntry[] = [];
  list.querySelectorAll(SELECTORS.peopleListItem).forEach((row) => {
    // Rows nest other listitems in some layouts (e.g. "In this call" groups); skip containers.
    if (row.querySelector(SELECTORS.peopleListItem)) return;
    const nameEl = row.querySelector(SELECTORS.peopleRowName);
    const raw = row.getAttribute('aria-label') || text(nameEl);
    const entry = entryFromLabel(raw, avatarOf(row), rowHasSelfBadge(row, nameEl));
    if (entry) entries.push(entry);
  });
  return entries;
}

/** The People panel toggle button, if found. */
export function findPeopleButton(root: ParentNode = document): HTMLElement | null {
  const byPanelId = root.querySelector<HTMLElement>(SELECTORS.peopleButtonPanelId);
  if (byPanelId) return byPanelId;
  const byIcon = buttonsByIcon(
    root,
    SELECTORS.peopleButtonIcon,
    SELECTORS.peopleButtonIconText,
  ).find(isVisibleOrUnknown);
  if (byIcon) return byIcon;
  return root.querySelector<HTMLElement>(SELECTORS.peopleButtonAria);
}

// jsdom reports zero-size rects for everything; treat "unknown layout" as visible.
const isVisibleOrUnknown = (el: Element): boolean =>
  typeof el.getBoundingClientRect !== 'function' ||
  isVisible(el) ||
  el.getClientRects().length === 0;

/**
 * Total participant count Meet shows on the People button badge, if readable. Used to tell
 * whether what we can see is the complete list.
 */
export function readParticipantCount(root: ParentNode = document): number | null {
  const button = findPeopleButton(root);
  if (!button) return null;
  // Remove icon ligature text ("people", "group"…) before looking for digits.
  const clone = button.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('i').forEach((i) => i.remove());
  const label = button.getAttribute('aria-label') ?? '';
  const m = /(\d+)/.exec(text(clone)) ?? /(\d+)/.exec(label);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 10_000 ? n : null;
}
