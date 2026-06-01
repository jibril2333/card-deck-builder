/**
 * Fetch the official banlists for both games and upsert into
 * `card_restrictions`. Run after a public ban/limited announcement.
 *
 *   npx tsx scripts/scrape-restrictions.ts                # both games
 *   npx tsx scripts/scrape-restrictions.ts --game=digimon
 *   npx tsx scripts/scrape-restrictions.ts --dry-run
 *
 * Why both games in one script: the data shape is tiny (≤ 100 rows total)
 * and the cadence is "every six months", so wrapping it as one orchestrator
 * is friendlier than two near-identical scripts.
 */

import Database from "better-sqlite3";
import { GAMES, type GameId } from "../src/lib/games";
import {
  parseDigimonRestrictions,
  parseDigimonBannedPairs,
  parseUARestrictions,
  type ParsedRestriction,
  type ParsedPair,
} from "../src/lib/scraper/restrictions";

const SOURCES: Record<
  GameId,
  {
    url: string;
    parse: (html: string) => ParsedRestriction[];
    /** Optional: extract banned-pair rules from the same page. */
    parsePairs?: (html: string) => ParsedPair[];
  }
> = {
  digimon: {
    url: "https://world.digimoncard.com/rule/restriction_card/",
    parse: parseDigimonRestrictions,
    parsePairs: parseDigimonBannedPairs,
  },
  unionarena: {
    url: "https://www.unionarena-tcg.com/jp/rules/limited.php",
    parse: parseUARestrictions,
  },
};

const UA_HEADER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseArgs() {
  const args = process.argv.slice(2);
  function pick(flag: string): string | null {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag && i + 1 < args.length) return args[i + 1];
      if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
    }
    return null;
  }
  const game = pick("--game");
  const dryRun = args.includes("--dry-run");
  if (game && game !== "digimon" && game !== "unionarena") {
    console.error(`bad --game "${game}" (digimon | unionarena)`);
    process.exit(2);
  }
  return { game: game as GameId | null, dryRun };
}

async function fetchPage(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "user-agent": UA_HEADER, "accept-language": "en;q=0.9,ja;q=0.7" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return await r.text();
}

async function runFor(game: GameId, dryRun: boolean) {
  console.log(`\n[${game}]`);
  const { url, parse, parsePairs } = SOURCES[game];
  console.log(`  fetching ${url}`);
  const html = await fetchPage(url);
  const rows = parse(html);
  const pairs = parsePairs ? parsePairs(html) : [];
  console.log(
    `  parsed ${rows.length} restriction(s), ${pairs.length} banned-pair edge(s)`,
  );

  const counts = { banned: 0, limited_1: 0, limited_2: 0 };
  for (const r of rows) counts[r.status]++;
  console.log(
    `  status breakdown: banned=${counts.banned}, limited_1=${counts.limited_1}, limited_2=${counts.limited_2}`,
  );

  if (rows.length === 0 && pairs.length === 0) {
    console.log("  (nothing to write)");
    return;
  }

  if (dryRun) {
    for (const r of rows) {
      console.log(
        `    ${r.status.padEnd(10)} max=${r.max_count} ${r.identity}${r.includes_parallel ? "  (incl. parallel)" : ""}`,
      );
    }
    if (pairs.length > 0) {
      // Group by trigger for readability in the dry-run output.
      const byTrigger = new Map<string, string[]>();
      for (const p of pairs) {
        const arr = byTrigger.get(p.trigger_identity) ?? [];
        arr.push(p.banned_identity);
        byTrigger.set(p.trigger_identity, arr);
      }
      for (const [t, bs] of byTrigger) {
        console.log(`    pair       ${t} ⇒ ${bs.join(", ")}`);
      }
    }
    console.log("  (dry-run, no DB writes)");
    return;
  }

  // Open the cards DB directly and UPSERT.
  const db = new Database(GAMES[game].dbPath);
  try {
    // Replace strategy: wipe this source's rows + reinsert. The list is
    // small (<100 rows) and the official page is the source of truth —
    // if a card is no longer listed, it should drop out of our DB too.
    // Same replace strategy for banned_pairs.
    const tx = db.transaction(() => {
      db.prepare(
        `DELETE FROM card_restrictions WHERE source = ?`,
      ).run(game);
      const ins = db.prepare(
        `INSERT INTO card_restrictions
           (source, identity, status, max_count, includes_parallel, fetched_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      );
      for (const r of rows) {
        ins.run(
          game,
          r.identity,
          r.status,
          r.max_count,
          r.includes_parallel ? 1 : 0,
        );
      }
      // Pairs: only games that have a parser write here. Wipe even when
      // pairs is empty so a card dropping off the page actually clears.
      db.prepare(`DELETE FROM banned_pairs WHERE source = ?`).run(game);
      if (pairs.length > 0) {
        const insP = db.prepare(
          `INSERT INTO banned_pairs
             (source, trigger_identity, banned_identity, fetched_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        );
        for (const p of pairs) {
          insP.run(game, p.trigger_identity, p.banned_identity);
        }
      }
    });
    tx();
    console.log(
      `  ✓ wrote ${rows.length} restriction row(s) + ${pairs.length} pair edge(s).`,
    );
  } finally {
    db.close();
  }
}

async function main() {
  const { game, dryRun } = parseArgs();
  const games: GameId[] = game ? [game] : ["digimon", "unionarena"];
  for (const g of games) {
    try {
      await runFor(g, dryRun);
    } catch (e) {
      console.error(`[${g}] failed: ${(e as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error("ERROR:", (err as Error).message);
  process.exit(1);
});
