/**
 * Reconcile every stored card against the official sites, field by field.
 *
 * Why this exists: after a run of "some cards display X wrongly" reports, each
 * of which turned up more than the one symptom, there was no way to answer
 * "is anything else wrong?" other than by guessing. This answers it with a
 * number, and can be re-run after any refresh.
 *
 * It is READ-ONLY. It never writes to the database.
 *
 * The comparison is three-way, because two-way is not enough to tell a bug
 * from a decision. We deliberately treat the JP site as the authority on which
 * fields a card has (world.digimoncard.com prints a digivolve cost on Tamers
 * that have none), so "EN has it, we don't" is expected whenever JA agrees
 * with us. Findings are therefore classified:
 *
 *   MISSING    both official sites have a value, we have none
 *   JUNK       we have a value, neither official site does
 *   MISMATCH   we and the official site both have one, and they differ
 *   (ignored)  only one site has it and we followed the other — by design
 *
 * Text is compared loosely (punctuation and spacing stripped): the two sites
 * word the same effect differently often enough that exact matching would
 * bury the real findings in noise.
 *
 *   npx tsx scripts/audit-cards.ts             # everything
 *   npx tsx scripts/audit-cards.ts --only=BT25
 *   npx tsx scripts/audit-cards.ts --limit=3   # samples printed per finding
 */

import Database from "better-sqlite3";
import path from "node:path";
import {
  parseAll,
  EN_LABELS,
  JA_LABELS,
  type ScrapedCard,
} from "../src/lib/scraper/digimon";
import {
  FIELD_SOURCE,
  CARD_TYPE_FIELDS,
  canonicalType,
  type FieldKey,
} from "../src/lib/cards/digimon-fields";

const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DELAY_MS = 500;

const arg = (flag: string) =>
  process.argv.slice(2).find((a) => a.startsWith(`${flag}=`))?.split("=")[1];

async function post(host: string, query: string): Promise<string> {
  const r = await fetch(`https://${host}/cards/index.php?search=true`, {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ free: query }).toString(),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`${host} ${query}: HTTP ${r.status}`);
  return await r.text();
}

/** Loose text equality — the two sites phrase the same effect differently. */
const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/[\s　]/g, "")
    .replace(/[.,;:!?、。！？「」『』（）()［］[\]【】〔〕《》≪≫＜＞<>"'"'`~ー\-—–]/g, "")
    .toLowerCase();

const empty = (v: unknown) => v === null || v === undefined || v === "";

type Finding = { kind: string; field: string; code: string; detail: string };

/**
 * Both comparisons come off the SAME table the card page renders from, so the
 * audit cannot drift from the display — and cannot repeat the mistake this
 * script made on its first run, which was comparing the English column against
 * the Japanese source because the mapping was written out by hand a second
 * time.
 */
const FIELDS = Object.entries(FIELD_SOURCE) as [
  FieldKey,
  (typeof FIELD_SOURCE)[FieldKey],
][];

async function main() {
  const only = arg("--only");
  const sampleLimit = parseInt(arg("--limit") ?? "3", 10);
  const db = new Database(DB_PATH, { readonly: true });

  const prefixes = only
    ? [only]
    : (
        db
          .prepare(
            `SELECT DISTINCT substr(code, 1, instr(code, '-') - 1) AS p
             FROM cards WHERE instr(code, '-') > 0 ORDER BY p`,
          )
          .all() as { p: string }[]
      ).map((r) => r.p);

  // Pull both official sites into memory first, so the comparison below is a
  // pure function of three snapshots rather than interleaved with network I/O.
  const en = new Map<string, ScrapedCard>();
  const ja = new Map<string, ScrapedCard>();
  const emptyOn: Record<string, string[]> = { en: [], ja: [] };

  for (const [host, labels, into, tag] of [
    ["world.digimoncard.com", EN_LABELS, en, "en"],
    ["digimoncard.com", JA_LABELS, ja, "ja"],
  ] as const) {
    for (const pfx of prefixes) {
      try {
        for (const c of parseAll(await post(host, `${pfx}-`), labels as never)) {
          if (c.code.startsWith(`${pfx}-`)) into.set(c.code, c);
        }
      } catch (e) {
        console.error(`[audit] ${tag} ${pfx}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    // Some prefixes return nothing in bulk (digimoncard.com does this for the
    // 243 `P-` promos), which is exactly where problems have clustered — so
    // sweep those per code rather than declaring them uncovered.
    const missed = (
      db
        .prepare(
          `SELECT code FROM cards WHERE instr(code,'-') > 0
            ${only ? "AND code LIKE @p" : ""} ORDER BY code`,
        )
        .all(only ? { p: `${only}-%` } : {}) as { code: string }[]
    )
      .map((r) => r.code)
      .filter((c) => !into.has(c));
    if (missed.length > 0) {
      console.error(`[audit] ${tag}: per-code sweep for ${missed.length}…`);
      for (const code of missed) {
        try {
          for (const c of parseAll(await post(host, code), labels as never)) {
            if (c.code === code) into.set(c.code, c);
          }
        } catch {
          /* not on this site */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    emptyOn[tag] = [];
    console.error(`[audit] ${tag}: ${into.size} cards`);
  }

  const rows = db
    .prepare(
      `SELECT c.*,
              t.effect_main AS t_effect_main, t.effect_2 AS t_effect_2,
              t.effect_3 AS t_effect_3, t.evo_cost AS t_evo_cost,
              t.evo_req AS t_evo_req, t.form AS t_form,
              t.attribute AS t_attribute, t.traits AS t_traits,
              t.dual_name AS t_dual_name, t.dual_effect AS t_dual_effect,
              t.dual_rule AS t_dual_rule,
              t.link_requirement AS t_link_requirement,
              t.link_effect AS t_link_effect, t.special_rule AS t_special_rule
         FROM cards c
         LEFT JOIN card_translations t ON t.code = c.code AND t.lang = 'ja'
        ${only ? "WHERE c.code LIKE @p" : ""}`,
    )
    .all(only ? { p: `${only}-%` } : {}) as Record<string, unknown>[];

  const findings: Finding[] = [];
  let covered = 0;
  let uncovered = 0;

  for (const row of rows) {
    const code = row.code as string;
    const e = en.get(code);
    const j = ja.get(code);
    if (!e && !j) {
      uncovered++;
      continue;
    }
    covered++;

    const canon = canonicalType(row.card_type as string);

    for (const [key, src] of FIELDS) {
      const ev = e ? e[key as keyof ScrapedCard] : undefined;
      const jv = j ? j[key as keyof ScrapedCard] : undefined;
      const enHas = e && !empty(ev);
      const jaHas = j && !empty(jv);

      // ---- canonical side: `cards.<base>`, compared against the EN site.
      const ours = row[src.base as string];
      if (empty(ours)) {
        // A finding only when BOTH sites carry it. Following one site over the
        // other is a decision (the JP site is the authority on which fields a
        // card has) and the audit must not re-litigate it.
        if (enHas && jaHas) {
          findings.push({
            kind: "MISSING",
            field: src.base as string,
            code,
            detail: `official has ${JSON.stringify(String(ev).slice(0, 60))}`,
          });
        }
      } else if (!enHas && !jaHas) {
        findings.push({
          kind: "JUNK",
          field: src.base as string,
          code,
          detail: `we have ${JSON.stringify(String(ours).slice(0, 60))}, neither site does`,
        });
      } else if (enHas && norm(ours) !== norm(ev)) {
        findings.push({
          kind: "MISMATCH",
          field: src.base as string,
          code,
          detail: `ours ${JSON.stringify(String(ours).slice(0, 45))} vs EN ${JSON.stringify(String(ev).slice(0, 45))}`,
        });
      }

      // ---- translated side: `card_translations.<translated>`, vs the JP site.
      // Skipped for language-independent fields — there is nothing to compare.
      if (j && src.translated) {
        const oursJa = row[`t_${src.translated}`];
        if (empty(oursJa) && jaHas) {
          findings.push({
            kind: "MISSING",
            field: `ja.${src.translated}`,
            code,
            detail: `JP site has ${JSON.stringify(String(jv).slice(0, 60))}`,
          });
        } else if (!empty(oursJa) && !jaHas) {
          findings.push({
            kind: "JUNK",
            field: `ja.${src.translated}`,
            code,
            detail: `we have ${JSON.stringify(String(oursJa).slice(0, 60))}, JP site doesn't`,
          });
        } else if (!empty(oursJa) && jaHas && norm(oursJa) !== norm(jv)) {
          findings.push({
            kind: "MISMATCH",
            field: `ja.${src.translated}`,
            code,
            detail: `ours ${JSON.stringify(String(oursJa).slice(0, 45))} vs JP ${JSON.stringify(String(jv).slice(0, 45))}`,
          });
        }
      }

      // ---- a value in a field this card type doesn't normally print. Not an
      // error — BT22-007 really costs 20 — but the model says it's unusual, so
      // say so rather than let it pass unseen.
      if (canon && !empty(ours) && !CARD_TYPE_FIELDS[canon].includes(key)) {
        findings.push({
          kind: "OFF-MODEL",
          field: `${canon}.${key}`,
          code,
          detail: `${JSON.stringify(String(ours).slice(0, 40))} — this type usually has no ${key}`,
        });
      }
    }
  }

  // ---- report ---------------------------------------------------------------
  const byKey = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = `${f.kind} ${f.field}`;
    byKey.set(k, [...(byKey.get(k) ?? []), f]);
  }
  console.log(
    `\n=== audit: ${covered} cards checked against the official sites, ` +
      `${uncovered} not carried by either ===\n`,
  );
  if (byKey.size === 0) {
    console.log("no differences.");
  }
  for (const [k, list] of [...byKey.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`${String(list.length).padStart(5)}  ${k}`);
    for (const f of list.slice(0, sampleLimit)) {
      console.log(`         ${f.code}: ${f.detail}`);
    }
  }
  console.log(`\ntotal findings: ${findings.length}`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
