/**
 * Card art is served through this app, not fetched from the card sites by the
 * reader's browser.
 *
 * Hotlinking was cheaper for the server — the bytes never touched it — but it
 * hands every reader's IP to four sites they never chose to visit, ties the
 * page to whatever those sites decide about referrers and rate limits, and
 * leaves the canvas exporter needing a second, separate path because the CDNs
 * send no CORS headers. One same-origin path fixes all three.
 *
 * Nothing is written to disk: the route streams the upstream response through
 * with a one-year immutable cache header, so the browser and the CDN in front
 * of this app do the remembering. The URL keeps the upstream host and path —
 * `/card-img/world.digimoncard.com/images/cardlist/card/BT1-001.png` — because
 * the extension at the end is what makes an edge cache treat it as an image
 * without any configuration.
 */
export const CARD_IMAGE_HOSTS = new Set([
  "world.digimoncard.com",
  "en.digimoncard.com",
  "digimoncard.com", // JP card art
  "source.windoent.com", // CN card art (official digimoncard.cn CDN)
  "images.digimoncard.io",
  "yugioh-1258002530.file.myqcloud.com", // CN card art (second CDN)
]);

export const CARD_IMAGE_PREFIX = "/card-img";

/**
 * Rewrite an upstream card-art URL to this app's own. Anything else — a
 * relative path, an unknown host, a data: URI — is handed back untouched, so
 * this is safe to wrap around any `src`.
 */
export function cardImageSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.protocol !== "https:" || !CARD_IMAGE_HOSTS.has(u.hostname)) return url;
  return `${CARD_IMAGE_PREFIX}/${u.hostname}${u.pathname}${u.search}`;
}
