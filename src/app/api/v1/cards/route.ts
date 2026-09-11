/**
 * `GET /api/v1/cards` — the card search, paged.
 *
 * A deliberately small slice of what `DigimonFilters` can express: name or
 * effect text, up to two colours, one canonical type, one level. Those are
 * the filters the phone has room for; the browser keeps the other dozen.
 * Adding one later is additive, so nothing here forecloses it.
 *
 * Colour is an INTERSECTION, matching the website — two colours mean
 * dual-colour cards, not "either colour". A filter that quietly meant
 * something different on each client would be worse than not having it.
 */

import { requireCaller } from "@/lib/api/auth";
import { CardLocalizer } from "@/lib/api/dto";
import { api, json } from "@/lib/api/handler";
import {
  enumParam,
  intParam,
  langPair,
  listParam,
  stringParam,
} from "@/lib/api/params";
import { ApiError } from "@/lib/api/errors";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

const COLORS = [
  "Red",
  "Blue",
  "Yellow",
  "Green",
  "Black",
  "Purple",
  "White",
] as const;

export const GET = api(async (req) => {
  await requireCaller(req);
  const url = new URL(req.url);
  const langs = langPair(url);

  const colors = listParam(url, "color");
  if (colors.length > 2) {
    throw new ApiError("INVALID_INPUT", "最多同时选择两种颜色。");
  }
  for (const c of colors) {
    if (!(COLORS as readonly string[]).includes(c)) {
      throw new ApiError("INVALID_INPUT", `color 不认识 ${c}。`);
    }
  }

  const page = intParam(url, "page", { min: 1, max: 10_000, fallback: 1 })!;
  const pageSize = intParam(url, "page_size", {
    min: 1,
    max: 100,
    fallback: 40,
  })!;
  const level = intParam(url, "level", { min: 2, max: 7 });
  const type = stringParam(url, "type");
  // "effect" on the wire is `all` in the query builder — the website's mode
  // names predate this contract and searching effects also searches names.
  const qMode = enumParam(url, "q_mode", ["name", "effect"] as const, "name");

  const { rows, total } = digimon.searchCards({
    q: stringParam(url, "q"),
    q_mode: qMode === "effect" ? "all" : "name",
    colors: colors.length ? colors : undefined,
    card_types: type ? [type] : undefined,
    level_min: level,
    level_max: level,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const localizer = new CardLocalizer(
    rows.map((r) => r.code),
    langs,
  );
  return json({
    items: rows.map((r) => localizer.summary(r)),
    page,
    page_size: pageSize,
    has_more: page * pageSize < total,
  });
});
