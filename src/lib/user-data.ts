/**
 * Everything one account owns, in a file you can carry to another instance.
 *
 * Two deployments of this app share no state: the NAS and the Mac each have
 * their own user database, and "the same person" on both is two rows with two
 * ids. So moving in — or keeping a copy of your own work — needs an explicit
 * format rather than a database file, which would bring the OTHER account's
 * rows, live sessions and a password hash along with it.
 *
 * ## What is deliberately NOT in here
 *
 * · **The account.** No email, no display name, no password hash. On import
 *   every row is re-pointed at whoever is logged in, so the two installs can
 *   have different passwords and neither file can be used to log in as you.
 * · **Sessions.** They are live credentials; copying them would copy your
 *   logged-in state onto another machine.
 * · **Passkeys.** They are bound to the origin they were registered on — one
 *   created for deck.raynefall.dev cannot authenticate against truenas:3001,
 *   so carrying them over would only look like it worked.
 * · **Card data.** Cards, art, rulings and the banlist are scraped, identical
 *   everywhere, and enormous. The importer matches on card CODE and reports
 *   anything the destination doesn't have yet.
 */

export const USER_EXPORT_FORMAT = "cdb-user-export";
export const USER_EXPORT_VERSION = 1;

/** Deck rows carry the user's own styling and state, never the owner. */
export type ExportedDeck = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  accent_color2: string | null;
  cover_card_code: string | null;
  cover_variant: string;
  sort_order: number;
  pinned: number;
  version: string | null;
  locked: number;
  created_at: string;
  updated_at: string;
  cards: { code: string; quantity: number; purchased: number }[];
  adjustments: {
    code: string;
    kind: string;
    quantity: number;
    note: string | null;
  }[];
};

export type UserExport = {
  format: typeof USER_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  /** Free-form provenance, so a file found later says where it came from. */
  source: { app: string; note?: string };
  decks: ExportedDeck[];
  groups: { id: string; name: string; deckIds: string[]; created_at: string }[];
  collection: { code: string; variant: string; quantity: number }[];
  prices: { code: string; price: number }[];
};

/**
 * Card ids and card codes are the same string in this database today, but the
 * export writes CODES on purpose: an id is an implementation detail of one
 * install, a code is what is printed on the card. If the two ever diverge the
 * files already say the durable thing.
 */
export type ImportReport = {
  decks: { created: number; updated: number };
  cards: number;
  groups: number;
  collection: number;
  prices: number;
  /** Codes the destination's card database doesn't have. Skipped, not lost. */
  missingCards: string[];
  /** Decks skipped because their id belongs to somebody else here. */
  conflicts: string[];
};

export function isUserExport(v: unknown): v is UserExport {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.format === USER_EXPORT_FORMAT &&
    typeof o.version === "number" &&
    Array.isArray(o.decks)
  );
}

/** A human-readable summary for the confirm step, before anything is written. */
export function describeExport(x: UserExport): string {
  const cards = x.decks.reduce((n, d) => n + d.cards.length, 0);
  const bits = [
    `${x.decks.length} 副卡组`,
    `${cards} 条卡片记录`,
    x.groups.length ? `${x.groups.length} 个卡池` : "",
    x.collection.length ? `${x.collection.length} 条收藏` : "",
    x.prices.length ? `${x.prices.length} 条价格` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}
