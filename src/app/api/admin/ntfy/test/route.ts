import { isAdmin } from "@/lib/auth/admin";
import { buildTestNotification, sendNtfy } from "@/lib/refresh-notify";
import { readNtfyConfig } from "../route";

/**
 * Send one test push.
 *
 * Uses the SAVED config, not whatever is in the form — so a green result means
 * the thing the refresh will use actually works, which is the only claim worth
 * making here. The panel makes you save first.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  const origin = new URL(req.url).origin;
  const r = await sendNtfy(
    readNtfyConfig(),
    buildTestNotification(`${origin}/digimon/admin`),
  );
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
