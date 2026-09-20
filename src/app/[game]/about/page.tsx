import { notFound } from "next/navigation";
import { isGameId, colorHex } from "@/lib/games";
import { KEYWORDS } from "@/lib/keywords";
import * as digimon from "@/lib/db/digimon";
import { KEYWORD_CHIP, SPECIAL_CHIP } from "@/components/effect-text";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return (
    <>
      <main className="w-full mx-auto max-w-3xl px-4 py-8 prose prose-sm">
        <DigimonAbout keywords={keywordRows(await getLocale())} />
      </main>
    </>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold mt-7 mb-2 pb-1 border-b border-[var(--color-border)]">
      {children}
    </h2>
  );
}

function P({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm leading-relaxed mb-3 ${className ?? ""}`}>
      {children}
    </p>
  );
}

/**
 * The dictionary's paragraphs, rendered.
 *
 * Rules prose is full of emphasis and line breaks, and splitting each
 * paragraph into a key per bold run would leave the translator holding a bag
 * of fragments. So a paragraph is ONE string carrying `**bold**` and
 * newlines, and this turns it back into markup.
 */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line.split(/\*\*(.+?)\*\*/g).map((part, j) =>
            j % 2 === 1 ? <b key={j}>{part}</b> : part,
          )}
        </span>
      ))}
    </>
  );
}

function ColorList({ colors }: { colors: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 not-prose">
      {colors.map((c) => (
        <span key={c} className="chip">
          <span className="chip-dot" style={{ background: colorHex(c) }} />
          {c}
        </span>
      ))}
    </div>
  );
}

/**
 * One row per keyword: the name in all three card languages, then the Chinese
 * explanation.
 *
 * All three names are shown rather than only the reader's own, because the
 * point of this table is recognising a keyword on a card — and the cards
 * you're holding, the ones on the site and the ones in an English article
 * won't agree on which language that is.
 */

type KeywordRow = {
  official: string;
  ja: string | null;
  zhName: string | null;
  /** How card text writes it, e.g. ＜Blocker＞. */
  display: string;
  /** The write-up, in the reader's language, where one has been written. */
  explain: string | null;
};

/**
 * The rows the table prints: the official keyword list, with our own write-up
 * merged in where there is one.
 *
 * The list comes from the database — it is scraped on every 关键词 refresh —
 * so a keyword introduced by a new set shows up here with its three spellings
 * the day the set ships, and only the explanation waits for a person. Before
 * the first scrape there is nothing to read from, so the hand-written list is
 * the whole table.
 */
function keywordRows(locale: Locale): KeywordRow[] {
  const byName = new Map<string, (typeof KEYWORDS)[number]>();
  for (const k of KEYWORDS) {
    byName.set(k.official, k);
    byName.set(k.ja, k);
    for (const a of k.aka ?? []) byName.set(a, k);
  }
  const rowOf = (k: (typeof KEYWORDS)[number]): KeywordRow => ({
    official: k.official,
    ja: k.ja,
    zhName: k.zhName,
    display: k.display,
    explain: k.explain[locale],
  });

  const official = digimon.listKeywordGlossary();
  if (official.length === 0) return KEYWORDS.map(rowOf);

  // Both dropdowns feed this, and the same keyword reaches it from each: the
  // English list calls it DNA Digivolution, the Japanese one ジョグレス. One
  // row per write-up, keyed by whatever identified it.
  const used = new Set<(typeof KEYWORDS)[number]>();
  const seen = new Set<string>();
  const rows: KeywordRow[] = [];
  for (const { official: name, ja, zh } of official) {
    const k = byName.get(name ?? "") ?? byName.get(ja ?? "");
    const id = k?.official ?? name ?? ja ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (k) used.add(k);
    rows.push({
      official: id,
      ja: k?.ja ?? ja,
      zhName: k?.zhName ?? zh,
      display: k?.display ?? (name ? `＜${name}＞` : `≪${ja}≫`),
      explain: k ? k.explain[locale] : null,
    });
  }

  // Mechanics neither dropdown carries — 数码合体, 应用合体, 进化. They are
  // printed on the cards in their own line, so the table would be lying by
  // omission without them.
  for (const k of KEYWORDS) if (!used.has(k)) rows.push(rowOf(k));
  return rows.sort((a, b) => a.official.localeCompare(b.official));
}

/**
 * How the three languages print this keyword. English carries its own
 * brackets (they encode the numeric form, ＜Security A. +N／−N＞); the other
 * two are stored bare and are wrapped here in the brackets their cards use —
 * ≪…≫ in Japanese, 《…》 in Chinese, or ［…］ for the few keywords that are
 * written that way in every language.
 */
/**
 * Is this one of the requirement lines rather than a keyword effect?
 *
 * The cards draw the two differently — a keyword effect is an orange chip
 * inside the text, a requirement (〔进化〕, 链接, 组装-N) is its own green
 * line above it — and the bracket is what says which: ＜＞ for keywords,
 * 〔〕／［］ or no bracket at all for requirements.
 */
function isRequirement(k: KeywordRow): boolean {
  return !k.display.startsWith("＜");
}

function printedForms(k: KeywordRow): string[] {
  const first = k.display[0];
  // A requirement line (组装-N:…) is printed bare, so its other spellings are
  // too; ［…］ and 〔…〕 keep their own bracket in every language; everything
  // else is a keyword effect, which each language brackets its own way.
  const wrap =
    first === "＜"
      ? (name: string, open: string, close: string) => `${open}${name}${close}`
      : first === "［" || first === "〔"
        ? (name: string) => `${first}${name}${first === "［" ? "］" : "〕"}`
        : (name: string) => name;
  return [
    k.display,
    k.zhName ? wrap(k.zhName, "《", "》") : null,
    k.ja ? wrap(k.ja, "≪", "≫") : null,
  ].filter((x): x is string => Boolean(x));
}

function KeywordList({ items }: { items: KeywordRow[] }) {
  return (
    <dl className="not-prose grid grid-cols-1 gap-y-2.5 text-sm">
      {items.map((k) => (
        <div key={k.official}>
          {/* All three spellings wear the card's own keyword chip: the table's
              job is recognising a keyword on a card, and it reads faster when
              it looks like the thing being recognised. */}
          <dt className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            {printedForms(k).map((form) => (
              <span
                key={form}
                className={isRequirement(k) ? SPECIAL_CHIP : KEYWORD_CHIP}
              >
                {form}
              </span>
            ))}
          </dt>
          {k.explain ? (
            <dd className="text-[var(--color-fg)] leading-relaxed mt-0.5">
              {k.explain}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

async function DigimonAbout({ keywords }: { keywords: KeywordRow[] }) {
  const m = await getMessages();
  return (
    <>
      <h1 className="text-2xl font-bold">Digimon Card Game</h1>
      <P>{m.about.intro}</P>

      <H>{m.about.colors}</H>
      <ColorList
        colors={["Red", "Blue", "Yellow", "Green", "Black", "Purple", "White"]}
      />
      <P className="mt-3">{m.about.colorsText}</P>

      <H>{m.about.cardTypes}</H>
      <P>
        <Rich text={m.about.cardTypesText} />
      </P>

      <H>{m.about.terms}</H>
      <P>
        <Rich text={m.about.termsText} />
      </P>

      <H>{m.about.winning}</H>
      <P>{m.about.winningText}</P>

      <H>{m.about.turn}</H>
      <P>
        <Rich text={m.about.turnText} />
      </P>

      <H>{m.about.breeding}</H>
      <P>
        <Rich text={m.about.breedingText} />
      </P>

      <H>{m.about.zones}</H>
      <P>
        <Rich text={m.about.zonesText} />
      </P>

      <H>{m.about.attackFlow}</H>
      <P>
        <Rich text={m.about.attackFlowText} />
      </P>

      <H>{m.about.blocking}</H>
      <P>
        <Rich text={m.about.blockingText} />
      </P>

      <H>{m.about.securityCheck}</H>
      <P>
        <Rich text={m.about.securityCheckText} />
      </P>

      <H>{m.about.ruleCheck}</H>
      <P>{m.about.ruleCheckText}</P>

      <H>{m.about.battle}</H>
      <P>
        <Rich text={m.about.battleText} />
      </P>

      <H>{m.about.keywords}</H>
      <P className="!mt-0 text-xs">{m.about.keywordsNote(keywords.length)}</P>
      <KeywordList items={keywords} />

      <H>{m.about.deckbuilding}</H>
      <P>
        <Rich text={m.about.deckbuildingText} />
      </P>

      <H>{m.about.resources}</H>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>
          {m.about.officialCardList}
          <a
            href="https://world.digimoncard.com/cardlist/"
            target="_blank"
            rel="noreferrer"
            className="underline ml-1"
          >
            world.digimoncard.com ↗
          </a>
        </li>
        <li>
          {m.about.comprehensiveRules}
          <a
            href="https://world.digimoncard.com/rule/"
            target="_blank"
            rel="noreferrer"
            className="underline ml-1"
          >
            world.digimoncard.com/rule ↗
          </a>
        </li>
        <li>{m.about.imageSource}</li>
      </ul>
    </>
  );
}
