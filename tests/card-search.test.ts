/**
 * What each filter actually puts in the SQL.
 *
 * Before the split this could only be asked by running a search against a
 * seeded database and inferring the rule from which cards came back. These
 * read the plan directly, so a rule that changes shows up as a failing
 * assertion rather than as a missing row somewhere.
 */
import { describe, expect, it } from "vitest";
import { buildSearchQuery } from "@/lib/db/card-search";

/** Collapse whitespace so assertions can be written the way SQL reads. */
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("terms", () => {
  it("ANDs the terms and ORs each one across the columns", () => {
    const p = buildSearchQuery({ q: "agu mon" });
    const sql = flat(p.rowsSql);
    expect(sql).toContain("name LIKE @q0");
    expect(sql).toContain("name LIKE @q1");
    expect(p.params.q0).toBe("%agu%");
    expect(p.params.q1).toBe("%mon%");
    // Full-text mode reaches the effects and the translated rows.
    expect(sql).toContain("main_effect LIKE @q0");
    expect(sql).toContain("card_translations");
  });

  it("q_mode name stays on names and codes", () => {
    const sql = flat(buildSearchQuery({ q: "agu", q_mode: "name" }).rowsSql);
    expect(sql).toContain("name LIKE @q0");
    expect(sql).not.toContain("main_effect LIKE");
    // Translated names still count — the same person typing the same name.
    expect(sql).toContain("t.name LIKE @q0");
  });

  it("looks for a kana term in both scripts", () => {
    const p = buildSearchQuery({ q: "あぐもん", q_mode: "name" });
    expect(p.params.q0).toBe("%あぐもん%");
    expect(p.params.q0k1).toBe("%アグモン%");
    expect(flat(p.rowsSql)).toContain("t.name_kana LIKE @q0k1");
  });

  it("ranks relevance for a name search, and only for one", () => {
    expect(flat(buildSearchQuery({ q: "agumon", q_mode: "name" }).rowsSql))
      .toContain("WHEN name = @q_exact COLLATE NOCASE THEN 0");
    expect(flat(buildSearchQuery({ q: "agumon" }).rowsSql)).not.toContain(
      "@q_exact",
    );
  });

  it("filters nothing when nothing was asked for", () => {
    // The subqueries have WHEREs of their own; what must be absent is a
    // card-level one between `FROM cards` and the ordering.
    expect(flat(buildSearchQuery({}).rowsSql)).toContain("FROM cards ORDER BY");
    expect(flat(buildSearchQuery({}).countSql)).toBe(
      "SELECT COUNT(*) as n FROM cards",
    );
  });
});

describe("multi-select filters", () => {
  it("intersects colors — two colors means dual-color cards", () => {
    const p = buildSearchQuery({ colors: ["Red", "Blue"] });
    const sql = flat(p.rowsSql);
    expect(sql).toContain("(color = @color0 OR color2 = @color0)");
    expect(sql).toContain("(color = @color1 OR color2 = @color1)");
    expect(sql).toContain("@color0) AND");
    expect(p.params.color0).toBe("Red");
  });

  it("unions everything else", () => {
    const p = buildSearchQuery({ card_types: ["Digimon", "Tamer"] });
    expect(flat(p.rowsSql)).toContain("card_type IN (@ct0,@ct1)");
    expect(p.params.ct1).toBe("Tamer");
  });

  it("upper-cases rarity — the scrape sources disagree on case", () => {
    const p = buildSearchQuery({ rarities: ["sec"] });
    expect(flat(p.rowsSql)).toContain("UPPER(rarity) IN (@ra0)");
    expect(p.params.ra0).toBe("SEC");
  });

  it("matches a set inside the joined set_names field", () => {
    const p = buildSearchQuery({ sets: ["BT-01"] });
    expect(flat(p.rowsSql)).toContain("(set_names LIKE @set0)");
    expect(p.params.set0).toBe("%BT-01%");
  });
});

describe("ranges", () => {
  it("emits only the ends that were given", () => {
    const p = buildSearchQuery({ level_min: 3, dp_max: 9000 });
    const sql = flat(p.rowsSql);
    expect(sql).toContain("level >= @level_min");
    expect(sql).not.toContain("level <= ");
    expect(sql).toContain("dp <= @dp_max");
    expect(p.params.level_min).toBe(3);
  });
});

describe("ownership", () => {
  it("needs both the flag and a user", () => {
    expect(flat(buildSearchQuery({ owned: "yes" }).rowsSql)).not.toContain(
      "card_collection",
    );
  });

  it("collapsed rows count any printing", () => {
    const sql = flat(
      buildSearchQuery({ owned: "yes", owned_by: "u1" }).rowsSql,
    );
    expect(sql).toContain("cc.card_id = cards.id");
    expect(sql).not.toContain("NOT EXISTS");
  });

  it("owned=no is the same test, negated", () => {
    expect(
      flat(buildSearchQuery({ owned: "no", owned_by: "u1" }).rowsSql),
    ).toContain("NOT EXISTS");
  });

  it("expanded rows test the exact printing, after the join", () => {
    const sql = flat(
      buildSearchQuery({
        owned: "yes",
        owned_by: "u1",
        show_alt_arts: true,
      }).rowsSql,
    );
    expect(sql).toContain("cc.variant = COALESCE(ci.variant, '')");
    // The card-level WHERE stays free of it, or the CTE would drop printings.
    expect(sql.slice(0, sql.indexOf("SELECT base."))).not.toContain(
      "card_collection",
    );
  });
});

describe("sort", () => {
  it("defaults to newest pack first", () => {
    expect(flat(buildSearchQuery({}).rowsSql)).toContain(
      "release_order FROM card_sets",
    );
  });

  it("reads a code as a number, not as text", () => {
    const sql = flat(buildSearchQuery({ sort_field: "code" }).rowsSql);
    expect(sql).toContain("CAST(ltrim(");
    expect(sql).not.toContain("release_order");
  });

  it("falls back to code order for every other field", () => {
    const sql = flat(
      buildSearchQuery({ sort_field: "level", sort_dir: "desc" }).rowsSql,
    );
    expect(sql).toContain("level DESC NULLS LAST");
    expect(sql).toContain("CAST(ltrim(");
  });

  it("ignores a sort field that is not a column", () => {
    const sql = flat(buildSearchQuery({ sort_field: "; DROP TABLE cards" })
      .rowsSql);
    expect(sql).not.toContain("DROP TABLE");
  });
});

describe("printings", () => {
  it("returns one row per card by default, with a variant count", () => {
    const sql = flat(buildSearchQuery({}).rowsSql);
    expect(sql).toContain("'' AS variant");
    expect(sql).toContain("AS variant_count");
    expect(sql).not.toContain("LEFT JOIN card_images");
  });

  it("show_alt_arts joins the images table instead", () => {
    const sql = flat(buildSearchQuery({ show_alt_arts: true }).rowsSql);
    expect(sql).toContain("WITH base AS");
    expect(sql).toContain("LEFT JOIN card_images ci");
    expect(sql).toContain("COALESCE(ci.image_url, base.image_url)");
  });

  it("counts variants in the requested art language", () => {
    const p = buildSearchQuery({ art_lang: "ja" });
    expect(p.params.art_lang).toBe("ja");
  });
});

describe("paging", () => {
  it("defaults to 60 from the top", () => {
    const p = buildSearchQuery({});
    expect([p.limit, p.offset]).toEqual([60, 0]);
    expect(flat(p.rowsSql)).toContain("LIMIT @limit OFFSET @offset");
  });

  it("counts without the page", () => {
    const p = buildSearchQuery({ limit: 12, offset: 24, colors: ["Red"] });
    expect([p.limit, p.offset]).toEqual([12, 24]);
    expect(p.countSql).not.toContain("LIMIT");
    expect(flat(p.countSql)).toContain("@color0");
  });
});
