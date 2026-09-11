/**
 * The native API's error vocabulary.
 *
 * One code per situation the client has to handle DIFFERENTLY, which is why
 * there are eleven of them rather than the five HTTP statuses they map onto:
 * an expired session and a wrong password are both 401, but one sends the
 * reader back to the login form and the other keeps them there with their
 * email intact. The client switches on `code`, never on the status.
 *
 * Messages are Chinese product copy — they are shown to a person. Anything
 * that would help an attacker (whether an account exists, which internal call
 * failed, a path) stays out of the body and goes to the server log with the
 * same `request_id` the caller was handed.
 */

export type ApiErrorCode =
  /** Malformed or out-of-range request. The client keeps the input. */
  | "INVALID_INPUT"
  /** Email/password rejected. Deliberately silent on which half. */
  | "INVALID_CREDENTIALS"
  /** No usable Bearer token: absent, unknown, or expired. */
  | "UNAUTHENTICATED"
  /** Authenticated, but this deck is not the caller's to write. */
  | "FORBIDDEN"
  | "NOT_FOUND"
  /** `client_request_id` already belongs to another account's deck. */
  | "ID_CONFLICT"
  /** `expected_revision` no longer describes the deck. */
  | "REVISION_CONFLICT"
  /** The write carried no `expected_revision` — a client protocol error. */
  | "REVISION_REQUIRED"
  | "DECK_LOCKED"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ID_CONFLICT: 409,
  REVISION_CONFLICT: 409,
  REVISION_REQUIRED: 428,
  DECK_LOCKED: 423,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

export function statusFor(code: ApiErrorCode): number {
  return STATUS[code];
}

/**
 * Thrown anywhere below a route handler; `api()` turns it into the response.
 *
 * `headers` carries the few cases where the status alone is not enough —
 * `Retry-After` on a throttled login is the only one so far.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (message = "对象不存在。") =>
  new ApiError("NOT_FOUND", message);
export const unauthenticated = (message = "会话已过期,请重新登录。") =>
  new ApiError("UNAUTHENTICATED", message);
export const forbidden = (message = "只能修改自己的卡组。") =>
  new ApiError("FORBIDDEN", message);
