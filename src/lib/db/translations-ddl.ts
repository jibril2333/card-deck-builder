/**
 * Shared DDL for the `card_translations` table — localized card text scraped
 * from the official CN/JP sites, keyed by BASE card code + lang.
 *
 * Used by BOTH migration #16 (app startup) and the scraper scripts (which
 * open the cards db directly, possibly before the app has ever run) — the
 * IF NOT EXISTS makes it idempotent from either entry point.
 *
 * Column superset across both games; a game leaves columns it doesn't have
 * NULL (e.g. UA has no `form`/`attribute`). Display-time lookups
 * COALESCE(translation, base) per field.
 */
export const CARD_TRANSLATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS card_translations (
    code        TEXT NOT NULL,
    lang        TEXT NOT NULL,           -- 'zh' | 'ja'
    name        TEXT,
    card_type   TEXT,                    -- 数码蛋 / 角色 / デジモン …
    series      TEXT,                    -- UA 作品名 (CODE GEASS 反叛的鲁路修)
    traits      TEXT,                    -- digimon 特征(タイプ) / UA 特征
    form        TEXT,                    -- digimon 形态(形態)
    attribute   TEXT,                    -- digimon 属性
    effect_main TEXT,                    -- digimon 主效果 / UA 效果
    effect_2    TEXT,                    -- digimon 安防效果 / UA 触发
    effect_3    TEXT,                    -- digimon 进化源效果
    evo_cost    TEXT,                    -- 進化条件1 — colour/level/cost line
    evo_req     TEXT,                    -- [特殊進化] — DNA / DigiXros / Assembly
    -- Dual cards (デジモン/オプション): the Option half printed on the same
    -- card. Colour and cost are language-independent so they live on cards.
    dual_name   TEXT,
    dual_effect TEXT,                    -- [デュアル効果]
    dual_rule   TEXT,                    -- [デュアルルール]
    image_url   TEXT,                    -- localized card art, if any
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (code, lang)
  );
  CREATE INDEX IF NOT EXISTS idx_card_translations_name
    ON card_translations(name);
`;

export type CardTranslation = {
  code: string;
  lang: "zh" | "ja";
  name: string | null;
  card_type: string | null;
  series: string | null;
  traits: string | null;
  form: string | null;
  attribute: string | null;
  effect_main: string | null;
  effect_2: string | null;
  effect_3: string | null;
  /** Localized digivolve cost line (colour / level / cost). */
  evo_cost: string | null;
  /** Localized special-digivolve block: DNA / DigiXros / Assembly / Link. */
  evo_req: string | null;
  /** Dual cards: the Option half's name / text / rule, in this language. */
  dual_name: string | null;
  dual_effect: string | null;
  dual_rule: string | null;
  image_url: string | null;
};

export const UPSERT_TRANSLATION_SQL = `
  INSERT INTO card_translations
    (code, lang, name, card_type, series, traits, form, attribute,
     effect_main, effect_2, effect_3, evo_cost, evo_req,
     dual_name, dual_effect, dual_rule, image_url, updated_at)
  VALUES
    (@code, @lang, @name, @card_type, @series, @traits, @form, @attribute,
     @effect_main, @effect_2, @effect_3, @evo_cost, @evo_req,
     @dual_name, @dual_effect, @dual_rule, @image_url,
     CURRENT_TIMESTAMP)
  ON CONFLICT(code, lang) DO UPDATE SET
    name = excluded.name,
    card_type = excluded.card_type,
    series = excluded.series,
    traits = excluded.traits,
    form = excluded.form,
    attribute = excluded.attribute,
    effect_main = excluded.effect_main,
    effect_2 = excluded.effect_2,
    effect_3 = excluded.effect_3,
    -- COALESCE: the CN feed has no separate requirement fields, so a CN pass
    -- must not blank out what the JP scrape already captured.
    evo_cost = COALESCE(excluded.evo_cost, evo_cost),
    evo_req  = COALESCE(excluded.evo_req, evo_req),
    -- Same reasoning for the Dual half: whichever source can see it wins, and
    -- a source that can't must leave it alone.
    dual_name   = COALESCE(excluded.dual_name, dual_name),
    dual_effect = COALESCE(excluded.dual_effect, dual_effect),
    dual_rule   = COALESCE(excluded.dual_rule, dual_rule),
    image_url = excluded.image_url,
    updated_at = CURRENT_TIMESTAMP
`;
