/**
 * Next calls onRequestError for every error it catches on the server — a page
 * render, a route handler, a Server Action. Each one is kept in the data
 * directory so that it outlives the container; see lib/server-errors.ts.
 *
 * Node runtime only: the file is written with `fs`, which the edge runtime
 * does not have. The import is dynamic for the same reason — a static one
 * would pull `fs` into the edge bundle.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { toServerError, recordServerError } = await import(
      "./lib/server-errors"
    );
    const entry = toServerError(
      err as Parameters<typeof toServerError>[0],
      request,
      context,
    );
    if (entry) recordServerError(entry);
  } catch {
    // The error is already on stdout; failing to copy it must not add another.
  }
};
