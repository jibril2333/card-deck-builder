/**
 * The refresh pipeline's stages, once.
 *
 * `scripts/refresh-cards.sh` is the authority — it's what actually runs, and
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
};

/** Order matches `refresh-cards.sh`'s ALL_STAGES, which is also run order. */
export const REFRESH_STAGES: RefreshStage[] = [
  { id: "cards", label: "新卡", hint: "发现并导入新卡（含新弹）" },
  { id: "text", label: "中/日文", hint: "翻译文本 + 中文卡面" },
  { id: "art", label: "异画", hint: "英/日文异画图" },
  { id: "keywords", label: "关键词", hint: "官方规则里的关键词表" },
  { id: "rulings", label: "裁定", hint: "官方 Q&A" },
  { id: "prices", label: "价格", hint: "cardrush 市场价（最慢，约 1 小时）" },
  { id: "restrictions", label: "禁限", hint: "禁限卡表" },
];

export const REFRESH_STAGE_IDS: string[] = REFRESH_STAGES.map((s) => s.id);
