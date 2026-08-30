/**
 * Was this error caused by the browser holding assets from an older build?
 *
 * Server Action IDs are hashes that change on every build, and the client
 * bundle carries the ones it was built with. Deploy while someone has the app
 * open and their next click posts an ID this server has never heard of:
 *
 *   Server Action "40387346ee…" was not found on the server
 *
 * Nothing is wrong with the app or the data — the tab is just one deployment
 * behind, and reloading it is the entire fix. Self-hosting has no equivalent
 * of Vercel's skew protection, which keeps the previous build's actions alive
 * for a while, so the recovery has to happen on the client.
 *
 * See https://nextjs.org/docs/messages/failed-to-find-server-action
 */
export function isStaleBuildError(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return (
    /Server Action .* was not found on the server/i.test(m) ||
    /Failed to find Server Action/i.test(m) ||
    /Server Reference ID did not match/i.test(m)
  );
}
