/**
 * Reading a failed passkey prompt.
 *
 * The errors are built the way the browser and @simplewebauthn/browser build
 * them — the DOMException name on `name`, the library's verdict on `code`,
 * and a `message` in whatever words the platform chose. The Safari message
 * below is the one a cancelled prompt really produced; the old check never
 * recognised it, because it searched the message for the name.
 */

import { describe, expect, it } from "vitest";
import { classifyPasskeyError } from "@/lib/auth/passkey-error";

const SAFARI_NOT_ALLOWED =
  "The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sec-assertion-privacy-considerations-client.";

function err(name: string, message = "", code?: string): Error {
  const e = new Error(message);
  e.name = name;
  if (code) Object.assign(e, { code });
  return e;
}

describe("classifyPasskeyError", () => {
  it("reads NotAllowedError from the name, whatever the message says", () => {
    expect(
      classifyPasskeyError(err("NotAllowedError", SAFARI_NOT_ALLOWED), 4_000, 60_000),
    ).toBe("cancelled");
  });

  it("does not take the name from the message", () => {
    // The shape of the old check, turned into a case: a message mentioning
    // the name, on an error that is something else.
    expect(
      classifyPasskeyError(err("Error", "NotAllowedError: aborted"), 10, 60_000),
    ).toBeNull();
  });

  it("tells a timeout apart only by the clock", () => {
    const e = err("NotAllowedError", SAFARI_NOT_ALLOWED);
    expect(classifyPasskeyError(e, 60_000, 60_000)).toBe("timedOut");
    expect(classifyPasskeyError(e, 59_500, 60_000)).toBe("timedOut");
    expect(classifyPasskeyError(e, 30_000, 60_000)).toBe("cancelled");
    // No timeout in the options: nothing to measure against.
    expect(classifyPasskeyError(e, 90_000, undefined)).toBe("cancelled");
  });

  it("reads an abort as a cancel", () => {
    expect(classifyPasskeyError(err("AbortError"), 10, 60_000)).toBe("cancelled");
  });

  it("recognises a device that already holds this account's passkey", () => {
    expect(
      classifyPasskeyError(
        err("InvalidStateError", "The authenticator was previously registered",
          "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"),
        10,
        60_000,
      ),
    ).toBe("alreadyRegistered");
  });

  it("recognises an address a passkey cannot be used at", () => {
    expect(
      classifyPasskeyError(
        err("SecurityError", "192.168.1.2 is an invalid domain", "ERROR_INVALID_DOMAIN"),
        10,
        60_000,
      ),
    ).toBe("wrongAddress");
    expect(
      classifyPasskeyError(err("SecurityError", "", "ERROR_INVALID_RP_ID"), 10, 60_000),
    ).toBe("wrongAddress");
  });

  it("leaves anything else to be shown as it is", () => {
    expect(classifyPasskeyError(err("UnknownError", "x"), 10, 60_000)).toBeNull();
    expect(classifyPasskeyError("not an error", 10, 60_000)).toBeNull();
  });
});
