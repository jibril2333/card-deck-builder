/**
 * The shell every `/api/v1` route handler runs inside.
 *
 * It exists for three reasons, and each of them is a bug that would otherwise
 * be written once per route:
 *
 *  1. **One error shape.** A client that has to tell a 500 from a Cloudflare
 *     challenge page needs every failure this app produces to be the same
 *     JSON object. `api()` is the only place that writes one.
 *  2. **Repo errors are not HTTP errors.** `OwnershipError` and
 *     `DeckLockedError` are thrown from deep inside the repo, three call
 *     layers below the route; mapping them at the boundary is what keeps the
 *     routes free of try/catch.
 *  3. **A request id that appears in both halves.** The caller gets it in the
 *     body, the server log gets it beside the real exception. That is the
 *     whole debugging story for an app the author cannot attach a debugger
 *     to — the reader can quote the id off the screen.
 *
 * Nothing here is cached: `no-store` on every response, because every one of
 * them is either private to an account or an edit that just landed.
 */

import crypto from "node:crypto";
import { DeckLockedError, OwnershipError } from "@/lib/db/deck-shared";
import { ApiError, statusFor, type ApiErrorCode } from "./errors";

const NO_STORE = { "cache-control": "no-store" } as const;

export function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE, ...(init.headers ?? {}) },
  });
}

export function text(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...NO_STORE,
      ...(init.headers ?? {}),
    },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { ...NO_STORE } });
}

function errorBody(
  code: ApiErrorCode,
  message: string,
  requestId: string,
): Response {
  return json(
    { error: { code, message, request_id: requestId } },
    { status: statusFor(code) },
  );
}

/** What a route handler receives on top of the request. */
export type ApiCtx<P> = {
  params: P;
  requestId: string;
};

/**
 * Wrap a route handler.
 *
 * `P` is the dynamic-segment shape; Next hands it over as a promise, and the
 * wrapper awaits it so handlers see a plain object.
 */
export function api<P = Record<string, never>>(
  handler: (req: Request, ctx: ApiCtx<P>) => Promise<Response>,
) {
  return async function route(
    req: Request,
    next: { params: Promise<P> },
  ): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const params = next?.params ? await next.params : ({} as P);
      const res = await handler(req, { params, requestId });
      return res;
    } catch (err) {
      if (err instanceof ApiError) {
        const res = errorBody(err.code, err.message, requestId);
        for (const [k, v] of Object.entries(err.headers)) res.headers.set(k, v);
        return res;
      }
      if (err instanceof DeckLockedError) {
        return errorBody(
          "DECK_LOCKED",
          "卡组已锁定,解锁后才能修改。",
          requestId,
        );
      }
      if (err instanceof OwnershipError) {
        // "Not yours" and "does not exist" arrive as the same repo error, and
        // they stay merged here: telling an unauthorized caller which of the
        // two it was is how a deck id becomes an oracle.
        return errorBody("FORBIDDEN", "只能修改自己的卡组。", requestId);
      }
      console.error(`[api] ${requestId}`, err);
      return errorBody("SERVER_ERROR", "服务器出错,请稍后重试。", requestId);
    }
  };
}

/**
 * Parse a JSON request body, or fail as INVALID_INPUT.
 *
 * A body that is not an object at all (a bare array, `null`, junk) is caught
 * here so every caller below can assume a record.
 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("INVALID_INPUT", "请求体不是有效的 JSON。");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError("INVALID_INPUT", "请求体必须是 JSON 对象。");
  }
  return raw as Record<string, unknown>;
}
