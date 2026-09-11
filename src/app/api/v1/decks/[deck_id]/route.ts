/**
 * `/api/v1/decks/{deck_id}` — read a deck, or change what it is called,
 * what its note says, and whether it is locked.
 *
 * Reading is open to any signed-in account, which is the website's rule:
 * decks are friend-readable. `can_edit` says whether this caller may write,
 * and it is false for someone else's deck AND for your own locked one.
 *
 * Writing goes through `writeDeck`, so it carries the version check and the
 * transaction. The lock is not a UI state: a locked deck refuses name and
 * note edits here with 423, and the only PATCH it accepts is the one that
 * unlocks it.
 */

import { requireCaller } from "@/lib/api/auth";
import { expectedRevision, writeDeck } from "@/lib/api/decks";
import { deckDetail } from "@/lib/api/dto";
import { ApiError, notFound } from "@/lib/api/errors";
import { api, json, readJson } from "@/lib/api/handler";
import { langPair } from "@/lib/api/params";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

export const GET = api<{ deck_id: string }>(async (req, { params }) => {
  const { user } = await requireCaller(req);
  const detail = deckDetail(
    params.deck_id,
    user.id,
    langPair(new URL(req.url)),
  );
  if (!detail) throw notFound("卡组不存在。");
  return json(detail);
});

export const PATCH = api<{ deck_id: string }>(async (req, { params }) => {
  const { user } = await requireCaller(req);
  const body = await readJson(req);
  const revision = expectedRevision(body);

  const name = body.name;
  const notes = body.notes;
  const locked = body.locked;
  if (name === undefined && notes === undefined && locked === undefined) {
    throw new ApiError("INVALID_INPUT", "没有要修改的字段。");
  }
  if (
    name !== undefined &&
    (typeof name !== "string" || !name.trim() || name.length > 100)
  ) {
    throw new ApiError("INVALID_INPUT", "卡组名为 1 到 100 个字符。");
  }
  if (
    notes !== undefined &&
    (typeof notes !== "string" || notes.length > 10_000)
  ) {
    throw new ApiError("INVALID_INPUT", "备注必须是 10000 字以内的字符串。");
  }
  if (locked !== undefined && typeof locked !== "boolean") {
    throw new ApiError("INVALID_INPUT", "locked 必须是布尔值。");
  }

  return json(
    writeDeck({
      deckId: params.deck_id,
      meId: user.id,
      expectedRevision: revision,
      langs: langPair(new URL(req.url)),
      apply: ({ deck, deckId, meId }) => {
        if (deck.locked && (name !== undefined || notes !== undefined)) {
          // Not an ownership problem and not a validation one: the deck is
          // yours and the field is fine, but you closed it.
          throw new ApiError("DECK_LOCKED", "卡组已锁定,解锁后才能修改。");
        }
        if (name !== undefined || notes !== undefined) {
          digimon.updateDeckMeta(meId, deckId, {
            ...(name !== undefined ? { name: (name as string).trim() } : {}),
            ...(notes !== undefined ? { notes: notes as string } : {}),
          });
        }
        if (locked !== undefined) {
          digimon.setDeckLocked(meId, deckId, locked as boolean);
        }
        return [];
      },
    }),
  );
});
