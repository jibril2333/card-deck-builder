/**
 * The shell every form-backed Server Action was repeating.
 *
 * Thirty-two actions opened with the same six lines: `requireUser`, pull each
 * field out of the FormData with `String(...)` / `Number(...)`, check the game
 * id, `backupBeforeWrite`. The repetition was the small problem. The real one
 * was that hand-parsing has no failure case — `Number(formData.get("quantity"))`
 * on a missing or junk field is `NaN`, and `NaN` went to the repo and into
 * SQLite. Declaring the fields means a bad one is caught at the door.
 *
 * An action written with this keeps its whole body for what it actually does:
 *
 *   export const setDeckPinnedAction = formAction(
 *     { deck_id: id, pinned: flag },
 *     async ({ me, game, input }) => {
 *       lib(game).setDeckPinned(me.id, input.deck_id, input.pinned);
 *       bumpDeckList(game);
 *     },
 *   );
 *
 * `game` is not declared per action — every form posts it, and the wrapper
 * validates it before the body runs.
 */
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isGameId, type GameId } from "@/lib/games";
import { backupBeforeWrite } from "@/lib/db/connection";
import type { User } from "@/lib/auth/types";

export { z };

export type ActionCtx<T> = { me: User; game: GameId; input: T };

// ---------- Field kinds ----------
//
// Each mirrors what the hand-written parse did, so converting an action is a
// rewrite of its shell and not of its behaviour. Bundled into one `field`
// object rather than loose exports because action bodies have their own
// `id` / `text` / `count` locals, and shadowed imports read badly.

/** Required id. Absent or empty is a caller bug, and throws. */
const id = z.string().min(1);

/** Optional text: absent → "". What `String(fd.get(x) ?? "")` produced. */
const text = z.string().default("");

/** Optional text, trimmed. */
const trimmed = z.string().trim().default("");

/**
 * Text that distinguishes "field absent" from "field sent empty" — the deck
 * meta form saves one field at a time, and a missing `notes` must leave the
 * stored note alone rather than blank it.
 */
const optionalText = z.string().optional();

/** A count: absent or unparseable → 0, negatives clamped away. */
const count = z.coerce
  .number()
  .catch(0)
  .transform((n) => (Number.isFinite(n) ? Math.max(0, n) : 0));

/** A signed step (±1 buttons): absent or unparseable → 0. */
const step = z.coerce
  .number()
  .catch(0)
  .transform((n) => (Number.isFinite(n) ? n : 0));

/** A number that must be a number — junk throws instead of becoming 0. */
const strictNumber = z.coerce
  .number()
  .refine(Number.isFinite, "not a number");

/** Checkbox-style flag: the string "1" is true, everything else false. */
const flag = z
  .string()
  .default("")
  .transform((v) => v === "1");

/**
 * A field posted zero, one, or many times (`<input name="deck_id">` repeated
 * per checkbox). Empty strings are dropped, matching the old
 * `.getAll(x).map(String).filter(Boolean)`.
 */
const stringList = z.preprocess(
  (v) =>
    (v === undefined ? [] : Array.isArray(v) ? v : [v])
      .map(String)
      .filter((s) => s !== ""),
  z.array(z.string()),
);

export const field = {
  id,
  text,
  trimmed,
  optionalText,
  count,
  step,
  strictNumber,
  flag,
  list: stringList,
} as const;

/**
 * FormData → a plain record, keeping repeated fields as arrays.
 *
 * `Object.fromEntries` would drop all but the last value of a repeated field,
 * which is exactly how the pool pickers post their checkboxes.
 */
export function toRecord(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    const seen = raw[k];
    if (seen === undefined) raw[k] = v;
    else if (Array.isArray(seen)) seen.push(v);
    else raw[k] = [seen, v];
  }
  return raw;
}

/**
 * Wrap a form-backed Server Action.
 *
 * Order is the one the hand-written actions used and callers depend on:
 * session first (an anonymous request must fail as unauthenticated, not as a
 * validation error), then the game id, then the daily backup, then the body.
 *
 * `backup: false` for read-only actions — the backup is a write-path guard.
 */
export function formAction<S extends z.ZodRawShape, R>(
  fields: S,
  run: (ctx: ActionCtx<z.output<z.ZodObject<S>>>) => Promise<R>,
  opts: { backup?: boolean } = {},
): (formData: FormData) => Promise<R> {
  const schema = z.object(fields);
  return async (formData: FormData): Promise<R> => {
    const me = await requireUser();
    const raw = toRecord(formData);
    const game = raw.game;
    if (typeof game !== "string" || !isGameId(game)) {
      throw new Error("invalid game");
    }
    const input = schema.parse(raw);
    if (opts.backup !== false) backupBeforeWrite(game);
    return run({ me, game, input });
  };
}
