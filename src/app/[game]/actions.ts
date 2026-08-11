"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isGameId, type GameId, GAMES } from "@/lib/games";
import * as digimon from "@/lib/db/digimon";
import { backupBeforeWrite } from "@/lib/db/connection";
import { parseDeckText } from "@/lib/deck-formats";
import { stripAltArt } from "@/lib/alt-art";
import { requireUser } from "@/lib/auth/session";

function lib(_game: GameId) {
  return digimon;
}

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

export async function createDeckAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const rawName = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const accent = String(formData.get("accent_color") ?? "").trim() || undefined;
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  // Empty name is fine — fall back to a generic placeholder. The user can
  // rename via the meta form afterward; this just keeps the create button
  // useful when someone clicks it without filling in the input.
  const name = rawName || "新卡组";
  const id = lib(game).createDeck({
    user_id: me.id,
    name,
    notes,
    accent_color: accent,
  });
  bumpDeckList(game);
  redirect(`/${game}/decks/${id}`);
}

// Create a deck without redirecting away from the current page.
// Used by the in-card "add to deck" widget.
export async function createDeckQuietAction(formData: FormData): Promise<string> {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const name = String(formData.get("name") ?? "").trim();
  const accent = String(formData.get("accent_color") ?? "").trim() || undefined;
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  if (!name) throw new Error("name required");
  const id = lib(game).createDeck({
    user_id: me.id,
    name,
    accent_color: accent,
  });
  // bumpGame covers the deck list too (same subtree); the card-detail
  // "add to deck" widget needs to see the new deck on every card page.
  bumpGame(game);
  return id;
}

export async function updateDeckMetaAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  // notes follows the same absent/empty/value trinary as accent_color2 below.
  // It used to read `?? ""`, which meant a post that didn't carry the field
  // silently blanked the notes — fine when the only caller was a form that
  // always sent every field, but the banner's inline editors save one field
  // at a time and editing the title would have wiped the notes with it.
  const notesRaw = formData.get("notes");
  const notes: string | undefined =
    notesRaw === null ? undefined : String(notesRaw);
  const accent_color = String(formData.get("accent_color") ?? "").trim();
  // accent_color2 semantics:
  //   field absent       → undefined  (don't touch — backward compat for old form posts)
  //   field present, ""  → null       (explicit clear → single-color mode)
  //   field present, val → string     (set / update)
  const accent2Raw = formData.get("accent_color2");
  const accent_color2: string | null | undefined =
    accent2Raw === null
      ? undefined
      : String(accent2Raw).trim() === ""
        ? null
        : String(accent2Raw).trim();
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  digimon.updateDeckMeta(me.id, id, {
    name: name || undefined,
    notes: notes,
    accent_color: accent_color || undefined,
    accent_color2,
  });
  bumpDeckAndList(game, id);
}

export async function deleteDeckAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id"));
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).deleteDeck(me.id, id);
  bumpDeckList(game);
  redirect(`/${game}/decks`);
}

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
  const peers = lib(game).decksSharingPoolWith(userId, deckId);
  if (peers.length <= 1) return false;
  const owned = lib(game).pooledOwnedForCard(peers, cardId);
  lib(game).reconcilePoolCard([deckId], cardId, owned);
  return true;
}

export async function createGroupAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const name = String(formData.get("name") ?? "").trim() || "新组合";
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  const id = lib(game).createGroup(me.id, name);
  // A new group is empty; seed it with any decks ticked on the create form.
  const deckIds = formData.getAll("deck_id").map(String).filter(Boolean);
  if (deckIds.length) lib(game).setGroupDecks(me.id, id, deckIds);
  bumpGroups(game);
  redirect(`/${game}/groups/${id}`);
}

export async function renameGroupAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!isGameId(game)) throw new Error("invalid game");
  if (!name) return;
  backupBeforeWrite(game);
  lib(game).renameGroup(me.id, id, name);
  bumpGroups(game, id);
}

export async function deleteGroupAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id"));
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).deleteGroup(me.id, id);
  bumpGroups(game);
  redirect(`/${game}/decks`);
}

export async function setGroupDecksAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id"));
  const deckIds = formData.getAll("deck_id").map(String).filter(Boolean);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).setGroupDecks(me.id, id, deckIds);
  bumpGroups(game, id);
}

/**
 * Membership from the deck's side: which pools this deck belongs to. Pooling
 * re-levels held counts across the affected pools, so every one of them is
 * revalidated, not just the deck.
 */
export async function setDeckGroupsAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const groupIds = formData.getAll("group_id").map(String).filter(Boolean);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  // Pools it is leaving need refreshing too, so read membership before the
  // write rather than after.
  const touched = lib(game)
    .listGroups(me.id)
    .filter((g) => g.decks.some((d) => d.id === deckId) || groupIds.includes(g.id))
    .map((g) => g.id);
  lib(game).setDeckGroups(me.id, deckId, groupIds);
  revalidatePath(`/${game}/decks/${deckId}`);
  bumpGroups(game);
  for (const id of touched) revalidatePath(`/${game}/groups/${id}`);
}

export async function adjustDeckCardAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const delta = Number(formData.get("delta") ?? 0);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).adjustDeckCard(me.id, deckId, cardId, delta);
  // Pooled deck: a card just added/resized should inherit the pool's held.
  if (syncPoolForCard(game, me.id, deckId, cardId)) bumpGame(game);
  else bumpDeck(game, deckId);
}

export async function reorderDecksAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const idsRaw = String(formData.get("ids") ?? "");
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;
  lib(game).reorderDecks(me.id, ids);
  bumpDeckList(game);
}

// ── Deck adjustments ──────────────────────────────────────────────────────
// The "considering these swaps" scratch list. Its own table, read by nothing
// else, so none of these touch deck totals / prices / shortfalls / the pool.

export async function addDeckAdjustmentAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id") ?? "");
  const cardId = String(formData.get("card_id") ?? "");
  const kind = String(formData.get("kind"));
  if (!isGameId(game)) throw new Error("invalid game");
  if (!deckId || !cardId) throw new Error("missing deck_id/card_id");
  if (kind !== "add" && kind !== "remove") throw new Error("invalid kind");
  backupBeforeWrite(game);
  lib(game).addDeckAdjustment(me.id, deckId, cardId, kind);
  bumpDeck(game, deckId);
}

export async function removeDeckAdjustmentAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id") ?? "");
  const deckId = String(formData.get("deck_id") ?? "");
  if (!isGameId(game)) throw new Error("invalid game");
  if (!id) throw new Error("missing id");
  backupBeforeWrite(game);
  lib(game).removeDeckAdjustment(me.id, id);
  if (deckId) bumpDeck(game, deckId);
}

export async function setDeckAdjustmentQuantityAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id") ?? "");
  const deckId = String(formData.get("deck_id") ?? "");
  const quantity = Number(formData.get("quantity"));
  if (!isGameId(game)) throw new Error("invalid game");
  if (!id) throw new Error("missing id");
  if (!Number.isFinite(quantity)) throw new Error("invalid quantity");
  backupBeforeWrite(game);
  // The repo clamps the range; this only rejects outright nonsense.
  lib(game).setDeckAdjustmentQuantity(me.id, id, quantity);
  if (deckId) bumpDeck(game, deckId);
}

export async function setDeckAdjustmentNoteAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const id = String(formData.get("id") ?? "");
  const deckId = String(formData.get("deck_id") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!isGameId(game)) throw new Error("invalid game");
  if (!id) throw new Error("missing id");
  backupBeforeWrite(game);
  lib(game).setDeckAdjustmentNote(me.id, id, note);
  if (deckId) bumpDeck(game, deckId);
}

export type CardPickerHit = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
  /** Copies already in the deck this picker belongs to (0 when unrelated). */
  in_deck: number;
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
  await requireUser();
  if (!isGameId(game)) throw new Error("invalid game");
  const query = q.trim();
  if (query.length < 2) return [];
  // Name/code only, ranked by how well the name matches. Both callers — the
  // build-mode picker and the adjustment memo — are "I know which card I want
  // and I'm typing its name". Matching effect text there buried the card:
  // searching ドラゴン returned twelve cards, not one of them named that.
  const { rows } = lib(game).searchCards({
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
    for (const c of lib(game).getDeckCards(opts.deckId)) {
      inDeck.set(c.id, c.quantity);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: names?.get(r.code)?.name ?? r.name,
    image_url: r.image_url,
    in_deck: inDeck.get(r.id) ?? 0,
  }));
}

/**
 * Pick WHICH printing of the cover card the deck shows — "" for the base art,
 * or a `card_images.variant` key like "_P1" for an alt art.
 */
export async function setDeckCoverVariantAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id") ?? "");
  const variant = String(formData.get("variant") ?? "");
  if (!isGameId(game)) throw new Error("invalid game");
  if (!deckId) throw new Error("missing deck_id");
  backupBeforeWrite(game);
  lib(game).setDeckCoverVariant(me.id, deckId, variant);
  bumpDeck(game, deckId);
  bumpDeckList(game);
}

/**
 * Mark a deck as one you actually play ("主力") or just keep on record.
 * Affects the deck list's ordering only — shortfall/diff tools still see
 * every deck.
 */
export async function setDeckPinnedAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id") ?? "");
  const pinned = String(formData.get("pinned")) === "1";
  if (!isGameId(game)) throw new Error("invalid game");
  if (!deckId) throw new Error("missing deck_id");
  backupBeforeWrite(game);
  // Owner-scoped in the repo: someone else's deck id is a silent no-op.
  lib(game).setDeckPinned(me.id, deckId, pinned);
  bumpDeckList(game);
}

export async function setCardPriceAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const cardId = String(formData.get("card_id"));
  const raw = String(formData.get("price") ?? "").trim();
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  const price = raw === "" ? null : Number(raw);
  lib(game).setCardPrice(
    me.id,
    cardId,
    price !== null && Number.isFinite(price) ? price : null,
  );
  // Price shows on deck pages and the card detail; refresh the whole game segment.
  bumpGame(game);
}

export async function setDeckCoverAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const raw = formData.get("card_id");
  const cardId = raw === null || raw === "" ? null : String(raw);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).setDeckCover(me.id, deckId, cardId);
  bumpDeckAndList(game, deckId);
}

export async function setDeckCardQuantityAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const quantity = Math.max(0, Number(formData.get("quantity") ?? 0));
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).setDeckCardQuantity(me.id, deckId, cardId, quantity);
  if (syncPoolForCard(game, me.id, deckId, cardId)) bumpGame(game);
  else bumpDeck(game, deckId);
}

export async function adjustDeckCardPurchasedAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const delta = Number(formData.get("delta") ?? 0);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  // Pooled deck: ±1 adjusts the SHARED held count (max across the pool), then
  // re-applies it to every member deck (each capped at its own quantity).
  const peers = lib(game).decksSharingPoolWith(me.id, deckId);
  if (peers.length > 1) {
    const cur = lib(game).pooledOwnedForCard(peers, cardId);
    const owned = Math.min(
      Math.max(0, cur + delta),
      lib(game).maxNeedForCard(peers, cardId),
    );
    lib(game).reconcilePoolCard(peers, cardId, owned);
    bumpGame(game);
  } else {
    lib(game).adjustDeckCardPurchased(me.id, deckId, cardId, delta);
    bumpDeck(game, deckId);
  }
}

/** Set a card's shared held count for a whole pool (from the pool view). */
export async function setPoolCardOwnedAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const groupId = String(formData.get("group_id"));
  const cardId = String(formData.get("card_id"));
  const owned = Math.max(0, Number(formData.get("owned") ?? 0));
  if (!isGameId(game)) throw new Error("invalid game");
  // Ownership: getGroup returns undefined unless the caller owns the group.
  if (!lib(game).getGroup(me.id, groupId)) throw new Error("not found");
  backupBeforeWrite(game);
  const members = lib(game).groupMemberDeckIds(groupId);
  const capped = Math.min(owned, lib(game).maxNeedForCard(members, cardId));
  lib(game).reconcilePoolCard(members, cardId, capped);
  bumpGroups(game, groupId);
}

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

  const l = lib(game);

  // Normalize alt-art / parallel suffixes (e.g. "EX2-060_P1" → "EX2-060") to
  // the base printing — that's the restriction identity for both games — and
  // merge duplicate stacks that collapse to the same code.
  const merged = new Map<string, number>();
  for (const ln of lines) {
    const base = stripAltArt(ln.code);
    merged.set(base, (merged.get(base) ?? 0) + ln.qty);
  }

  // Pre-fetch the banlist data so we can predict every clamp BEFORE we
  // touch user.deck_cards. This lets us:
  //   (a) build a complete "what was dropped and why" report for notes
  //   (b) avoid the order-sensitive split-personality where pair detection
  //       happens *inside* clampQuantityToRestriction (still safe — we'll
  //       re-clamp on write — just rebuilt here for reporting).
  const restrictionByIdentity = new Map<
    string,
    { max_count: number; status: string }
  >();
  for (const r of l.listRestrictions()) {
    restrictionByIdentity.set(r.identity, {
      max_count: r.max_count,
      status: r.status,
    });
  }
  // Symmetric pair-opposite map: identity → set of identities that can't
  // coexist with it (whether this identity is the trigger or the banned
  // side, both directions land in the same map).
  const pairOpposites = new Map<string, Set<string>>();
  for (const p of l.listBannedPairs()) {
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
   *  count — recorded in the notes so they aren't silently lost. */
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
    // `code` is the base identity since we already stripAltArt'd above and
    // both Digimon (identity == code) and UA (identity == stripped code)
    // collapse to the same form.
    const identity = code;

    // Pair conflict: anything earlier in the import that pairs with me?
    // Whichever card appeared FIRST in the text wins; the later one is
    // dropped. Documented in the notes so the user can re-order intent.
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
      const cap = l.selfDeclaredCopyLimit(card.id) ?? STANDARD_MAX;
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

  // Build a single composite notes string. Each reason gets its own
  // labeled section so the user can scan quickly. The parse-error head
  // section preserves the previous behavior; new sections only render
  // when there's something to say.
  const notesParts: string[] = [];
  if (errors.length) {
    notesParts.push(
      `解析失败 ${errors.length} 行:\n` +
        errors
          .slice(0, 10)
          .map((e) => `  ${e}`)
          .join("\n"),
    );
  }
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
  if (missing.length) {
    // These never made it into the deck at all: either the code is a typo, or
    // it's a set our scrapers haven't imported yet. Writing them down means an
    // import is never quietly incomplete — the user can re-add them by hand
    // once the card exists.
    notesParts.push(
      `未找到的卡(未导入) ${missing.length}:\n` +
        missing.map((m) => `  ${m.code} ×${m.qty}`).join("\n"),
    );
  }
  if (bannedDrops.length) {
    notesParts.push(
      `禁卡(已跳过) ${bannedDrops.length}:\n` +
        bannedDrops
          .map((d) => `  ${d.code}(请求 ${d.requested} 张)`)
          .join("\n"),
    );
  }
  if (limitedDrops.length) {
    notesParts.push(
      `超出上限(已截到上限) ${limitedDrops.length}:\n` +
        limitedDrops
          .map((d) => {
            const cap = d.cap;
            const reason =
              d.type === "limited"
                ? `限${d.cap}`
                : `上限 ${d.cap} 张`;
            return `  ${d.code}(${d.requested} → ${cap}, ${reason})`;
          })
          .join("\n"),
    );
  }
  if (pairDrops.length) {
    notesParts.push(
      `禁卡组合冲突(已跳过) ${pairDrops.length}:\n` +
        pairDrops
          .map((d) => `  ${d.code}(与 ${d.conflictWith} 互斥)`)
          .join("\n"),
    );
  }
  const notes = notesParts.length ? notesParts.join("\n\n") : undefined;

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
  const deckId = l.createDeck({
    user_id: me.id,
    name,
    notes,
    accent_color: GAMES[game].accent,
  });
  for (const w of plan) {
    l.setDeckCardQuantity(me.id, deckId, w.cardId, w.qty);
  }
  // Cover follows the hero when we picked one. Done after the deck cards
  // are written so the cover-card actually exists in deck_cards (the
  // listDecksWithCover join expects this — a cover that isn't in the deck
  // would render blank).
  if (hero) {
    l.setDeckCover(me.id, deckId, hero.id);
  }

  bumpDeckList(game);
  return {
    ok: true,
    deckId,
    imported: plan.length,
    missing: missing.map((m) => m.code),
  };
}

export async function setDeckCardPurchasedAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const purchased = Math.max(0, Number(formData.get("purchased") ?? 0));
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  // If this deck shares a pool, held is a shared count — set it for the whole
  // pool (each deck capped at its own quantity). Otherwise just this deck.
  const peers = lib(game).decksSharingPoolWith(me.id, deckId);
  if (peers.length > 1) {
    const owned = Math.min(
      purchased,
      lib(game).maxNeedForCard(peers, cardId),
    );
    lib(game).reconcilePoolCard(peers, cardId, owned);
    bumpGame(game);
  } else {
    lib(game).setDeckCardPurchased(me.id, deckId, cardId, purchased);
    bumpDeck(game, deckId);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Card collection
// ────────────────────────────────────────────────────────────────────────

function bumpCollection(game: GameId): void {
  revalidatePath(`/${game}/collection`);
}

export async function setCardCollectionAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const cardId = String(formData.get("card_id"));
  const variant = String(formData.get("variant") ?? "");
  const quantity = Math.max(0, Number(formData.get("quantity") ?? 0));
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).setCardCollectionQuantity(me.id, cardId, variant, quantity);
  bumpCollection(game);
}

export async function adjustCardCollectionAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const cardId = String(formData.get("card_id"));
  const variant = String(formData.get("variant") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).adjustCardCollection(me.id, cardId, variant, delta);
  bumpCollection(game);
}

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
  lib(game).adjustCardCollection(me.id, card.id, variant, delta);
  bumpCollection(game);
  return { ok: true };
}
