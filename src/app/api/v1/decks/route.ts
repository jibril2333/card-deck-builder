/**
 * `/api/v1/decks` — the deck list, and creating one.
 *
 * ## The list
 *
 * Every deck the caller may read, in the server's order: the caller's
 * pinned decks, then the rest of theirs, then everyone else's. Friends'
 * decks are readable here exactly as they are on the website — `owner.is_me`
 * is how the client knows which ones it may offer to edit, and `can_edit` on
 * the detail is the answer the server will actually enforce.
 *
 * ## Creating one, twice
 *
 * The client sends a UUID it generated, and that UUID becomes the deck's id.
 * A phone that loses the response to a create has no way to know whether the
 * deck exists, and the two obvious recoveries are both wrong: retrying blind
 * makes a second deck, and not retrying loses the first. With the id in the
 * request, the retry is the same request — 201 the first time, 200 with the
 * deck that already exists every time after, and no second row.
 *
 * The id must be a UUID, and a UUID that belongs to somebody else's deck is
 * ID_CONFLICT rather than 403: it is not a permission problem, it is a
 * collision, and the remedy is a new id rather than a different account.
 */

import { requireCaller } from "@/lib/api/auth";
import { deckDetail, deckSummaries } from "@/lib/api/dto";
import { ApiError, notFound } from "@/lib/api/errors";
import { api, json, readJson } from "@/lib/api/handler";
import { langPair } from "@/lib/api/params";
import { backupBeforeWrite, getDB } from "@/lib/db/connection";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = api(async (req) => {
  const { user } = await requireCaller(req);
  return json({ items: deckSummaries(user.id) });
});

export const POST = api(async (req) => {
  const { user } = await requireCaller(req);
  const langs = langPair(new URL(req.url));
  const body = await readJson(req);

  const id =
    typeof body.client_request_id === "string" ? body.client_request_id : "";
  if (!UUID_RE.test(id)) {
    throw new ApiError("INVALID_INPUT", "client_request_id 必须是 UUID。");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) {
    throw new ApiError("INVALID_INPUT", "卡组名为 1 到 100 个字符。");
  }
  const notes = typeof body.notes === "string" ? body.notes : "";
  if (notes.length > 10_000) {
    throw new ApiError("INVALID_INPUT", "备注过长。");
  }

  backupBeforeWrite("digimon");
  const created = getDB("digimon").transaction((): boolean => {
    const existing = digimon.getDeck(id);
    if (!existing) {
      digimon.createDeck({ id, user_id: user.id, name, notes });
      return true;
    }
    if (existing.user_id !== user.id) {
      throw new ApiError("ID_CONFLICT", "这个 id 已被占用,请换一个重试。");
    }
    // The retry case. The deck is returned as it stands — a create must not
    // undo edits made between the lost response and this request.
    return false;
  })();

  const detail = deckDetail(id, user.id, langs);
  if (!detail) throw notFound("卡组不存在。");
  return json(detail, { status: created ? 201 : 200 });
});
