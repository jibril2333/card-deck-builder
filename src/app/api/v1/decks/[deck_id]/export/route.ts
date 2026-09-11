/**
 * `GET /api/v1/decks/{deck_id}/export` — the decklist as text.
 *
 * Plain text, not JSON: what this produces is the thing a person pastes into
 * a tournament form or a chat, and wrapping it in a JSON string would only
 * make the client unwrap it. `exportDeckText` is the website's own function,
 * so the phone's share sheet and the browser's 导出 hand over the same bytes.
 *
 * Readable by any signed-in account, like the deck itself. Names come from
 * the canonical English rows the export format is written in, not from the
 * reader's language — a decklist is a thing other people have to parse.
 */

import { requireCaller } from "@/lib/api/auth";
import { notFound } from "@/lib/api/errors";
import { api, text } from "@/lib/api/handler";
import { exportDeckText } from "@/lib/deck-formats";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

export const GET = api<{ deck_id: string }>(async (req, { params }) => {
  await requireCaller(req);
  const deck = digimon.getDeck(params.deck_id);
  if (!deck) throw notFound("卡组不存在。");
  return text(
    exportDeckText(
      digimon.getDeckCards(params.deck_id).map((c) => ({
        code: c.code,
        name: c.name,
        card_type: c.card_type,
        quantity: c.quantity,
      })),
    ),
  );
});
