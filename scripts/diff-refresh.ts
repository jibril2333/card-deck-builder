/**
 * What a refresh actually changed.
 *
 * Run between validation and the swap, against two files the pipeline is
 * already holding: `before.db` (a second consistent snapshot taken at the same
 * moment as the work copy) and the scraped work copy. Nothing is read from the
 * live database and nothing extends the downtime window — by the time this
 * runs, the container is still serving the old file.
 *
 * Rows land in the work copy's `refresh_changes`, so they travel with the
 * database into production and previous runs' rows are already present.
 *
 *   npx tsx scripts/diff-refresh.ts <before.db> <after.db> [--run-at=ISO]
 *
 * Prints a one-line summary and writes it as JSON to stdout's last line, which
 * refresh-cards.sh folds into refresh-status.json.
 */

import Database from "better-sqlite3";

/**
 * `cards` columns worth reporting. Deliberately not every column: `imported_at`
 * moves on every run, and `image_url` churn is counted rather than listed —
 * an art refresh would otherwise bury a genuine errata under 4000 rows.
 */
const CARD_FIELDS = [
  "name",
  "card_type",
  "level",
  "play_cost",
  "dp",
  "color",
  "color2",
  "rarity",
  "attribute",
  "form",
  "stage",
  "digi_types",
  "main_effect",
  "security_effect",
  "inherited_effect",
  "evolution_cost",
  "evolution_requirements",
  "dual_name",
  "dual_effect",
  "dual_rule",
  "link_requirement",
  "link_effect",
  "special_rule",
] as const;

/** Same idea for the per-language rows. */
const TRANSLATION_FIELDS = [
  "name",
  "card_type",
  "traits",
  "form",
  "attribute",
  "effect_main",
  "effect_2",
  "effect_3",
  "evo_cost",
  "evo_req",
  "special_rule",
] as const;

/** Long effect texts are stored truncated: the point is "this changed", and a
 *  reader who wants the full text has the card page. */
const MAX = 500;
const cut = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
};

type Change = {
  kind: string;
  code: string | null;
  lang: string | null;
  field: string | null;
  before: string | null;
  after: string | null;
};

function main() {
  const [beforePath, afterPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const runAtArg = process.argv.find((a) => a.startsWith("--run-at="))?.split("=")[1];
  if (!beforePath || !afterPath) {
    console.error("usage: diff-refresh.ts <before.db> <after.db> [--run-at=ISO]");
    process.exit(2);
  }
  const runAt = runAtArg ?? new Date().toISOString();

  const db = new Database(afterPath);
  db.exec(`ATTACH DATABASE '${beforePath.replace(/'/g, "''")}' AS old`);

  const changes: Change[] = [];
  const push = (c: Partial<Change> & { kind: string }) =>
    changes.push({ code: null, lang: null, field: null, before: null, after: null, ...c });

  // ── cards ────────────────────────────────────────────────────────────────
  for (const r of db
    .prepare(
      `SELECT n.code, n.name FROM cards n
        WHERE NOT EXISTS (SELECT 1 FROM old.cards o WHERE o.code = n.code)
        ORDER BY n.code`,
    )
    .all() as { code: string; name: string }[]) {
    push({ kind: "card_added", code: r.code, after: r.name });
  }

  // sync-cards never deletes, so this should always be empty — which is exactly
  // why it's worth reporting if it isn't.
  for (const r of db
    .prepare(
      `SELECT o.code, o.name FROM old.cards o
        WHERE NOT EXISTS (SELECT 1 FROM cards n WHERE n.code = o.code)
        ORDER BY o.code`,
    )
    .all() as { code: string; name: string }[]) {
    push({ kind: "card_removed", code: r.code, before: r.name });
  }

  for (const f of CARD_FIELDS) {
    for (const r of db
      .prepare(
        `SELECT n.code, o.${f} AS b, n.${f} AS a
           FROM cards n JOIN old.cards o ON o.code = n.code
          WHERE IFNULL(o.${f}, '') <> IFNULL(n.${f}, '')
          ORDER BY n.code`,
      )
      .all() as { code: string; b: unknown; a: unknown }[]) {
      push({ kind: "field_changed", code: r.code, field: f, before: cut(r.b), after: cut(r.a) });
    }
  }

  // ── translations ─────────────────────────────────────────────────────────
  for (const r of db
    .prepare(
      `SELECT n.code, n.lang, n.name FROM card_translations n
        WHERE NOT EXISTS (SELECT 1 FROM old.card_translations o
                           WHERE o.code = n.code AND o.lang = n.lang)
        ORDER BY n.lang, n.code`,
    )
    .all() as { code: string; lang: string; name: string }[]) {
    push({ kind: "translation_added", code: r.code, lang: r.lang, after: cut(r.name) });
  }

  for (const f of TRANSLATION_FIELDS) {
    for (const r of db
      .prepare(
        `SELECT n.code, n.lang, o.${f} AS b, n.${f} AS a
           FROM card_translations n
           JOIN old.card_translations o ON o.code = n.code AND o.lang = n.lang
          WHERE IFNULL(o.${f}, '') <> IFNULL(n.${f}, '')
          ORDER BY n.lang, n.code`,
      )
      .all() as { code: string; lang: string; b: unknown; a: unknown }[]) {
      push({
        kind: "translation_changed",
        code: r.code,
        lang: r.lang,
        field: f,
        before: cut(r.b),
        after: cut(r.a),
      });
    }
  }

  // ── restrictions ─────────────────────────────────────────────────────────
  // The one people need to hear about: a banlist move can invalidate a deck.
  for (const r of db
    .prepare(
      `SELECT n.identity, n.status FROM card_restrictions n
        WHERE NOT EXISTS (SELECT 1 FROM old.card_restrictions o
                           WHERE o.source = n.source AND o.identity = n.identity)`,
    )
    .all() as { identity: string; status: string }[]) {
    push({ kind: "restriction_added", code: r.identity, after: r.status });
  }
  for (const r of db
    .prepare(
      `SELECT o.identity, o.status FROM old.card_restrictions o
        WHERE NOT EXISTS (SELECT 1 FROM card_restrictions n
                           WHERE n.source = o.source AND n.identity = o.identity)`,
    )
    .all() as { identity: string; status: string }[]) {
    push({ kind: "restriction_removed", code: r.identity, before: r.status });
  }
  for (const r of db
    .prepare(
      `SELECT n.identity, o.status AS b, n.status AS a
         FROM card_restrictions n
         JOIN old.card_restrictions o
           ON o.source = n.source AND o.identity = n.identity
        WHERE o.status <> n.status OR o.max_count <> n.max_count`,
    )
    .all() as { identity: string; b: string; a: string }[]) {
    push({ kind: "restriction_changed", code: r.identity, before: r.b, after: r.a });
  }

  for (const r of db
    .prepare(
      `SELECT n.trigger_identity t, n.banned_identity b FROM banned_pairs n
        WHERE NOT EXISTS (SELECT 1 FROM old.banned_pairs o
                           WHERE o.source = n.source
                             AND o.trigger_identity = n.trigger_identity
                             AND o.banned_identity = n.banned_identity)`,
    )
    .all() as { t: string; b: string }[]) {
    push({ kind: "pair_added", code: r.t, after: r.b });
  }
  for (const r of db
    .prepare(
      `SELECT o.trigger_identity t, o.banned_identity b FROM old.banned_pairs o
        WHERE NOT EXISTS (SELECT 1 FROM banned_pairs n
                           WHERE n.source = o.source
                             AND n.trigger_identity = o.trigger_identity
                             AND n.banned_identity = o.banned_identity)`,
    )
    .all() as { t: string; b: string }[]) {
    push({ kind: "pair_removed", code: r.t, before: r.b });
  }

  // ── artwork: counted, not listed ─────────────────────────────────────────
  const art = db
    .prepare(
      `SELECT n.lang, COUNT(*) AS n FROM card_images n
        WHERE NOT EXISTS (SELECT 1 FROM old.card_images o
                           WHERE o.code = n.code AND o.lang = n.lang
                             AND o.variant = n.variant)
        GROUP BY n.lang`,
    )
    .all() as { lang: string; n: number }[];

  const insert = db.prepare(
    `INSERT INTO refresh_changes (run_at, kind, code, lang, field, before, after)
     VALUES (@run_at, @kind, @code, @lang, @field, @before, @after)`,
  );
  db.transaction(() => {
    for (const c of changes) insert.run({ run_at: runAt, ...c });
  })();

  const count = (k: string) => changes.filter((c) => c.kind === k).length;
  const summary = {
    runAt,
    cardsAdded: count("card_added"),
    cardsRemoved: count("card_removed"),
    fieldsChanged: count("field_changed"),
    translationsAdded: count("translation_added"),
    translationsChanged: count("translation_changed"),
    restrictions:
      count("restriction_added") + count("restriction_removed") + count("restriction_changed"),
    pairs: count("pair_added") + count("pair_removed"),
    artAdded: Object.fromEntries(art.map((a) => [a.lang, a.n])),
    total: changes.length,
  };

  db.exec("DETACH DATABASE old");
  db.close();

  console.error(
    `[diff] ${summary.total} changes — ` +
      `新卡 ${summary.cardsAdded}, 字段 ${summary.fieldsChanged}, ` +
      `译文新增 ${summary.translationsAdded}, 译文改动 ${summary.translationsChanged}, ` +
      `禁限 ${summary.restrictions}, 组合 ${summary.pairs}`,
  );
  // Last line of stdout, so the shell can capture just this.
  console.log(JSON.stringify(summary));
}

main();
