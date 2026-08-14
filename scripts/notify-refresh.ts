/**
 * Push a refresh result to ntfy.
 *
 *   npx tsx scripts/notify-refresh.ts ok '<summary json>' [cardsBefore] [cardsAfter]
 *   npx tsx scripts/notify-refresh.ts failed '<stage>' [exitCode]
 *
 * Called by refresh-cards.sh at the very end of a run. It NEVER fails the
 * refresh: a scraped, validated, swapped-in database is not worth throwing
 * away because a notification didn't send, so every error path here logs and
 * exits 0.
 *
 * Configuration lives in `.env.ntfy` (host-only, gitignored — the token is a
 * credential and this repo is public):
 *
 *   CDB_NTFY_URL=http://127.0.0.1:8093/dcg
 *   CDB_NTFY_TOKEN=tk_…
 *   CDB_PUBLIC_URL=https://deck.raynefall.dev   # optional, for the tap target
 *
 * Unset URL or token = the feature is off and this is a no-op. Deliberately
 * quiet: a machine that hasn't been given a token shouldn't log an error every
 * Monday at 04:30.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildFailureNotification,
  buildRefreshNotification,
  type Notification,
  type RefreshSummary,
} from "../src/lib/refresh-notify";

const ROOT = process.env.CDB_PROJECT_DIR ?? path.resolve(__dirname, "..");

/** Read .env.ntfy into the environment. Not dotenv: three keys, no quoting
 *  rules worth importing a dependency for. */
function loadEnvFile() {
  const file = path.join(ROOT, ".env.ntfy");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

async function send(note: Notification): Promise<void> {
  const url = process.env.CDB_NTFY_URL;
  const token = process.env.CDB_NTFY_TOKEN;
  if (!url || !token) {
    console.error("[ntfy] not configured (CDB_NTFY_URL / CDB_NTFY_TOKEN) — skipping");
    return;
  }
  // Published as JSON to the server ROOT rather than as headers on the topic
  // URL: the title is Chinese, and HTTP header values are latin-1, so the
  // header form would need percent-encoding that the phone then shows raw.
  const u = new URL(url);
  const topic = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!topic) {
    console.error(`[ntfy] no topic in CDB_NTFY_URL (${url}) — skipping`);
    return;
  }
  u.pathname = "/";
  const res = await fetch(u, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic,
      title: note.title,
      message: note.body,
      priority: note.priority,
      tags: note.tags,
      click: note.click,
    }),
  });
  if (!res.ok) {
    console.error(`[ntfy] ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  console.error(`[ntfy] sent: ${note.title}`);
}

async function main() {
  loadEnvFile();
  const adminUrl = `${process.env.CDB_PUBLIC_URL ?? "https://deck.raynefall.dev"}/digimon/admin`;
  const [kind, arg, a, b] = process.argv.slice(2);

  if (kind === "failed") {
    await send(buildFailureNotification(arg || "refresh", Number(a ?? 1), { adminUrl }));
    return;
  }
  if (kind !== "ok") {
    console.error("usage: notify-refresh.ts ok '<summary json>' [before] [after] | failed <stage> [exit]");
    return;
  }

  let summary: RefreshSummary;
  try {
    summary = JSON.parse(arg || "{}");
  } catch {
    console.error("[ntfy] unreadable summary JSON — skipping");
    return;
  }
  const note = buildRefreshNotification(summary, {
    cardsBefore: a ? Number(a) : undefined,
    cardsAfter: b ? Number(b) : undefined,
    adminUrl,
  });
  if (!note) {
    console.error("[ntfy] nothing changed — not sending");
    return;
  }
  await send(note);
}

// Never let a notification failure surface as a refresh failure.
main().catch((e) => {
  console.error(`[ntfy] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(0);
});
