/**
 * What each card field is called, in Chinese.
 *
 * The website prints these inline in its layout — 形态 sits in a stat pair,
 * 进化消费 above a cost run, 链接条件 inside the Link panel — because the page
 * arranges the fields as the printed card arranges them. A client that cannot
 * see that layout still has to name them, so the same words live here as
 * data, and `/api/v1/cards/{id}` sends a label with every field.
 *
 * The wording is copied from the card page verbatim, deliberately: two
 * surfaces calling the same field two things is worse than the duplication.
 * `tests/api-card-fields.test.ts` fails if a FieldKey is ever added without
 * a label here.
 */

import type { FieldKey } from "./digimon-fields";

export const FIELD_LABELS: Record<FieldKey, string> = {
  level: "Lv",
  play_cost: "Play Cost",
  dp: "DP",
  form: "形态",
  attribute: "属性",
  digi_types: "特征",
  evolution_cost: "进化消费",
  evolution_requirements: "进化条件",
  main_effect: "主要效果",
  security_effect: "安全区效果",
  inherited_effect: "进化继承效果",
  source_effect: "源池效果",
  special_rule: "特别规则",
  dual_name: "选项面名称",
  dual_color: "选项面颜色",
  dual_cost: "使用费用",
  dual_effect: "选项效果",
  dual_rule: "双力规则",
  link_dp: "链接 DP",
  link_requirement: "链接条件",
  link_effect: "链接中效果",
};
