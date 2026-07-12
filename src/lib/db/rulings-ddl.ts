/**
 * Shared DDL for `card_rulings` — official card Q&A scraped from the JP
 * cardlist (the authoritative source; EN/CN sites don't expose rulings).
 *
 * Reference data in the cards DB, rebuildable any time. Keyed by base card
 * code + the official Q-number so re-scrapes upsert cleanly. Used by both
 * migration #17 and the rulings scraper (IF NOT EXISTS = idempotent from
 * either entry point).
 */
export const CARD_RULINGS_DDL = `
  CREATE TABLE IF NOT EXISTS card_rulings (
    code      TEXT NOT NULL,
    q_number  TEXT NOT NULL,           -- official "Q6309"
    lang      TEXT NOT NULL DEFAULT 'ja',
    date      TEXT,                    -- "2026.05.08"
    question  TEXT NOT NULL,
    answer    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (code, q_number, lang)
  );
  CREATE INDEX IF NOT EXISTS idx_card_rulings_code ON card_rulings(code);
`;

export type CardRuling = {
  code: string;
  q_number: string;
  lang: string;
  date: string | null;
  question: string;
  answer: string;
};

export const UPSERT_RULING_SQL = `
  INSERT INTO card_rulings (code, q_number, lang, date, question, answer, updated_at)
  VALUES (@code, @q_number, @lang, @date, @question, @answer, CURRENT_TIMESTAMP)
  ON CONFLICT(code, q_number, lang) DO UPDATE SET
    date = excluded.date,
    question = excluded.question,
    answer = excluded.answer,
    updated_at = CURRENT_TIMESTAMP
`;
