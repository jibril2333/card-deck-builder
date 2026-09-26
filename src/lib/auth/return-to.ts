/**
 * Where to go after signing in, from a `?next=` that anyone can write.
 *
 * Only a path on this site: it starts with one "/" and is not "//host" or
 * "/\host", which browsers read as another origin. Anything else — a full
 * URL, a protocol-relative one, nothing at all — goes to "/". Without this,
 * `/login?next=https://elsewhere` sent a person who had just typed their
 * password on this site to a page of someone else's choosing.
 */
export function safeReturnTo(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
