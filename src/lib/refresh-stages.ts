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
    // Both come off the same listing pages — see scraper/cardrush.
    hint: "cardrush 市场价与日文卡名读音（最慢，约 1 小时）",
    scripts: ["scrape-cardrush-prices.ts"],
  },
  {
    id: "restrictions",
    label: "禁限",
    hint: "禁限卡表",
    scripts: ["scrape-restrictions.ts"],
  },
];

export const REFRESH_STAGE_IDS: string[] = REFRESH_STAGES.map((s) => s.id);
