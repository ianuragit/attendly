/**
 * Shared domain types used by the content script, service worker and UI.
 */

/** Epoch milliseconds. */
export type Timestamp = number;

/** One continuous stretch of a participant being present in the call. */
export interface Session {
  joinedAt: Timestamp;
  /** null while the participant is still present. */
  leftAt: Timestamp | null;
}

/**
 * One participant as seen in a single DOM scan. Produced by the content script,
 * consumed by the pure tracker.
 */
export interface SnapshotEntry {
  /** Display name with Meet suffixes such as "(You)" already removed. */
  name: string;
  avatarUrl: string | null;
  /** True for the local user (the person running Attendly). */
  isSelf: boolean;
}

/** Tracked state of one participant within one meeting. */
export interface ParticipantRecord {
  /** Stable identity within the meeting: normalised name + avatar hash (see participants.ts). */
  key: string;
  name: string;
  avatarUrl: string | null;
  isSelf: boolean;
  sessions: Session[];
  /**
   * Set when the participant vanished from the DOM but the disappearance has not yet
   * outlasted the debounce window. null when visible or when the session is closed.
   */
  missingSince: Timestamp | null;
}

/** The tracker's whole state for one meeting. */
export interface TrackerState {
  participants: Record<string, ParticipantRecord>;
  /** Timestamp of the most recent snapshot that was applied. */
  lastTickAt: Timestamp | null;
}

export type ManualMark = 'present' | 'absent';

export type MeetingStatus = 'active' | 'ended';

/** A persisted meeting. */
export interface MeetingRecord {
  /** Unique id (random UUID). */
  id: string;
  /** Meet code from the URL, e.g. "abc-defg-hij". */
  code: string;
  /** Title detected from the Meet page, if any. */
  detectedTitle: string | null;
  /** Title set by the user in the dashboard; overrides detectedTitle. */
  customTitle: string | null;
  notes: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  /** Last time the record was saved from a live call. */
  lastSeenAt: Timestamp;
  status: MeetingStatus;
  groupId: string | null;
  participants: ParticipantRecord[];
  /** Manual present/absent overrides keyed by participant key. */
  manualMarks: Record<string, ManualMark>;
  /** True while the user has paused tracking for this call. */
  paused: boolean;
  schemaVersion: 1;
}

export interface Group {
  id: string;
  name: string;
  createdAt: Timestamp;
  /** Meeting codes that are automatically assigned to this group when a call starts. */
  autoAssignCodes: string[];
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type TimeFormat = '12h' | '24h';
export type PeoplePanelMode = 'auto' | 'never';

export interface Settings {
  /** How often the content script re-scans the DOM, in ms. */
  pollIntervalMs: number;
  /** Hide the local user from lists, matrices and exports. */
  excludeSelf: boolean;
  /** Minimum total time in a meeting to count as "present", in ms. */
  minPresentMs: number;
  /** Record calls automatically. When off, nothing is tracked. */
  autoTrack: boolean;
  timeFormat: TimeFormat;
  theme: ThemeSetting;
  /**
   * "auto": open the People panel when tiles alone can't show everyone (large calls).
   * "never": only read what is already on screen.
   */
  peoplePanelMode: PeoplePanelMode;
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMs: 5_000,
  excludeSelf: false,
  minPresentMs: 60_000,
  autoTrack: true,
  timeFormat: '24h',
  theme: 'system',
  peoplePanelMode: 'auto',
};

/** Live status of a call in a tab, kept by the service worker for the popup and badge. */
export interface LiveStatus {
  meetingId: string;
  code: string;
  startedAt: Timestamp;
  presentCount: number;
  paused: boolean;
  updatedAt: Timestamp;
}

/**
 * What the content script sees on a Meet tab while it is NOT tracking a call. Lets the popup
 * explain why nothing is being recorded.
 */
export type PageState = 'no-meeting' | 'waiting-to-join' | 'tracking-off' | 'other-tab';

export interface PageStatus {
  state: PageState;
  /** Meeting code from the URL, if any. */
  code: string | null;
  updatedAt: Timestamp;
}
