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
 * Configuration comes from `data.nosync/ntfy.json`, written by the admin page
 * (server / topic / token). Environment variables override it, which is how
 * the tests point it at a stand-in server:
 *
 *   CDB_NTFY_URL=https://ntfy.example.com/dcg   # topic may be on the URL
 *   CDB_NTFY_TOKEN=tk_…
 *   CDB_PUBLIC_URL=https://deck.raynefall.dev   # optional, the tap target
 *
 * Nothing configured = the feature is off and this is a no-op. Deliberately
 * quiet: a machine that was never given a token shouldn't log an error every
 * Monday at 04:30.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildFailureNotification,
  buildRefreshNotification,
  sendNtfy,
  type Notification,
  type RefreshSummary,
} from "../src/lib/refresh-notify";
import {
  EMPTY_NTFY,
  ntfyReady,
  parseNtfyConfig,
  type NtfyConfig,
} from "../src/lib/ntfy-config";

const ROOT = process.env.CDB_PROJECT_DIR ?? path.resolve(__dirname, "..");
const DATA_DIR = process.env.CDB_DATA_DIR ?? path.join(ROOT, "data.nosync");

/**
 * The admin page's settings, unless the environment says otherwise.
 *
 * The env override exists for tests and for a one-off `CDB_NTFY_URL=… npx tsx
 * scripts/notify-refresh.ts …` by hand; the file is what the scheduled run
 * actually uses.
 */
function loadConfig(): NtfyConfig {
  if (process.env.CDB_NTFY_URL && process.env.CDB_NTFY_TOKEN) {
    return parseNtfyConfig({
      enabled: true,
      url: process.env.CDB_NTFY_URL,
      topic: process.env.CDB_NTFY_TOPIC ?? "",
      token: process.env.CDB_NTFY_TOKEN,
    });
  }
  try {
    return parseNtfyConfig(
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, "ntfy.json"), "utf8")),
    );
  } catch {
    return EMPTY_NTFY;
  }
}

async function send(note: Notification): Promise<void> {
  const cfg = loadConfig();
  if (!ntfyReady(cfg)) {
    console.error("[ntfy] not configured — skipping (管理页 → 更新通知)");
    return;
  }
  const r = await sendNtfy(cfg, note);
  console.error(r.ok ? `[ntfy] sent: ${note.title}` : `[ntfy] ${r.error}`);
}

async function main() {
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
