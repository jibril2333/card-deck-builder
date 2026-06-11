/**
 * Pull Digimon card metadata from digimoncard.io's public JSON API.
 *
 * Why this exists: the primary scraper (`scrape-digimon-metadata.ts`) uses the
 * official Bandai EN site (world.digimoncard.com), which doesn't carry sets
 * that are only out in JP/CN yet (e.g. EX-12). digimoncard.io's community DB
 * does have them, with full metadata, so this is the fallback source for those
 * sets. The whole existing card seed originally came from digimoncard.io too,
 * so the field mapping matches what's already in the DB.
 *
 * Usage:
 *   npx tsx scripts/scrape-digimon-digimoncardio.ts --set=EX12
 *   npx tsx scripts/scrape-digimon-digimoncardio.ts --set=EX12 --dry-run
 */

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data.nosync", "digimon.db");
// Extensionless path — the `.php` form 301-redirects here.
const API = "https://digimoncard.io/api-public/search";
const IMG_BASE = "https://images.digimoncard.io/images/cards";

type ApiCard = {
  id: string;
  name: string;
  type: string | null;
  level: number | null;
  play_cost: number | null;
  evolution_cost: number | null;
  evolution_color: string | null;
  evolution_level: number | null;
  xros_req: string | null;
  color: string | null;
  color2: string | null;
  digi_type: string | null;
  digi_type2: string | null;
  digi_type3: string | null;
  digi_type4: string | null;
  form: string | null;
  dp: number | null;
  attribute: string | null;
  rarity: string | null;
  stage: string | null;
  artist: string | null;
  main_effect: string | null;
  // digimoncard.io's "second effect block": the INHERITED (digivolution-
  // source) effect on Digimon-ish cards, but the SECURITY effect on
  // Option / Tamer cards. We split it into our two columns by card type.
  source_effect: string | null;
  // The "[Digivolve] … Cost X" line (a.k.a. our evolution_requirements).
  alt_effect: string | null;
  series: string | null;
  pretty_url: string | null;
  set_name: string[] | string | null;
};

function arg(flag: string): string | null {
  for (const a of process.argv.slice(2)) {
    if (a === flag) return "";
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return null;
}

async function main() {
  const set = (arg("--set") || "").toUpperCase().trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!set) {
    console.error("usage: --set=EX12 [--dry-run]");
    process.exit(2);
  }

  console.log(`Fetching ${set} from digimoncard.io …`);
  const res = await fetch(`${API}?n=${encodeURIComponent(set)}`, {
    headers: { "user-agent": "card-deck-builder/0.1 (digimoncardio)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const all = (await res.json()) as ApiCard[];

  // The `n` search can fuzzy-match; keep only this set's base prints.
  const cards = all.filter((c) => c.id?.startsWith(`${set}-`));
  console.log(`  got ${all.length} rows, ${cards.length} are ${set}-* cards`);
  if (cards.length === 0) {
    console.log("  nothing to write.");
    return;
  }

  const rows = cards.map((c) => {
    const type = c.type ?? "";
    // The "second effect block" (API source_effect) is the inherited effect
    // for Digimon-ish cards but the security effect for Option/Tamer cards —
    // route it to the right column so the detail page labels it correctly.
    const secondBlock = c.source_effect ?? "";
    const isOptionOrTamer = type === "Option" || type === "Tamer";
    // "[Digivolve] Lv.X w/[…]: Cost N" lives in alt_effect (xros_req mirrors it).
    const evoLine = (c.alt_effect || c.xros_req || "").trim();
    // Compose the "Yellow 3 from Lv.4"-style cost line when the structured
    // pieces are present (they often aren't for newer JP/CN sets).
    const evoCost = c.evolution_color
      ? `${c.evolution_color} ${c.evolution_cost ?? ""} from Lv.${c.evolution_level ?? ""}`
          .replace(/\s+/g, " ")
          .trim()
      : "";
    return {
      code: c.id,
      name: c.name ?? "",
      rarity: c.rarity ?? "",
      card_type: type,
      level: c.level ?? null,
      color: c.color ?? "",
      color2: c.color2 ?? "",
      play_cost: c.play_cost ?? null,
      dp: c.dp ?? null,
      attribute: c.attribute ?? "",
      form: c.form ?? "",
      stage: c.stage ?? "",
      digi_types: [c.digi_type, c.digi_type2, c.digi_type3, c.digi_type4]
        .filter((t) => t && t.trim())
        .join(" / "),
      evolution_cost: evoCost,
      evolution_requirements: evoLine,
      main_effect: c.main_effect ?? "",
      security_effect: isOptionOrTamer ? secondBlock : "",
      inherited_effect: isOptionOrTamer ? "" : secondBlock,
      source_effect: "", // legacy column — always empty, matches official scraper
      set_names: Array.isArray(c.set_name)
        ? c.set_name.join("; ")
        : (c.set_name ?? ""),
      image_url: `${IMG_BASE}/${c.id}.jpg`,
    };
  });

  if (dryRun) {
    for (const r of rows) {
      console.log(
        `  ${r.code.padEnd(10)} ${r.card_type.padEnd(9)} ${r.color.padEnd(7)} ${r.name}`,
      );
    }
    console.log(`  (dry-run, ${rows.length} cards, no DB writes)`);
    return;
  }

  const db = new Database(DB_PATH);
  try {
    const existing = new Set(
      (db.prepare("SELECT code FROM cards").all() as { code: string }[]).map(
        (r) => r.code,
      ),
    );
    const ins = db.prepare(
      `INSERT INTO cards (
         id, code, name, rarity, card_type, level, color, color2,
         play_cost, dp, attribute, form, stage, digi_types,
         evolution_cost, evolution_requirements,
         main_effect, security_effect, inherited_effect, source_effect,
         set_names, image_url
       ) VALUES (
         @code, @code, @name, @rarity, @card_type, @level, @color, @color2,
         @play_cost, @dp, @attribute, @form, @stage, @digi_types,
         @evolution_cost, @evolution_requirements,
         @main_effect, @security_effect, @inherited_effect, @source_effect,
         @set_names, @image_url
       )
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, rarity = excluded.rarity,
         card_type = excluded.card_type, level = excluded.level,
         color = excluded.color, color2 = excluded.color2,
         play_cost = excluded.play_cost, dp = excluded.dp,
         attribute = excluded.attribute, form = excluded.form,
         stage = excluded.stage, digi_types = excluded.digi_types,
         evolution_cost = excluded.evolution_cost,
         evolution_requirements = excluded.evolution_requirements,
         main_effect = excluded.main_effect,
         security_effect = excluded.security_effect,
         inherited_effect = excluded.inherited_effect,
         source_effect = excluded.source_effect,
         set_names = excluded.set_names, image_url = excluded.image_url`,
    );
    let inserted = 0;
    let updated = 0;
    const tx = db.transaction((list: typeof rows) => {
      for (const r of list) {
        if (existing.has(r.code)) updated++;
        else inserted++;
        ins.run(r);
      }
    });
    tx(rows);
    console.log(`  ✓ wrote ${rows.length} (inserted=${inserted}, updated=${updated})`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("ERROR:", (e as Error).message);
  process.exit(1);
});
