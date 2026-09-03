"use server";

import { paoCartScript, type CartItem } from "@/lib/cart-script";
import { fetchPaoQuote } from "@/lib/scraper/pao";
import { shopSearchUrl } from "@/lib/shops";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isGameId, type GameId, GAMES } from "@/lib/games";
import * as digimon from "@/lib/db/digimon";
import { buildSetOrder, deckVersionOf } from "@/lib/deck-version";
import { backupBeforeWrite } from "@/lib/db/connection";
import { parseDeckText } from "@/lib/deck-formats";
import { stripAltArt } from "@/lib/alt-art";
import { isSearchableQuery } from "@/lib/search-terms";
import { isEmptyReport, type ImportReport } from "@/lib/import-report";
import { requireUser } from "@/lib/auth/session";
import { field, formAction, z } from "./action-kit";

// ---------- Cache invalidation helpers ----------
//
// Server Actions choose one of these based on what the mutation actually
// changed. The goal is to make each call site's intent obvious and to avoid
// drift (e.g. forgetting to also bump the list page when a list-visible
// attribute changes).
//
// Three flavors:
//   - bumpDeckList: the set of decks changed (create / delete / reorder)
//       or a list-summary attribute changed (rename / cover). Use the
//       combined `bumpDeckAndList` when one specific deck's detail page
//       also needs to refresh.
//   - bumpDeck: only this deck's detail page is affected (card qty /
//       purchased counter / etc). The list intentionally stays cached —
//       its summaries are best-effort.
//   - bumpGame: whole game segment. Use when the change bleeds outside
//       /decks (e.g. a price update shows on the card-detail page too,
//       and a brand-new deck must appear in the "add to deck" widget on
//       every card page).

function bumpDeckList(game: GameId): void {
  revalidatePath(`/${game}/decks`);
}

function bumpDeck(game: GameId, deckId: string): void {
  revalidatePath(`/${game}/decks/${deckId}`);
}

function bumpDeckAndList(game: GameId, deckId: string): void {
  revalidatePath(`/${game}/decks`);
  revalidatePath(`/${game}/decks/${deckId}`);
}

function bumpGame(game: GameId): void {
  revalidatePath(`/${game}`, "layout");
}

export const createDeckAction = formAction(
  { name: field.trimmed, notes: field.trimmed, accent_color: field.trimmed },
  async ({ me, game, input }) => {
    // Empty name is fine — fall back to a generic placeholder. The user can
    // rename via the meta form afterward; this just keeps the create button
    // useful when someone clicks it without filling in the input.
    const id = digimon.createDeck({
      user_id: me.id,
      name: input.name || "新卡组",
      notes: input.notes || undefined,
      accent_color: input.accent_color || undefined,
    });
    bumpDeckList(game);
    redirect(`/${game}/decks/${id}`);
  },
);

// Create a deck without redirecting away from the current page.
// Used by the in-card "add to deck" widget.
export const createDeckQuietAction = formAction(
  { name: field.trimmed, accent_color: field.trimmed },
  async ({ me, game, input }): Promise<string> => {
    if (!input.name) throw new Error("name required");
    const id = digimon.createDeck({
      user_id: me.id,
      name: input.name,
      accent_color: input.accent_color || undefined,
    });
    // bumpGame covers the deck list too (same subtree); the card-detail
    // "add to deck" widget needs to see the new deck on every card page.
    bumpGame(game);
    return id;
  },
);

export const updateDeckMetaAction = formAction(
  {
    id: field.id,
    name: field.trimmed,
    // notes follows the same absent/empty/value trinary as accent_color2
    // below. A plain `text` field would turn "absent" into "", and the
    // banner's inline editors save one field at a time — editing the title
    // would have wiped the notes with it.
    notes: field.optionalText,
    accent_color: field.trimmed,
    // accent_color2 semantics:
    //   field absent       → undefined  (don't touch — old form posts)
    //   field present, ""  → null       (explicit clear → single-color mode)
    //   field present, val → string     (set / update)
    accent_color2: field.optionalText,
  },
  async ({ me, game, input }) => {
    const accent2 =
      input.accent_color2 === undefined
        ? undefined
        : input.accent_color2.trim() === ""
          ? null
          : input.accent_color2.trim();
    digimon.updateDeckMeta(me.id, input.id, {
      name: input.name || undefined,
      notes: input.notes,
      accent_color: input.accent_color || undefined,
      accent_color2: accent2,
    });
    bumpDeckAndList(game, input.id);
  },
);

/**
 * Set (or clear) the pack this deck is built for.
 *
 * Its own action rather than a field on updateDeckMeta's form: the picker is a
 * one-control component and sending the whole meta payload from it would make
 * every version change also a chance to clobber the name.
 */
/**
 * Close a deck to edits, or open it again.
 *
 * The lock is enforced in the repo layer (every write path throws
 * `DeckLockedError`), so this action only has to flip the flag — the UI hiding
 * the edit controls is a courtesy, not the mechanism.
 */
export const setDeckLockedAction = formAction(
  { id: field.id, locked: field.flag },
  async ({ me, game, input }) => {
    digimon.setDeckLocked(me.id, input.id, input.locked);
    bumpDeckAndList(game, input.id);
  },
);

export const setDeckVersionAction = formAction(
  { id: field.id, version: field.trimmed },
  async ({ me, game, input }) => {
    digimon.updateDeckMeta(me.id, input.id, { version: input.version || null });
    bumpDeckAndList(game, input.id);
  },
);

export const deleteDeckAction = formAction(
  { id: field.id },
  async ({ me, game, input }) => {
    digimon.deleteDeck(me.id, input.id);
    bumpDeckList(game);
    redirect(`/${game}/decks`);
  },
);

// ---------- Deck groups (shared physical card pools) ----------

function bumpGroups(game: GameId, groupId?: string): void {
  revalidatePath(`/${game}/decks`);
  if (groupId) revalidatePath(`/${game}/groups/${groupId}`);
}

/**
 * After a card's quantity changes in a pooled deck, make ONLY THAT DECK inherit
 * the pool's existing shared-held count (capped at its own quantity), so a
 * freshly-added copy shows as already-owned. We deliberately do NOT reconcile
 * the other member decks here: a quantity edit must never change how many
 * copies you physically hold, so it must never lower a sibling deck's held.
 * (Held only changes via explicit held edits — purchase mode ± / the pool
 * stepper, which DO reconcile the whole pool.) No-op for non-pooled decks.
 */
function syncPoolForCard(
  game: GameId,
  userId: string,
  deckId: string,
  cardId: string,
): boolean {
  const peers = digimon.decksSharingPoolWith(userId, deckId);
  if (peers.length <= 1) return false;
  const owned = digimon.pooledOwnedForCard(peers, cardId);
  digimon.reconcilePoolCard([deckId], cardId, owned);
  return true;
}

export const createGroupAction = formAction(
  { name: field.trimmed, deck_id: field.list },
  async ({ me, game, input }) => {
    const id = digimon.createGroup(me.id, input.name || "新卡池");
    // A new group is empty; seed it with any decks ticked on the create form.
    if (input.deck_id.length) {
      digimon.setGroupDecks(me.id, id, input.deck_id);
    }
    bumpGroups(game);
    redirect(`/${game}/groups/${id}`);
  },
);

export const renameGroupAction = formAction(
  { id: field.id, name: field.trimmed },
  async ({ me, game, input }) => {
    if (!input.name) return;
    digimon.renameGroup(me.id, input.id, input.name);
    bumpGroups(game, input.id);
  },
);

export const deleteGroupAction = formAction(
  { id: field.id },
  async ({ me, game, input }) => {
    digimon.deleteGroup(me.id, input.id);
    bumpGroups(game);
    redirect(`/${game}/decks`);
  },
);

export const setGroupDecksAction = formAction(
  { id: field.id, deck_id: field.list },
  async ({ me, game, input }) => {
    digimon.setGroupDecks(me.id, input.id, input.deck_id);
    bumpGroups(game, input.id);
  },
);

/**
 * Membership from the deck's side: which pools this deck belongs to. Pooling
 * re-levels held counts across the affected pools, so every one of them is
 * revalidated, not just the deck.
 */
export const setDeckGroupsAction = formAction(
  { deck_id: field.id, group_id: field.list },
  async ({ me, game, input }) => {
    const { deck_id: deckId, group_id: groupIds } = input;
    // Pools it is leaving need refreshing too, so read membership before the
    // write rather than after.
    const touched = digimon
      .listGroups(me.id)
      .filter(
        (g) => g.decks.some((d) => d.id === deckId) || groupIds.includes(g.id),
      )
      .map((g) => g.id);
    digimon.setDeckGroups(me.id, deckId, groupIds);
    revalidatePath(`/${game}/decks/${deckId}`);
    bumpGroups(game);
    for (const id of touched) revalidatePath(`/${game}/groups/${id}`);
  },
);

/** Dismiss a deck's import report — the 知道了 button on its info bar. */
export const clearImportReportAction = formAction(
  { deck_id: field.id },
  async ({ me, game, input }) => {
    digimon.updateDeckMeta(me.id, input.deck_id, { import_report: null });
    bumpDeck(game, input.deck_id);
  },
);

export const adjustDeckCardAction = formAction(
  { deck_id: field.id, card_id: field.id, delta: field.step },
  async ({ me, game, input }) => {
    const { deck_id: deckId, card_id: cardId } = input;
    digimon.adjustDeckCard(me.id, deckId, cardId, input.delta);
    // Pooled deck: a card just added/resized should inherit the pool's held.
    if (syncPoolForCard(game, me.id, deckId, cardId)) bumpGame(game);
    else bumpDeck(game, deckId);
  },
);

/** One deck's worth of shop lookups is fine; a crawl is not. */
const MAX_CART_LOOKUPS = 80;

/**
 * Whether the cart action may talk to the shop. Off in e2e — the suite must
 * not depend on a third party being up, and the fixture's stored quotes are
 * what those tests are about.
 */
const SHOP_LOOKUP_LIVE = process.env.CDB_SHOP_FETCH !== "off";

/**
 * Build the shop-cart script for one deck, on demand.
 *
 * Deliberately not computed while the page renders: it needs a quote per card
 * from one shop, and almost nobody opening a deck is about to go shopping.
 * The click is the signal that the query is worth making.
 *
 * Owner-only — a cart list is a shopping list, and whose it is matters.
 */
export async function buildCartScriptAction(
  game: string,
  deckId: string,
): Promise<
  | { ok: true; script: string; kinds: number; cards: number; yen: number }
  | { ok: false; error: string }
> {
  const me = await requireUser();
  if (!isGameId(game)) return { ok: false, error: "invalid game" };
  const deck = digimon.getDeck(deckId);
  if (!deck || deck.user_id !== me.id) {
    return { ok: false, error: "不是你的卡组" };
  }

  const cards = digimon.getDeckCards(deckId);
  const missing = cards
    .filter((c) => c.quantity - c.purchased > 0)
    .slice(0, MAX_CART_LOOKUPS);
  const stored = digimon.getShopQuotes(
    missing.map((c) => c.id),
    "pao",
  );

  /**
   * Ask the shop now, and only fall back to what the last refresh stored.
   *
   * A product id names one listing, and listings sell out — the stored one can
   * be hours old, or missing entirely if it was scraped before the id was
   * recorded. Looking them up at click time costs a few seconds on a button
   * nobody presses often, and it is the difference between a cart that fills
   * and one that half-fails.
   */
  const live = await Promise.all(
    missing.map((c, i) =>
      SHOP_LOOKUP_LIVE
        ? // A small stagger: this is one person's shopping list, not a crawl.
          new Promise<Awaited<ReturnType<typeof fetchPaoQuote>>>((resolve) =>
            setTimeout(
              () =>
                resolve(fetchPaoQuote(c.code, shopSearchUrl("pao", c.code))),
              (i % 4) * 120 + Math.floor(i / 4) * 260,
            ),
          )
        : Promise.resolve(null),
    ),
  );

  const items: CartItem[] = [];
  for (const [i, c] of missing.entries()) {
    const q = live[i] ?? stored.get(c.id) ?? null;
    // Out of stock is not something a cart can hold, and a listing with no
    // product id is one the cart API cannot name.
    if (!q?.in_stock || !q.item_code) continue;
    items.push({
      code: c.code,
      itemCode: q.item_code,
      quantity: c.quantity - c.purchased,
      name: c.name,
      priceYen: q.price_yen,
    });
  }
  if (items.length === 0) {
    return { ok: false, error: "PAO 目前没有这副卡组缺的卡" };
  }
  return {
    ok: true,
    script: paoCartScript(items),
    kinds: items.length,
    cards: items.reduce((n, i) => n + i.quantity, 0),
    yen: items.reduce((n, i) => n + i.priceYen * i.quantity, 0),
  };
}

export const reorderDecksAction = formAction(
  { ids: field.text },
  async ({ me, game, input }) => {
    const ids = input.ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    digimon.reorderDecks(me.id, ids);
    bumpDeckList(game);
  },
);

// ── Deck adjustments ──────────────────────────────────────────────────────
// The "considering these swaps" scratch list. Its own table, read by nothing
// else, so none of these touch deck totals / prices / shortfalls / the pool.

export const addDeckAdjustmentAction = formAction(
  { deck_id: field.id, card_id: field.id, kind: z.enum(["add", "remove"]) },
  async ({ me, game, input }) => {
    digimon.addDeckAdjustment(me.id, input.deck_id, input.card_id, input.kind);
    bumpDeck(game, input.deck_id);
  },
);

export const removeDeckAdjustmentAction = formAction(
  { id: field.id, deck_id: field.text },
  async ({ me, game, input }) => {
    digimon.removeDeckAdjustment(me.id, input.id);
    if (input.deck_id) bumpDeck(game, input.deck_id);
  },
);

export const setDeckAdjustmentQuantityAction = formAction(
  // The repo clamps the range; `strictNumber` only rejects outright nonsense.
  { id: field.id, deck_id: field.text, quantity: field.strictNumber },
  async ({ me, game, input }) => {
    digimon.setDeckAdjustmentQuantity(me.id, input.id, input.quantity);
    if (input.deck_id) bumpDeck(game, input.deck_id);
  },
);

export const setDeckAdjustmentNoteAction = formAction(
  { id: field.id, deck_id: field.text, note: field.text },
  async ({ me, game, input }) => {
    digimon.setDeckAdjustmentNote(me.id, input.id, input.note);
    if (input.deck_id) bumpDeck(game, input.deck_id);
  },
);

export type CardPickerHit = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
  /** Copies already in the deck this picker belongs to (0 when unrelated). */
  in_deck: number;
  /** Copies on the searcher's own shelf, summed over printings. */
  collected: number;
};

/**
 * Card lookup for the in-page pickers (deck build mode, adjustment memo).
 * Read-only, capped, and requires a session — the app is public through the
 * tunnel, so an unbounded anonymous query endpoint isn't something to hand out.
 *
 * Names come back in `lang` so results match what the rest of the page shows.
 * Pass `deckId` to have each hit report how many copies that deck already has.
 */
export async function searchCardsAction(
  game: string,
  q: string,
  opts?: { lang?: string; deckId?: string },
): Promise<CardPickerHit[]> {
  const me = await requireUser();
  if (!isGameId(game)) throw new Error("invalid game");
  const query = q.trim();
  if (!isSearchableQuery(query)) return [];
  // Name/code only, ranked by how well the name matches. Both callers — the
  // build-mode picker and the adjustment memo — are "I know which card I want
  // and I'm typing its name". Matching effect text there buried the card:
  // searching ドラゴン returned twelve cards, not one of them named that.
  const { rows } = digimon.searchCards({
    q: query,
    limit: 12,
    q_mode: "name",
  });

  const lang = opts?.lang;
  const names =
    game === "digimon" && (lang === "zh" || lang === "ja")
      ? digimon.getDisplayTranslations(
          rows.map((r) => r.code),
          lang,
        )
      : null;

  const inDeck = new Map<string, number>();
  if (opts?.deckId) {
    for (const c of digimon.getDeckCards(opts.deckId)) {
      inDeck.set(c.id, c.quantity);
    }
  }

  const owned = digimon.getOwnedCounts(me.id);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: names?.get(r.code)?.name ?? r.name,
    image_url: r.image_url,
    in_deck: inDeck.get(r.id) ?? 0,
    collected: owned.get(r.id) ?? 0,
  }));
}

/**
 * Pick WHICH printing of the cover card the deck shows — "" for the base art,
 * or a `card_images.variant` key like "_P1" for an alt art.
 */
export const setDeckCoverVariantAction = formAction(
  { deck_id: field.id, variant: field.text },
  async ({ me, game, input }) => {
    digimon.setDeckCoverVariant(me.id, input.deck_id, input.variant);
    bumpDeck(game, input.deck_id);
    bumpDeckList(game);
  },
);

/**
 * Mark a deck as one you actually play ("主力") or just keep on record.
 * Affects the deck list's ordering only — shortfall/diff tools still see
 * every deck.
 */
export const setDeckPinnedAction = formAction(
  { deck_id: field.id, pinned: field.flag },
  async ({ me, game, input }) => {
    // Owner-scoped in the repo: someone else's deck id is a silent no-op.
    digimon.setDeckPinned(me.id, input.deck_id, input.pinned);
    bumpDeckList(game);
  },
);

export const setCardPriceAction = formAction(
  // Empty clears the price, so this can't be a number field — "" and "abc"
  // both have to arrive here and become null.
  { card_id: field.id, price: field.trimmed },
  async ({ me, game, input }) => {
    const price = input.price === "" ? null : Number(input.price);
    digimon.setCardPrice(
      me.id,
      input.card_id,
      price !== null && Number.isFinite(price) ? price : null,
    );
    // Price shows on deck pages and the card detail; refresh the whole game
    // segment.
    bumpGame(game);
  },
);

export const setDeckCoverAction = formAction(
  // Absent or empty card_id clears the cover, so it is optional text rather
  // than an id.
  { deck_id: field.id, card_id: field.text },
  async ({ me, game, input }) => {
    digimon.setDeckCover(me.id, input.deck_id, input.card_id || null);
    bumpDeckAndList(game, input.deck_id);
  },
);

export const setDeckCardQuantityAction = formAction(
  { deck_id: field.id, card_id: field.id, quantity: field.count },
  async ({ me, game, input }) => {
    const { deck_id: deckId, card_id: cardId } = input;
    digimon.setDeckCardQuantity(me.id, deckId, cardId, input.quantity);
    if (syncPoolForCard(game, me.id, deckId, cardId)) bumpGame(game);
    else bumpDeck(game, deckId);
  },
);

export const adjustDeckCardPurchasedAction = formAction(
  { deck_id: field.id, card_id: field.id, delta: field.step },
  async ({ me, game, input }) => {
    const { deck_id: deckId, card_id: cardId, delta } = input;
    // Pooled deck: ±1 adjusts the SHARED held count (max across the pool),
    // then re-applies it to every member deck (each capped at its own
    // quantity).
    const peers = digimon.decksSharingPoolWith(me.id, deckId);
    if (peers.length > 1) {
      const cur = digimon.pooledOwnedForCard(peers, cardId);
      const owned = Math.min(
        Math.max(0, cur + delta),
        digimon.maxNeedForCard(peers, cardId),
      );
      digimon.reconcilePoolCard(peers, cardId, owned);
      bumpGame(game);
    } else {
      digimon.adjustDeckCardPurchased(me.id, deckId, cardId, delta);
      bumpDeck(game, deckId);
    }
  },
);

/** Set a card's shared held count for a whole pool (from the pool view). */
export const setPoolCardOwnedAction = formAction(
  { group_id: field.id, card_id: field.id, owned: field.count },
  async ({ me, game, input }) => {
    const { group_id: groupId, card_id: cardId } = input;
    // Ownership: getGroup returns undefined unless the caller owns the group.
    if (!digimon.getGroup(me.id, groupId)) throw new Error("not found");
    const members = digimon.groupMemberDeckIds(groupId);
    const capped = Math.min(
      input.owned,
      digimon.maxNeedForCard(members, cardId),
    );
    digimon.reconcilePoolCard(members, cardId, capped);
    bumpGroups(game, groupId);
  },
);

/**
 * Import a deck from pasted text (digimoncard.io / DCGO / community format).
 * Creates a new deck. Returns { deckId, imported, missing } on success,
 * or { error } on parse failure.
 */
export async function importDeckAction(formData: FormData): Promise<{
  ok: boolean;
  deckId?: string;
  imported?: number;
  missing?: string[];
  error?: string;
}> {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const rawName = String(formData.get("name") ?? "").trim();
  const text = String(formData.get("text") ?? "");
  if (!isGameId(game)) return { ok: false, error: "invalid game" };
  if (!text.trim()) return { ok: false, error: "请粘贴卡组文本" };
  backupBeforeWrite(game);

  const { lines, errors } = parseDeckText(text);
  if (lines.length === 0) {
    return {
      ok: false,
      error: `没有解析到任何卡（${errors.length ? errors.slice(0, 3).join("; ") : "格式不识别"}）`,
    };
  }

  // Normalize alt-art / parallel suffixes (e.g. "EX2-060_P1" → "EX2-060") to
  // the base printing — that's the restriction identity — and
  // merge duplicate stacks that collapse to the same code.
  const merged = new Map<string, number>();
  for (const ln of lines) {
    const base = stripAltArt(ln.code);
    merged.set(base, (merged.get(base) ?? 0) + ln.qty);
  }

  // Pre-fetch the banlist data so we can predict every clamp BEFORE we
  // touch user.deck_cards. This lets us:
  //   (a) build a complete "what was dropped and why" report
  //   (b) avoid the order-sensitive split-personality where pair detection
  //       happens *inside* clampQuantityToRestriction (still safe — we'll
  //       re-clamp on write — just rebuilt here for reporting).
  const restrictionByIdentity = new Map<
    string,
    { max_count: number; status: string }
  >();
  for (const r of digimon.listRestrictions()) {
    restrictionByIdentity.set(r.identity, {
      max_count: r.max_count,
      status: r.status,
    });
  }
  // Symmetric pair-opposite map: identity → set of identities that can't
  // coexist with it (whether this identity is the trigger or the banned
  // side, both directions land in the same map).
  const pairOpposites = new Map<string, Set<string>>();
  for (const p of digimon.listBannedPairs()) {
    const a = p.trigger_identity;
    const b = p.banned_identity;
    if (!pairOpposites.has(a)) pairOpposites.set(a, new Set());
    pairOpposites.get(a)!.add(b);
    if (!pairOpposites.has(b)) pairOpposites.set(b, new Set());
    pairOpposites.get(b)!.add(a);
  }
  const STANDARD_MAX = 4;

  type Drop =
    | { type: "banned"; code: string; requested: number }
    | { type: "limited"; code: string; requested: number; cap: number }
    | { type: "overlimit"; code: string; requested: number; cap: number }
    | { type: "pair"; code: string; conflictWith: string };

  const drops: Drop[] = [];
  /** Codes the parser read but the card DB doesn't have, with the requested
   *  count — recorded in the import report so they aren't silently lost. */
  const missing: { code: string; qty: number }[] = [];
  const plan: { cardId: string; qty: number }[] = [];
  const seenIdentities = new Set<string>();
  // Hero candidates for auto-naming / auto-cover when the user didn't
  // supply a deck title: Lv 6 (= Mega stage) is the conventional "headliner"
  // of a Digimon deck.
  const heroCandidates: { id: string; name: string; qty: number }[] = [];

  for (const [code, qty] of merged) {
    const card = digimon.getCardByCode(code);
    if (!card) {
      missing.push({ code, qty });
      continue;
    }
    // `code` is the base identity: we already stripAltArt'd above, and the
    // restriction identity IS the code.
    const identity = code;

    // Pair conflict: anything earlier in the import that pairs with me?
    // Whichever card appeared FIRST in the text wins; the later one is
    // dropped. Reported, so the user can re-order intent.
    const opp = pairOpposites.get(identity);
    if (opp) {
      let blockedBy: string | null = null;
      for (const o of opp) {
        if (seenIdentities.has(o)) {
          blockedBy = o;
          break;
        }
      }
      if (blockedBy) {
        drops.push({ type: "pair", code, conflictWith: blockedBy });
        continue;
      }
    }

    // Per-card restriction (banned / limited).
    const r = restrictionByIdentity.get(identity);
    let finalQty = qty;
    if (r) {
      if (r.max_count === 0) {
        drops.push({ type: "banned", code, requested: qty });
        continue;
      }
      if (qty > r.max_count) {
        drops.push({ type: "limited", code, requested: qty, cap: r.max_count });
        finalQty = r.max_count;
      }
    } else {
      // A few cards license their own higher limit in rules text ("(Rule) You
      // can include up to 50 copies…" — Vemmon, Eosmon, …). Ask the repo so
      // this matches what the deck editor would actually allow, instead of
      // reporting a legal 8-of as over the limit.
      const cap = digimon.selfDeclaredCopyLimit(card.id) ?? STANDARD_MAX;
      if (qty > cap) {
        // Some sloppy import sources (text dumps) request higher numbers —
        // clamp and note rather than silently truncate.
        drops.push({ type: "overlimit", code, requested: qty, cap });
        finalQty = cap;
      }
    }

    plan.push({ cardId: card.id, qty: finalQty });
    seenIdentities.add(identity);

    // Track potential heroes. The cast is safe under the game branch
    // since we just fetched via digimon.getCardByCode in that arm.
    if (game === "digimon" && (card as digimon.DigimonCard).level === 6) {
      heroCandidates.push({
        id: card.id,
        name: (card as digimon.DigimonCard).name,
        qty: finalQty,
      });
    }
  }

  // What we couldn't place, as data rather than prose. It used to be written
  // into the deck's NOTES — the owner's own field — where it sat until they
  // deleted it by hand. It now rides along in `decks.import_report` and shows
  // up in the deck's info bar, which has a dismiss button. See
  // lib/import-report.
  const bannedDrops = drops.filter((d) => d.type === "banned") as Extract<
    Drop,
    { type: "banned" }
  >[];
  const limitedDrops = drops.filter(
    (d) => d.type === "limited" || d.type === "overlimit",
  ) as Array<
    Extract<Drop, { type: "limited" }> | Extract<Drop, { type: "overlimit" }>
  >;
  const pairDrops = drops.filter((d) => d.type === "pair") as Extract<
    Drop,
    { type: "pair" }
  >[];
  const report: ImportReport = {};
  if (missing.length) report.missing = missing;
  if (bannedDrops.length)
    report.banned = bannedDrops.map((d) => ({
      code: d.code,
      qty: d.requested,
    }));
  if (limitedDrops.length)
    report.capped = limitedDrops.map((d) => ({
      code: d.code,
      from: d.requested,
      to: d.cap,
    }));
  if (pairDrops.length)
    report.pairs = pairDrops.map((d) => ({
      code: d.code,
      with: d.conflictWith,
    }));
  if (errors.length) report.unparsed = errors.slice(0, 10);
  const importReport = isEmptyReport(report) ? null : JSON.stringify(report);

  // Pick a "hero" card when the user didn't name the deck: whichever Lv 6
  // card has the most copies, ties broken alphabetically by name. We don't
  // override a user-supplied title — that's their intent.
  let hero: { id: string; name: string } | null = null;
  if (!rawName && heroCandidates.length > 0) {
    heroCandidates.sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return a.name.localeCompare(b.name);
    });
    hero = { id: heroCandidates[0].id, name: heroCandidates[0].name };
  }
  const name = rawName || hero?.name || "Imported Deck";

  // Now that we know exactly what we're writing, create the deck and run
  // the writes. setDeckCardQuantity will re-clamp internally — that's fine,
  // the re-clamp will be a no-op since we already pre-clamped here.
  const deckId = digimon.createDeck({
    user_id: me.id,
    name,
    import_report: importReport,
    accent_color: GAMES[game].accent,
  });
  for (const w of plan) {
    digimon.setDeckCardQuantity(me.id, deckId, w.cardId, w.qty);
  }
  // Cover follows the hero when we picked one. Done after the deck cards
  // are written so the cover-card actually exists in deck_cards (the
  // listDecksWithCover join expects this — a cover that isn't in the deck
  // would render blank).
  if (hero) {
    digimon.setDeckCover(me.id, deckId, hero.id);
  }

  // Date the list by its own contents: the newest pack any card in it needs.
  // An imported list is a snapshot of somebody's deck at a moment in the
  // format, and that moment is recoverable from the cards themselves — asking
  // the importer to pick it from a dropdown would be asking them to restate
  // what they just pasted. Best-effort: a card pool with no `card_sets` rows
  // yet (the `sets` refresh stage never run) leaves it unset.
  try {
    const order = buildSetOrder(digimon.listCardSets());
    const version = deckVersionOf(
      plan
        .map((w) => digimon.getCardById(w.cardId))
        .filter((c): c is NonNullable<typeof c> => !!c),
      order,
    );
    if (version) digimon.updateDeckMeta(me.id, deckId, { version });
  } catch (err) {
    // Never lose an import over the label.
    console.error("[import] version detection failed:", err);
  }

  bumpDeckList(game);
  return {
    ok: true,
    deckId,
    imported: plan.length,
    missing: missing.map((m) => m.code),
  };
}

export const setDeckCardPurchasedAction = formAction(
  { deck_id: field.id, card_id: field.id, purchased: field.count },
  async ({ me, game, input }) => {
    const { deck_id: deckId, card_id: cardId, purchased } = input;
    // If this deck shares a pool, held is a shared count — set it for the
    // whole pool (each deck capped at its own quantity). Otherwise just this
    // deck.
    const peers = digimon.decksSharingPoolWith(me.id, deckId);
    if (peers.length > 1) {
      const owned = Math.min(purchased, digimon.maxNeedForCard(peers, cardId));
      digimon.reconcilePoolCard(peers, cardId, owned);
      bumpGame(game);
    } else {
      digimon.setDeckCardPurchased(me.id, deckId, cardId, purchased);
      bumpDeck(game, deckId);
    }
  },
);

// ────────────────────────────────────────────────────────────────────────
// Card collection
// ────────────────────────────────────────────────────────────────────────

function bumpCollection(game: GameId): void {
  revalidatePath(`/${game}/collection`);
}

export const setCardCollectionAction = formAction(
  { card_id: field.id, variant: field.text, quantity: field.count },
  async ({ me, game, input }) => {
    digimon.setCardCollectionQuantity(
      me.id,
      input.card_id,
      input.variant,
      input.quantity,
    );
    bumpCollection(game);
  },
);

export const adjustCardCollectionAction = formAction(
  { card_id: field.id, variant: field.text, delta: field.step },
  async ({ me, game, input }) => {
    digimon.adjustCardCollection(
      me.id,
      input.card_id,
      input.variant,
      input.delta,
    );
    bumpCollection(game);
  },
);

/**
 * Used by the collection-page "quick add" form. Resolves a card code →
 * card_id, then bumps the collection. Returns a friendly error if the code
 * isn't in the DB (instead of throwing — the form wants to show inline
 * feedback rather than blow up into error.tsx).
 */
export async function adjustCollectionByCodeAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const code = String(formData.get("code") ?? "").trim();
  const variant = String(formData.get("variant") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  if (!isGameId(game)) return { ok: false, error: "invalid game" };
  if (!code) return { ok: false, error: "请填编号" };
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "数量必须 ≥ 1" };
  }
  const card = digimon.getCardByCode(code);
  if (!card) {
    return {
      ok: false,
      error: `数据库里没找到「${code}」。检查拼写,或先用 scraper 抓一下这一包。`,
    };
  }
  backupBeforeWrite(game);
  digimon.adjustCardCollection(me.id, card.id, variant, delta);
  bumpCollection(game);
  return { ok: true };
}
