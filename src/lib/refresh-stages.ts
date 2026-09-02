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
  label: string;
  hint: string;
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
    label: "新卡",
    hint: "发现并导入新卡（含新弹）",
    scripts: ["sync-cards.ts"],
  },
  {
    id: "sets",
    label: "卡包",
    hint: "官方卡包列表与发售顺序（卡组版本用）",
    scripts: ["scrape-digimon-sets.ts"],
  },
  {
    id: "text",
    label: "中/日文",
    hint: "翻译文本 + 中文卡面",
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
    label: "异画",
    hint: "英/日文异画图",
    scripts: ["scrape-digimon-alt-arts.ts"],
  },
  {
    id: "keywords",
    label: "关键词",
    hint: "官方规则里的关键词表",
    scripts: ["scrape-digimon-keywords.ts"],
  },
  {
    id: "rulings",
    label: "裁定",
    hint: "官方 Q&A",
    scripts: ["scrape-digimon-rulings.ts"],
  },
  {
    id: "prices",
    label: "价格与读音",
    // Cardrush first (its pages also carry the kana readings — see
    // scraper/cardrush), then PAO for a second quote on the same cards.
    hint: "cardrush / PAO 市场价与日文卡名读音（最慢，约 1 小时）",
    scripts: ["scrape-cardrush-prices.ts", "scrape-pao-prices.ts"],
    parallel: true,
  },
  {
    id: "restrictions",
    label: "禁限",
    hint: "禁限卡表",
    scripts: ["scrape-restrictions.ts"],
  },
];

/**
 * What each script is doing, for the progress line. A stage can be three
 * scripts long — 中/日文 is the English mirror, then Chinese, then Japanese —
 * and "第 3 / 8 项 · 中/日文" alone cannot say which of the three you are
 * watching, or why the count restarted.
 */
export const SCRIPT_LABELS: Record<string, string> = {
  "sync-cards.ts": "卡表",
  "scrape-digimon-sets.ts": "卡包",
  "scrape-digimon-metadata.ts": "英文卡表",
  "scrape-digimon-cn.ts": "中文",
  "scrape-digimon-jp.ts": "日文",
  "scrape-digimon-alt-arts.ts": "异画",
  "scrape-digimon-keywords.ts": "关键词",
  "scrape-digimon-rulings.ts": "裁定",
  "scrape-cardrush-prices.ts": "Cardrush",
  "scrape-pao-prices.ts": "PAO",
  "scrape-restrictions.ts": "禁限",
};

/** The label for a `script` name as reported by refresh-progress. */
export function scriptLabel(script: string): string | null {
  return SCRIPT_LABELS[script] ?? SCRIPT_LABELS[`${script}.ts`] ?? null;
}

export const REFRESH_STAGE_IDS: string[] = REFRESH_STAGES.map((s) => s.id);
