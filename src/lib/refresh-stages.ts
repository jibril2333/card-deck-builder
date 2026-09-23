/**
 * The refresh pipeline's stages, once.
 *
 * `scripts/refresh-daemon.ts` runs these — it's what actually runs, and
 * `--list` prints this same set. The API and the admin panel used to each keep
 * their own copy of it, and both copies were missing `keywords`: the button
 * could never trigger that stage, and a comment claiming to mirror `--list`
 * had been wrong for as long as the stage had existed.
 *
 * `tests/refresh-stages.test.ts` runs the script and compares, so the next
 * stage someone adds to the shell can't quietly not exist in the UI.
 */

export type RefreshStage = {
  id: string;
  /**
   * The scripts this stage runs, in order, relative to `scripts/`.
   *
   * The shell script has always known this; it was the only one that did. The
   * in-container daemon (scripts/refresh-daemon.ts) needs the same mapping,
   * and two copies of "which scraper is the text stage" is exactly the kind of
   * thing that goes stale — `tests/refresh-stages.test.ts` compares this list
   * against the files that exist in scripts/.
   */
  scripts: string[];
  /**
   * Run this stage's scripts at the same time instead of one after another.
   *
   * Only where that is actually free: the two price scrapes talk to different
   * shops, so running both at once leaves each shop's request rate exactly
   * where it was and halves the wall clock. Scripts that share a source, or
   * that depend on each other's output (the three text scrapes do — see the
   * note on that stage), must stay sequential.
   */
  parallel?: true;
};

/** Declaration order IS run order — the daemon walks this list. */
export const REFRESH_STAGES: RefreshStage[] = [
  {
    id: "cards",
    scripts: ["sync-cards.ts"],
  },
  {
    id: "sets",
    scripts: ["scrape-digimon-sets.ts"],
  },
  {
    id: "text",
    // Order matters: the official EN site repairs what the community mirror
    // got structurally wrong, and JP gets the final word.
    scripts: [
      "scrape-digimon-metadata.ts",
      "scrape-digimon-cn.ts",
      "scrape-digimon-jp.ts",
    ],
  },
  {
    id: "art",
    scripts: ["scrape-digimon-alt-arts.ts"],
  },
  {
    id: "keywords",
    scripts: ["scrape-digimon-keywords.ts"],
  },
  {
    id: "rulings",
    scripts: ["scrape-digimon-rulings.ts"],
  },
  {
    id: "prices",
    // Cardrush first (its pages also carry the kana readings — see
    // scraper/cardrush), then PAO for a second quote on the same cards.
    scripts: ["scrape-cardrush-prices.ts", "scrape-pao-prices.ts"],
    parallel: true,
  },
  {
    id: "restrictions",
    scripts: ["scrape-restrictions.ts"],
  },
];

/**
 * What a stage and a script are CALLED lives in the dictionary
 * (`m.admin.stageLabel` / `m.admin.scriptLabel`), not here: the daemon runs
 * this list with no reader and no language, and the panel that shows the
 * names has both.
 */

export const REFRESH_STAGE_IDS: string[] = REFRESH_STAGES.map((s) => s.id);
