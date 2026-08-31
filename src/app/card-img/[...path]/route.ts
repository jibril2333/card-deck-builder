import type { NextRequest } from "next/server";
import { CARD_IMAGE_HOSTS } from "@/lib/card-image";

/**
 * Streams one card image from the site that owns it. See lib/card-image for
 * why the app serves these at all.
 *
 * The host is the first path segment and has to be on the list: this app is
 * exposed through a public tunnel, and a proxy that fetches any URL it is
 * handed is an open relay wearing a different hat.
 */
export const dynamic = "force-static";
export const revalidate = 31536000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const [host, ...rest] = path ?? [];
  if (!host || !CARD_IMAGE_HOSTS.has(host) || rest.length === 0) {
    return new Response("host not allowed", { status: 403 });
  }

  const upstream = `https://${host}/${rest.map(encodeURIComponent).join("/")}`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Accept: "image/*" },
      // Card art never changes at a given URL.
      cache: "force-cache",
    });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }
  if (!res.ok || !res.body) {
    return new Response("upstream error", { status: 502 });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      // A year, immutable: the browser and the edge keep it, this app keeps
      // nothing. That is the whole storage story.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
