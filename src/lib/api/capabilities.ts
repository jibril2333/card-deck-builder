/**
 * What this build of the API can do, as flat strings.
 *
 * The client probes `/meta` before it tries anything else, so this is how a
 * new endpoint becomes usable without a version bump: the app asks, and hides
 * the feature when the server it is pointed at has not got it. An old server
 * answers 404 to `/meta` itself, which is a different message ("此服务器尚未
 * 启用 App 接口") and a different remedy.
 *
 * Add a name when a capability ships; never rename one — a client in the
 * wild is matching on the string.
 */
export const API_VERSION = "1";

export const CAPABILITIES = [
  /** email + password login against the website's own accounts. */
  "session",
  /** Card search and card detail. */
  "cards",
  /** Deck list and deck detail, including friends' decks read-only. */
  "decks",
  /** Create, rename, note, lock; card quantities and held counts. */
  "deck_write",
  /** Held counts are shared across a deck's 共享卡池 — `owned_control_value`. */
  "pool_shared_held",
  /** `GET /decks/{id}/export` returns the canonical decklist text. */
  "export_text",
] as const;
