/**
 * `PUT /api/v1/decks/{deck_id}/cards/{card_id}` — one card's numbers.
 *
 * Three commands, exactly one per request:
 *
 *   · `quantity`       — how many copies this deck runs. 0 removes the card.
 *   · `purchased`      — set the held count outright.
 *   · `purchased_delta` — move the held count by one, the ± in purchase mode.
 *
 * They are one endpoint rather than three because they contend for the same
 * row and take the same version, and because "set" and "±1" differ only in
 * how the new number is worked out. Sending two of them in one body is
 * refused rather than ordered: a client that means "three copies, two of
 * them bought" can say so in two requests, and guessing which it wanted
 * applied first is how a deck ends up in a state nobody asked for.
 *
 * ## Held is a shared number
 *
 * In a 共享卡池 the held count belongs to the pool, not to this deck: one
 * physical set of cards, reassembled into whichever deck is being played.
 * So `purchased_delta` moves the POOL's count — `owned_control_value` in the
 * response — and the write is then re-applied to every member deck, each
 * capped at what that deck runs. Deriving the base from this deck's own
 * capped number instead is the classic bug: with a 2-copy deck and a 4-copy
 * deck sharing 3 held, pressing − in the small deck would take the pool to
 * 1 rather than 2.
 */

import { requireCaller } from "@/lib/api/auth";
import {
  expectedRevision,
  purchasedAdjustment,
  quantityAdjustment,
  writeDeck,
} from "@/lib/api/decks";
import type { Adjustment } from "@/lib/api/dto";
import { ApiError, notFound } from "@/lib/api/errors";
import { api, json, readJson } from "@/lib/api/handler";
import { langPair } from "@/lib/api/params";
import * as deckWrite from "@/lib/deck-write";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

function count(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ApiError("INVALID_INPUT", `${name} 必须是不小于 0 的整数。`);
  }
  return value;
}

/**
 * Held counts live on a deck_cards row, so there has to be one.
 *
 * Writing held for a card the deck does not run would either silently do
 * nothing (the UPDATE matches no row) or invent a 0-quantity row that every
 * count then has to special-case.
 */
function requireInDeck(deckId: string, cardId: string): void {
  if (digimon.getDeckCardCounts(deckId, cardId).quantity <= 0) {
    throw notFound("卡组中没有这张卡。");
  }
}

export const PUT = api<{ deck_id: string; card_id: string }>(
  async (req, { params }) => {
    const { user } = await requireCaller(req);
    const { deck_id: deckId, card_id: cardId } = params;
    const body = await readJson(req);
    const revision = expectedRevision(body);

    const commands = (
      ["quantity", "purchased", "purchased_delta"] as const
    ).filter((k) => body[k] !== undefined);
    if (commands.length !== 1) {
      throw new ApiError(
        "INVALID_INPUT",
        "每次只能提交 quantity、purchased 或 purchased_delta 中的一个。",
      );
    }
    const command = commands[0];
    if (
      command === "purchased_delta" &&
      body.purchased_delta !== 1 &&
      body.purchased_delta !== -1
    ) {
      throw new ApiError("INVALID_INPUT", "purchased_delta 只能是 1 或 -1。");
    }
    if (!digimon.getCardById(cardId)) throw notFound("卡牌不存在。");

    return json(
      writeDeck({
        deckId,
        meId: user.id,
        expectedRevision: revision,
        langs: langPair(new URL(req.url)),
        apply: () => {
          const adjustments: Adjustment[] = [];
          if (command === "quantity") {
            const wanted = count(body.quantity, "quantity");
            // Asked before the write: afterwards the deck already holds the
            // clamped number, and the cap would read as satisfied.
            const clamp = quantityAdjustment(deckId, cardId, wanted);
            if (clamp) adjustments.push(clamp);
            deckWrite.setCardQuantity(user.id, deckId, cardId, wanted);
          } else if (command === "purchased") {
            requireInDeck(deckId, cardId);
            const wanted = count(body.purchased, "purchased");
            const r = deckWrite.setCardPurchased(
              user.id,
              deckId,
              cardId,
              wanted,
            );
            const capped = purchasedAdjustment(cardId, wanted, r.owned);
            if (capped) adjustments.push(capped);
          } else {
            requireInDeck(deckId, cardId);
            const delta = body.purchased_delta as 1 | -1;
            const before = deckWrite.currentOwned(user.id, deckId, cardId);
            const r = deckWrite.adjustCardPurchased(
              user.id,
              deckId,
              cardId,
              delta,
            );
            const capped = purchasedAdjustment(
              cardId,
              Math.max(0, before + delta),
              r.owned,
            );
            if (capped) adjustments.push(capped);
          }
          return adjustments;
        },
      }),
    );
  },
);
