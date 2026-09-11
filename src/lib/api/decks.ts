/**
 * Writing a deck through the API: the version check, the transaction, and
 * the report of what the server did differently.
 *
 * ## Why every write goes through one function
 *
 * Three things have to happen together or not at all — read the deck's
 * current version, compare it with the client's, and apply the change — and
 * "together" means inside one SQLite transaction. Split across two calls, a
 * write landing from the website in the gap is invisible: the version check
 * passes against a state that no longer exists by the time the change is
 * written. better-sqlite3 is synchronous, so a transaction really is a
 * critical section here, as long as nothing inside it awaits.
 *
 * The shared pool is the reason this matters in practice rather than in
 * theory. A held edit rewrites every member deck's row, so two phones on two
 * decks of the same pool are writing the same cards.
 *
 * ## Adjustments
 *
 * The repo clamps silently — a fourth copy of a card limited to one is
 * written as one, and the website's optimistic number snaps back. That is
 * the wrong behaviour for a client that cannot see the page rerender: the
 * app has to be able to say 「限 1 张,已保留 1 张」. So each write reports
 * what it asked for, what it got, and why, and the client shows the reason
 * instead of a number that quietly changed.
 */

import { backupBeforeWrite } from "@/lib/db/connection";
import { getDB } from "@/lib/db/connection";
import { deckRevision } from "@/lib/deck-revision";
import * as digimon from "@/lib/db/digimon";
import { ApiError, forbidden, notFound } from "./errors";
import {
  deckDetail,
  type Adjustment,
  type DeckDetail,
  type LangPair,
} from "./dto";

export type WriteCtx = {
  deckId: string;
  meId: string;
  /** The deck row as it is at the start of the transaction. */
  deck: NonNullable<ReturnType<typeof digimon.getDeck>>;
};

/**
 * Run a deck write under its version check, and answer with the deck.
 *
 * `apply` returns whatever adjustments it had to make; the response is the
 * deck as it stands afterwards, which is what the client replaces its state
 * with. Returning a patch instead would ask every client to re-implement the
 * pool rules to work out what else moved.
 */
export function writeDeck(opts: {
  deckId: string;
  meId: string;
  expectedRevision: string;
  langs: LangPair;
  apply: (ctx: WriteCtx) => Adjustment[];
}): DeckDetail {
  const { deckId, meId, expectedRevision, langs } = opts;
  // Outside the transaction: it copies files, and the daily backup is about
  // the day's first write, not about this one.
  backupBeforeWrite("digimon");

  const run = getDB("digimon").transaction((): DeckDetail => {
    const deck = digimon.getDeck(deckId);
    if (!deck) throw notFound("卡组不存在。");
    // A friend may read this deck. Writing it is 403 whoever asks, and the
    // same 403 covers "no such deck of yours" — see handler.ts.
    if (deck.user_id !== meId) throw forbidden();

    const state = digimon.deckRevisionState(deckId);
    if (!state) throw notFound("卡组不存在。");
    if (deckRevision(state) !== expectedRevision) {
      throw new ApiError(
        "REVISION_CONFLICT",
        "卡组已在其他设备上改动,请刷新后重试。",
      );
    }

    const adjustments = opts.apply({ deckId, meId, deck });
    const after = deckDetail(deckId, meId, langs, adjustments);
    if (!after) throw notFound("卡组不存在。");
    return after;
  });

  return run();
}

/** Pull `expected_revision` out of a body, or say which rule it broke. */
export function expectedRevision(body: Record<string, unknown>): string {
  const raw = body.expected_revision;
  if (raw === undefined || raw === null || raw === "") {
    throw new ApiError(
      "REVISION_REQUIRED",
      "请先读取卡组详情,再带上 expected_revision 提交修改。",
    );
  }
  if (typeof raw !== "string") {
    throw new ApiError("INVALID_INPUT", "expected_revision 必须是字符串。");
  }
  return raw;
}

/**
 * Why a requested quantity was not the quantity written.
 *
 * Asked BEFORE the write, because afterwards the deck already holds the
 * clamped number and the question "how many were you allowed" has a
 * different answer. `null` when nothing was clamped.
 */
export function quantityAdjustment(
  deckId: string,
  cardId: string,
  requested: number,
): Adjustment | null {
  const cap = digimon.explainQuantityCap(deckId, cardId, requested);
  if (cap.reason === null || cap.allowed === requested) return null;
  const message =
    cap.reason === "banned_pair"
      ? (() => {
          const other = cap.conflictsWith
            .map((id) => digimon.getCardById(id)?.name)
            .filter(Boolean)
            .join("、");
          return other
            ? `与 ${other} 不能同时加入,未加入`
            : "与卡组中的其他卡不能同时加入,未加入";
        })()
      : cap.reason === "banned"
        ? "这张卡在禁止卡表上,未加入"
        : `限 ${cap.cap} 张,已保留 ${cap.allowed} 张`;
  return {
    code: cap.reason === "banned_pair" ? "BANNED_PAIR" : "COPY_LIMIT",
    message,
    card_id: cardId,
    requested,
    actual: cap.allowed,
  };
}

/** Why a requested held count was not the held count written. */
export function purchasedAdjustment(
  cardId: string,
  requested: number,
  actual: number,
): Adjustment | null {
  if (requested === actual) return null;
  return {
    code: "HELD_CAPPED",
    // The cap is what the pool needs: holding more copies than any member
    // deck runs is not something this app records.
    message: `最多记录 ${actual} 张`,
    card_id: cardId,
    requested,
    actual,
  };
}
