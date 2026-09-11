/**
 * `GET /api/v1/cards/{card_id}` — one card, everything the page shows.
 *
 * `fields` is the whole point of the shape. The client cannot be given a
 * fixed list of properties to render: card types do not share a field set
 * (a Tamer prints no level, a Dual card's cost cell reads "D"), and a field
 * a type does not normally carry can still hold a real value — BT22-007 is a
 * Digi-Egg that really costs 20. So the server runs `visibleFields`, which
 * orders by what the printed card prints and then appends the surprises, and
 * the client renders the list it is given, in order.
 *
 * The id is the internal `cards.id`, not the code: a code can be typed by a
 * person and this cannot, which is exactly why deck rows refer to it.
 */

import { requireCaller } from "@/lib/api/auth";
import { cardDetail } from "@/lib/api/dto";
import { notFound } from "@/lib/api/errors";
import { api, json } from "@/lib/api/handler";
import { langPair } from "@/lib/api/params";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

export const GET = api<{ card_id: string }>(async (req, { params }) => {
  await requireCaller(req);
  const card = digimon.getCardById(params.card_id);
  if (!card) throw notFound("卡牌不存在。");
  return json(cardDetail(card, langPair(new URL(req.url))));
});
