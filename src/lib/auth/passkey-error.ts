/**
 * Why a passkey ceremony failed in the browser, as far as the browser says.
 *
 * Read from `name` (the DOMException's, which @simplewebauthn/browser carries
 * over onto its own error) and `code` (the library's classification) — never
 * from `message`, which is free text each platform words as it likes. The
 * check this replaces looked for "NotAllowedError" inside the message; that
 * word only ever appears in `name`, so a cancelled prompt showed Safari's W3C
 * boilerplate instead of 已取消.
 *
 * NotAllowedError is overloaded on purpose by the spec: a cancel, a timeout
 * and "this device has no passkey for this site" all raise it, so that a page
 * cannot probe which credentials a device holds. Only the timeout can be told
 * apart, and only by the clock. The other two read as cancelled — which is
 * also what the person did: the browser showed its own "no passkey" sheet and
 * they dismissed it.
 *
 * Returns null for anything else; the caller shows the message as it is.
 */

export type PasskeyFailure =
  | "cancelled"
  | "timedOut"
  | "alreadyRegistered"
  | "wrongAddress";

/** A prompt that ran to within this much of its timeout is taken as timed out. */
const TIMEOUT_SLACK_MS = 1_000;

export function classifyPasskeyError(
  e: unknown,
  elapsedMs: number,
  timeoutMs: number | undefined,
): PasskeyFailure | null {
  if (!(e instanceof Error)) return null;
  const code = (e as { code?: unknown }).code;

  if (
    code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" ||
    e.name === "InvalidStateError"
  ) {
    return "alreadyRegistered";
  }
  // Reached at an address the passkey is not bound to, or at one that cannot
  // carry a passkey at all (a bare IP).
  if (
    code === "ERROR_INVALID_DOMAIN" ||
    code === "ERROR_INVALID_RP_ID" ||
    e.name === "SecurityError"
  ) {
    return "wrongAddress";
  }
  if (e.name === "AbortError") return "cancelled";
  if (e.name === "NotAllowedError") {
    return timeoutMs != null && elapsedMs >= timeoutMs - TIMEOUT_SLACK_MS
      ? "timedOut"
      : "cancelled";
  }
  return null;
}
