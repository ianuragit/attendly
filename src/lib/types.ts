/**
 * Shared domain types. Fleshed out in later phases (tracker, storage, UI).
 */

/** Epoch milliseconds. */
export type Timestamp = number;

/** One continuous stretch of a participant being present in the call. */
export interface Session {
  joinedAt: Timestamp;
  /** null while the participant is still present. */
  leftAt: Timestamp | null;
}
