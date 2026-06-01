"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isGameId, type GameId, GAMES } from "@/lib/games";
import * as digimon from "@/lib/db/digimon";
import * as ua from "@/lib/db/unionarena";
import { backupBeforeWrite } from "@/lib/db/connection";
import { parseDeckText } from "@/lib/deck-formats";
import { stripAltArt } from "@/lib/alt-art";
import { requireUser } from "@/lib/auth/session";

function lib(game: GameId) {
  return game === "digimon" ? digimon : ua;
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
  const notes = String(formData.get("notes") ?? "");
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
  // UA locks use the same "absent / empty / value" trinary as accent2.
  // Only forwarded to the UA branch since Digimon's repo signature doesn't
  // accept these keys (and the DB column doesn't exist).
  if (game === "unionarena") {
    const seriesRaw = formData.get("locked_series");
    const colorRaw = formData.get("locked_color");
    const locked_series: string | null | undefined =
      seriesRaw === null
        ? undefined
        : String(seriesRaw).trim() === ""
          ? null
          : String(seriesRaw).trim();
    const locked_color: string | null | undefined =
      colorRaw === null
        ? undefined
        : String(colorRaw).trim() === ""
          ? null
          : String(colorRaw).trim();
    ua.updateDeckMeta(me.id, id, {
      name: name || undefined,
      notes: notes,
      accent_color: accent_color || undefined,
      accent_color2,
      locked_series,
      locked_color,
    });
  } else {
    digimon.updateDeckMeta(me.id, id, {
      name: name || undefined,
      notes: notes,
      accent_color: accent_color || undefined,
      accent_color2,
    });
  }
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

export async function adjustDeckCardAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const delta = Number(formData.get("delta") ?? 0);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).adjustDeckCard(me.id, deckId, cardId, delta);
  bumpDeck(game, deckId);
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
  bumpDeck(game, deckId);
}

export async function adjustDeckCardPurchasedAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const delta = Number(formData.get("delta") ?? 0);
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).adjustDeckCardPurchased(me.id, deckId, cardId, delta);
  bumpDeck(game, deckId);
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
    | { type: "overlimit"; code: string; requested: number }
    | { type: "pair"; code: string; conflictWith: string }
    | { type: "wrong_series"; code: string; expected: string; got: string }
    | { type: "wrong_color"; code: string; expected: string; got: string };

  // UA-only: track the pending series / color lock as we walk the import.
  // The first valid card "wins" — its series + color become the lock, and
  // every later card has to match. Mirrors the runtime behavior of
  // setDeckCardQuantity for a brand-new deck.
  let pendingSeries: string | null = null;
  let pendingColor: string | null = null;

  const drops: Drop[] = [];
  const missing: string[] = [];
  const plan: { cardId: string; qty: number }[] = [];
  const seenIdentities = new Set<string>();
  // Hero candidates for auto-naming / auto-cover when the user didn't
  // supply a deck title. Currently Digimon-only: Lv 6 (= Mega stage) is the
  // conventional "headliner" of a Digimon deck. UA has no analogous "level"
  // concept, so leave the heuristic unimplemented there.
  const heroCandidates: { id: string; name: string; qty: number }[] = [];

  for (const [code, qty] of merged) {
    const card =
      game === "digimon"
        ? digimon.getCardByCode(code)
        : ua.getCardByCode(code);
    if (!card) {
      missing.push(code);
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

    // UA-only: series + color lock enforcement. First passing card sets
    // the pendingSeries/pendingColor; subsequent cards must match. Same
    // semantics as the runtime clamp, just predicted here so we can drop
    // mismatches into the notes with an explicit reason.
    if (game === "unionarena") {
      const uaCard = card as ua.UACard;
      if (pendingSeries === null) {
        pendingSeries = uaCard.series;
      } else if (uaCard.series !== pendingSeries) {
        drops.push({
          type: "wrong_series",
          code,
          expected: pendingSeries,
          got: uaCard.series,
        });
        continue;
      }
      if (pendingColor === null) {
        pendingColor = uaCard.color;
      } else if (uaCard.color !== pendingColor) {
        drops.push({
          type: "wrong_color",
          code,
          expected: pendingColor,
          got: uaCard.color,
        });
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
    } else if (qty > STANDARD_MAX) {
      // Standard 4-of cap. Some sloppy import sources (text dumps) request
      // higher numbers — clamp and note rather than silently truncate.
      drops.push({ type: "overlimit", code, requested: qty });
      finalQty = STANDARD_MAX;
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
  const seriesDrops = drops.filter(
    (d) => d.type === "wrong_series",
  ) as Extract<Drop, { type: "wrong_series" }>[];
  const colorDrops = drops.filter(
    (d) => d.type === "wrong_color",
  ) as Extract<Drop, { type: "wrong_color" }>[];
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
            const cap = d.type === "limited" ? d.cap : STANDARD_MAX;
            const reason = d.type === "limited" ? `限${d.cap}` : "标准 4 张";
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
  if (seriesDrops.length) {
    // All series drops in a single import share the same `expected`
    // (whatever the first card locked to), so put it in the header.
    notesParts.push(
      `不是本作品(已跳过) ${seriesDrops.length} — 锁定作品: ${seriesDrops[0].expected}\n` +
        seriesDrops.map((d) => `  ${d.code}(${d.got})`).join("\n"),
    );
  }
  if (colorDrops.length) {
    notesParts.push(
      `不是本色(已跳过) ${colorDrops.length} — 锁定颜色: ${colorDrops[0].expected}\n` +
        colorDrops.map((d) => `  ${d.code}(${d.got})`).join("\n"),
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
  return { ok: true, deckId, imported: plan.length, missing };
}

export async function setDeckCardPurchasedAction(formData: FormData) {
  const me = await requireUser();
  const game = String(formData.get("game"));
  const deckId = String(formData.get("deck_id"));
  const cardId = String(formData.get("card_id"));
  const purchased = Math.max(0, Number(formData.get("purchased") ?? 0));
  if (!isGameId(game)) throw new Error("invalid game");
  backupBeforeWrite(game);
  lib(game).setDeckCardPurchased(me.id, deckId, cardId, purchased);
  bumpDeck(game, deckId);
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
  const card =
    game === "digimon" ? digimon.getCardByCode(code) : ua.getCardByCode(code);
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
