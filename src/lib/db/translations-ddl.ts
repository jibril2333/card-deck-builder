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
  image_url: string | null;
};

export const UPSERT_TRANSLATION_SQL = `
  INSERT INTO card_translations
    (code, lang, name, card_type, series, traits, form, attribute,
     effect_main, effect_2, effect_3, image_url, updated_at)
  VALUES
    (@code, @lang, @name, @card_type, @series, @traits, @form, @attribute,
     @effect_main, @effect_2, @effect_3, @image_url, CURRENT_TIMESTAMP)
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
    image_url = excluded.image_url,
    updated_at = CURRENT_TIMESTAMP
`;
