/**
 * "What in this deck can DNA digivolve into this card?" — Digimon only.
 *
 * ジョグレス進化 (联展/合步) is the one digivolution that needs TWO Digimon on
 * the field at once, which makes it the one you can get wrong while building:
 * a deck can hold the ACE that says 黄Lv.6+黒Lv.6 and not one legal pair to
 * make it with. Nothing on the card tells you that — you have to hold the
 * whole 50-card list in your head. So this reads the requirement off the card
 * and answers it against the deck in front of you.
 *
 * ## Why the Japanese text
 *
 * The condition is parsed from `card_translations.evo_req` where `lang='ja'`,
 * not from the English `cards.evolution_requirements`. Measured against the
 * live database: 71 cards carry 〔ジョグレス〕 in Japanese, 59 carry
 * [DNA Digivolve] in English, and the English set is a strict subset — the JP
 * site is simply more complete here (see AGENTS.md on which source owns what).
 * The JP grammar is also regular in a way the English isn't: five shapes,
 * listed in SIDE_SHAPES below, against English's mix of "Blue Lv.4 + green
 * Lv.4: Cost 0" and "0 from blue Lv.4 + green Lv.4".
 *
 * Colour and level — which decide almost every real condition — live on the
 * card row and are language-independent, so a card with no Japanese row still
 * matches those. Only name/trait/text conditions need the JP row, and cards
 * missing one (73 Digimon today, mostly unreleased sets) simply fall back to
 * their English name.
 */

/** Requirement colours, in the JP text's own characters. */
const COLORS: Record<string, string> = {
  赤: "Red",
  青: "Blue",
  黄: "Yellow",
  緑: "Green",
  黒: "Black",
  紫: "Purple",
  白: "White",
};

/** Chinese labels for the popover — the UI chrome is Chinese throughout. */
const COLOR_ZH: Record<string, string> = {
  Red: "红",
  Blue: "蓝",
  Yellow: "黄",
  Green: "绿",
  Black: "黑",
  Purple: "紫",
  White: "白",
};

/**
 * One half of a condition. Every field is a filter that must hold; an absent
 * field constrains nothing. `raw` is kept so an unparsed side can still be
 * shown to the reader instead of silently disappearing.
 */
export type JogressSide = {
  /** Any one of these colours (the JP text writes them 黄/黒). */
  colors: string[];
  level: number | null;
  /** 名称に「X」を含む */
  nameContains: string | null;
  /** 「X」 on its own — a Digimon with exactly that name. */
  exactName: string | null;
  /** 特徴に「X」を持つ — any one of these traits. */
  traits: string[];
  /** 「X」の記述がある — a card whose text mentions X. */
  mentions: string | null;
  raw: string;
  /** False when nothing above could be read out of `raw`. */
  parsed: boolean;
};

export type JogressCondition = {
  sides: [JogressSide, JogressSide];
  /** Memory cost, or null when the text didn't state one. */
  cost: number | null;
  raw: string;
};

/** A card as this module needs to see it. */
export type JogressCard = {
  id: string;
  code: string;
  /** English name — the fallback when there's no Japanese row. */
  name: string;
  card_type: string | null;
  color: string | null;
  color2: string | null;
  level: number | null;
  quantity: number;
  /** Japanese name / traits / effect text, when we have them. */
  jaName?: string | null;
  jaTraits?: string | null;
  jaText?: string | null;
  /** Japanese `evo_req` — the only field a condition is read from. */
  jaEvoReq?: string | null;
};

/**
 * Two deck cards that satisfy a condition.
 *
 * `short` means the pair is the same card twice and the deck holds only one
 * copy — the combination is real (nothing stops two copies of a card meeting
 * on the field), the deck just can't field it yet. Reported rather than
 * hidden: "WarGreymon from two MetalGreymon, you're one copy short" is a
 * deck-building answer; silence looks like the tool missed it.
 */
export type JogressPair = { a: string; b: string; short: boolean };

/** One condition, resolved against a particular deck. */
export type JogressOption = {
  /** Chinese rendering of the condition, e.g. "黄Lv.6 ＋ 黑Lv.6". */
  label: string;
  cost: number | null;
  /** Deck card ids, unordered. */
  pairs: JogressPair[];
  /** True when the text was understood well enough to match against. */
  parsed: boolean;
  raw: string;
};

const BOILERPLATE = /\s*指定のデジモン2体を重ね、アクティブで進化する\s*/g;

/**
 * The five side shapes the live data actually contains. Anything else parses
 * to `parsed: false`, which shows the raw Japanese and claims no matches —
 * a wrong pair is worse than no pair, since the whole point is to be trusted
 * about what the deck can assemble.
 */
function parseSide(raw: string): JogressSide {
  const text = raw.trim();
  const side: JogressSide = {
    colors: [],
    level: null,
    nameContains: null,
    exactName: null,
    traits: [],
    mentions: null,
    raw: text,
    parsed: false,
  };
  let rest = text;

  const name = rest.match(/^名称に「([^」]+)」を含む/);
  if (name) {
    side.nameContains = name[1];
    rest = rest.slice(name[0].length);
  }
  const trait = rest.match(/^特徴に((?:「[^」]+」\/?)+)を持つ/);
  if (trait) {
    side.traits = [...trait[1].matchAll(/「([^」]+)」/g)].map((m) => m[1]);
    rest = rest.slice(trait[0].length);
  }
  const mention = rest.match(/^「([^」]+)」の記述がある/);
  if (mention) {
    side.mentions = mention[1];
    rest = rest.slice(mention[0].length);
  }

  // A bare 「X」 with nothing after it names one specific Digimon.
  const bare = rest.match(/^「([^」]+)」$/);
  if (bare) {
    side.exactName = bare[1];
    side.parsed = true;
    return side;
  }

  const colors = rest.match(/^((?:[赤青黄緑黒紫白]\/?)+)の?(?=Lv\.|$)/);
  if (colors) {
    side.colors = [...colors[1]].filter((ch) => COLORS[ch]).map((ch) => COLORS[ch]);
    rest = rest.slice(colors[0].length);
  }
  const lv = rest.match(/^Lv\.(\d+)$/);
  if (lv) {
    side.level = Number(lv[1]);
    rest = "";
  }

  side.parsed =
    rest === "" &&
    (side.colors.length > 0 ||
      side.level !== null ||
      side.nameContains !== null ||
      side.traits.length > 0 ||
      side.mentions !== null);
  return side;
}

/**
 * Every ジョグレス condition on a card. More than one is an "or" — EX8-064 can
 * be made either from 紫/黒Lv.6+黄/緑Lv.6 or from ピエモン+ヴァンデモン.
 */
export function parseJogress(evoReqJa: string | null | undefined): JogressCondition[] {
  if (!evoReqJa) return [];
  const out: JogressCondition[] = [];
  for (const line of evoReqJa.split(/\n/)) {
    const m = line.match(/〔ジョグレス〕(.*)$/);
    if (!m) continue;
    const clause = m[1].replace(BOILERPLATE, " ").trim();
    // Cost is written either ":コスト0" or "から0" depending on the era.
    const costMatch = clause.match(/(?::コスト(\d+)|から(\d+))/);
    const cost = costMatch ? Number(costMatch[1] ?? costMatch[2]) : null;
    const body = (costMatch ? clause.slice(0, costMatch.index) : clause).trim();
    const parts = body.split("+");
    if (parts.length !== 2) {
      // Keep it visible rather than dropping it: the reader still learns the
      // card has a condition, we just can't check it for them.
      const side = (raw: string): JogressSide => ({ ...parseSide(raw), parsed: false });
      out.push({ sides: [side(body), side("")], cost, raw: clause });
      continue;
    }
    out.push({ sides: [parseSide(parts[0]), parseSide(parts[1])], cost, raw: clause });
  }
  return out;
}

function cardColors(c: JogressCard): string[] {
  return [c.color, c.color2].filter((x): x is string => !!x);
}

/** Does this deck card satisfy one half of a condition? */
export function matchesSide(card: JogressCard, side: JogressSide): boolean {
  if (!side.parsed) return false;
  // Materials are Digimon on the field. A Tamer with the right colour and no
  // level would otherwise sail through a colour-only condition.
  if (card.card_type !== "Digimon") return false;
  if (side.level !== null && card.level !== side.level) return false;
  if (side.colors.length > 0) {
    const mine = cardColors(card);
    if (!side.colors.some((c) => mine.includes(c))) return false;
  }
  const jaName = card.jaName ?? "";
  if (side.exactName !== null && jaName !== side.exactName) return false;
  if (side.nameContains !== null && !jaName.includes(side.nameContains)) {
    // No Japanese row for this card — the English name is all we have, and
    // it can't contain a katakana fragment, so this is a miss either way.
    return false;
  }
  if (side.traits.length > 0) {
    const mine = (card.jaTraits ?? "").split("/").map((t) => t.trim());
    if (!side.traits.some((t) => mine.includes(t))) return false;
  }
  if (side.mentions !== null && !(card.jaText ?? "").includes(side.mentions)) {
    return false;
  }
  return true;
}

/** The condition in Chinese, for the popover header. */
export function describeSide(side: JogressSide): string {
  if (!side.parsed) return side.raw;
  if (side.exactName) return `「${side.exactName}」`;
  const bits: string[] = [];
  if (side.nameContains) bits.push(`名称含「${side.nameContains}」`);
  if (side.traits.length) bits.push(`特征「${side.traits.join("/")}」`);
  if (side.mentions) bits.push(`提及「${side.mentions}」`);
  if (side.colors.length) bits.push(side.colors.map((c) => COLOR_ZH[c] ?? c).join("/"));
  if (side.level !== null) bits.push(`Lv.${side.level}`);
  return bits.join(" ");
}

export function describeCondition(cond: JogressCondition): string {
  const [a, b] = cond.sides;
  if (!a.parsed || !b.parsed) return cond.raw;
  return `${describeSide(a)} ＋ ${describeSide(b)}`;
}

/**
 * Which pairs already in this deck can make each ジョグレス card.
 *
 * A card is never listed as its own material: a second copy of the result
 * could in principle be legal, but it reads as a bug every time and would
 * push the genuine pairs down the list.
 *
 * One card CAN fill both halves — that's two copies of it on the field, and
 * it's how e.g. EX12-017 WarGreymon comes down off two MetalGreymon, which
 * are Red/Black and so satisfy 赤/黄 and 黒/紫 at once. A deck holding a
 * single copy still gets told (see `short`).
 */
export function computeDeckJogress(
  cards: JogressCard[],
): Map<string, JogressOption[]> {
  const out = new Map<string, JogressOption[]>();
  const digimon = cards.filter((c) => c.card_type === "Digimon");

  for (const target of cards) {
    const conditions = parseJogress(target.jaEvoReq);
    if (conditions.length === 0) continue;

    const options: JogressOption[] = conditions.map((cond) => {
      const [sa, sb] = cond.sides;
      const pairs: JogressPair[] = [];
      if (sa.parsed && sb.parsed) {
        const pool = digimon.filter((c) => c.id !== target.id);
        for (let i = 0; i < pool.length; i++) {
          for (let j = i; j < pool.length; j++) {
            const a = pool[i];
            const b = pool[j];
            const ok =
              (matchesSide(a, sa) && matchesSide(b, sb)) ||
              (matchesSide(a, sb) && matchesSide(b, sa));
            // Both halves off one card means two copies of it on the field,
            // which takes two copies in the deck.
            if (ok) pairs.push({ a: a.id, b: b.id, short: i === j && a.quantity < 2 });
          }
        }
        // Pairs the deck can actually field first; the "one copy short" ones
        // are a shopping note, not an answer to "what can I do now".
        pairs.sort((x, y) => Number(x.short) - Number(y.short));
      }
      return {
        label: describeCondition(cond),
        cost: cond.cost,
        pairs,
        parsed: sa.parsed && sb.parsed,
        raw: cond.raw,
      };
    });

    out.set(target.id, options);
  }
  return out;
}
