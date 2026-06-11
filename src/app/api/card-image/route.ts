import type { NextRequest } from "next/server";

/**
 * Same-origin proxy for card images, used by the deck-image exporter: canvas
 * `toBlob` fails on a tainted canvas, and the card-image CDNs don't send
 * CORS headers — proxying through our own origin sidesteps that.
 *
 * Strict host whitelist so this can't be used to fetch arbitrary URLs
 * (the app is exposed through a public tunnel).
 */
const ALLOWED_HOSTS = new Set([
  "world.digimoncard.com",
  "en.digimoncard.com",
  "digimoncard.com", // JP card art
  "source.windoent.com", // CN card art (official digimoncard.cn CDN)
  "images.digimoncard.io",
  "www.unionarena-tcg.com",
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new Response("missing url", { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const upstream = await fetch(url, {
    headers: { Accept: "image/*" },
    // Card art is immutable per URL; let Next's data cache hold it too.
    cache: "force-cache",
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
