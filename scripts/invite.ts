/**
 * Generate a one-shot registration invite. Run on the host machine, give the
 * resulting URL to your friend out-of-band (LINE / iMessage / etc).
 *
 *   npx tsx scripts/invite.ts
 *     → 7f3a91c2e4b5
 *     → http://localhost:3000/register?invite=7f3a91c2e4b5
 *
 *   npx tsx scripts/invite.ts --base https://decks.example.com
 *     → same, but with your real deploy URL
 *
 *   npx tsx scripts/invite.ts --list
 *     → show all invites and whether they've been redeemed
 */

import { createInvite, listInvites } from "../src/lib/auth/repo";

function main() {
  const args = process.argv.slice(2);
  const baseUrl =
    args.find((a) => a.startsWith("--base="))?.split("=")[1] ??
    args[args.indexOf("--base") + 1] ??
    "http://localhost:3000";

  if (args.includes("--list")) {
    const all = listInvites();
    if (all.length === 0) {
      console.log("(no invites yet)");
      return;
    }
    console.log(`${all.length} invite(s):\n`);
    for (const i of all) {
      const status = i.used_by ? `redeemed by ${i.used_by}` : "pending";
      console.log(`  ${i.code}  ${status}  created=${i.created_at}`);
    }
    return;
  }

  const invite = createInvite();
  const url = `${baseUrl.replace(/\/$/, "")}/register?invite=${invite.code}`;
  console.log(`Invite code: ${invite.code}`);
  console.log(`Share URL:   ${url}`);
}

try {
  main();
} catch (err) {
  console.error("ERROR:", (err as Error).message);
  process.exit(1);
}
