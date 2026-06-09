/**
 * "What can this card search for in this deck?" — Digimon only.
 *
 * Many Digimon cards tutor: "reveal the top N … add 1 [Trait] card to hand".
 * Some search for TWO different things in one effect — e.g. "Add 1 Digimon
 * card and 1 Tamer card, both with [Xros Heart], to hand" or "Add 1 Option
 * card with [Plug-In] in its name and 1 yellow Tamer card to hand". We break
 * those into separate SEARCH SLOTS so the UI can say "slot ① can grab these,
 * slot ② can grab those" instead of merging them into one confusing list.
 *
 * A slot's criteria come from three dimensions found in the "add … to hand" /
 * "search your deck for …" clause:
 *   - traits / card names: the bracketed `[X]` tokens (a card matches by an
 *     exact trait or, for ≥4-char tokens, a name substring)
 *   - card type: the words Digimon / Tamer / Option / Digi-Egg
 *   - color: red / blue / yellow / green / black / purple / white
 * A deck card is a target for a slot only if it satisfies every dimension the
 * slot constrains. Criteria are anchored to the add/search clause, so timing
 * brackets like [On Play] never leak in as fake targets.
 *
 * Not covered: level / cost-only searches ("a Lv.3 or lower Digimon") — those
 * name no bracketed/type/color target and simply yield no slot.
 */

export type SearchableCard = {
  id: string;
  code: string;
  name: string;
  card_type: string | null;
  color: string | null;
  digi_types: string | null;
  image_url: string | null;
  main_effect: string | null;
  inherited_effect: string | null;
  security_effect: string | null;
};

export type SearchTarget = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
};

/** One search "slot": its human label + the deck cards it can fetch. */
export type SearchGroup = {
  label: string;
  targets: SearchTarget[];
};

// "add … to hand" shows up three ways in the EN text: "to hand",
// "to your hand", and "to the hand". Match all of them everywhere.
const HAND = "to (?:the |your )?hand";
// Cheap pre-gate: does this card plausibly tutor from the deck? Broad on
// purpose — parseSlots() does the real, zone-aware filtering. Covers "reveal
// the top", "reveal N cards from the top of your deck", "search your deck",
// play/place "among them" (Memory Boost / Training style), and "add … to hand".
const TUTOR = new RegExp(
  `(reveal[^.]*?\\b(?:top|deck)\\b|look at the top|search your deck|among (?:them|it)|${HAND})`,
  "i",
);

// Order matters: test Digi-Egg before Digimon ("digi-egg" contains neither
// "digimon" nor a clean word boundary issue, but keep explicit).
const TYPE_WORDS: [RegExp, string][] = [
  [/\bdigi-?egg\b/i, "Digi-Egg"],
  [/\bdigimon\b/i, "Digimon"],
  [/\btamer\b/i, "Tamer"],
  [/\boption\b/i, "Option"],
];

const COLOR_WORDS: [string, string][] = [
  ["red", "Red"],
  ["blue", "Blue"],
  ["yellow", "Yellow"],
  ["green", "Green"],
  ["black", "Black"],
  ["purple", "Purple"],
  ["white", "White"],
];

/** One concrete criteria set — its dimensions are ANDed together. */
type Criteria = {
  /** Original-case bracket tokens (traits/names) for matching + label. */
  tokens: string[];
  types: string[];
  colors: string[];
};

/**
 * One search "slot" = a disjunction of criteria. A card fills the slot if it
 * satisfies ANY alternative. This models wording like "1 [Rika Nonaka] OR 1
 * Option card" (two distinct things, either is fine) — distinct from "[Kyubimon],
 * [Taomon] or [Sakuyamon]" which is one criteria with three alternative traits.
 */
type Slot = { alts: Criteria[] };

function traitsOf(s: string | null): string[] {
  return (s ?? "")
    .split("/")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .flatMap((s) => s.split(/(?<=[.。])\s+(?=[A-Z[＜])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function bracketTokens(s: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = /\[([^\]]+)\]/g;
  while ((m = re.exec(s)) !== null) out.push(m[1].trim());
  return out;
}

// Split a slot fragment on "or" ONLY when a NEW countable criterion begins
// after it (a count/article marker). This separates real alternatives
// ("1 X or 1 Y", "a red … or a yellow …") while keeping within-dimension
// "or"s intact ("[A], [B] or [C]", "with a cost of 2 or more", "blue or
// yellow Tamer").
const OR_SPLIT = /\s+or\s+(?=(?:up to \d+|\d+|one|another|an|a)\b)/i;
function splitAlternatives(part: string): string[] {
  return part
    .split(OR_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build a criteria set from one alternative fragment, or null if it names none. */
function parseCriteria(frag: string, shared: string[]): Criteria | null {
  const tokens = bracketTokens(frag);
  const finalTokens = tokens.length ? tokens : shared;
  const types: string[] = [];
  for (const [re, t] of TYPE_WORDS) if (re.test(frag)) types.push(t);
  const colors: string[] = [];
  for (const [w, c] of COLOR_WORDS)
    if (new RegExp(`\\b${w}\\b`, "i").test(frag)) colors.push(c);
  if (finalTokens.length || types.length || colors.length)
    return { tokens: finalTokens, types, colors };
  return null;
}

/** Pull the distinct search slots described by a card's effect text. */
function parseSlots(text: string): Slot[] {
  const slots: Slot[] = [];
  // The SOURCE zone the effect is currently talking about. A later sentence's
  // "add … among them/it to hand" refers back to whatever the prior sentence
  // revealed/searched. We only want DECK searches — pulling from the security
  // stack or trash is a different mechanic and would list misleading targets.
  let zone: "deck" | "security" | "trash" | null = null;
  for (const sent of splitSentences(text)) {
    // No per-sentence TUTOR gate: a sentence like "Add 1 [X] card to the hand"
    // is the criteria-bearing clause itself, and the add/search spans below
    // are already anchored to the tutor wording. Gating here only dropped
    // valid "to the hand" / split-across-clause cases.

    // Refresh the source zone from this sentence (deck reveal wins over an
    // incidental "trash the rest"). Source phrases only — "trash the rest" /
    // "security card" aren't sources, "from your trash" / "security stack" are.
    const deckRev =
      /(?:reveal|look at|search)[^.]*?\bdeck\b/i.test(sent) ||
      /top \d+ cards of your deck/i.test(sent);
    const secSrc = /security stack/i.test(sent);
    const trashSrc = /from (?:your |the )?(?:trash|recycle bin)|recycle bin/i.test(sent);
    if (deckRev) zone = "deck";
    else if (secSrc) zone = "security";
    else if (trashSrc) zone = "trash";

    // "both with [X] (or [Y])" applies its trait(s) to every slot in the
    // sentence that doesn't carry its own bracket token.
    const shared: string[] = [];
    const bm = sent.match(/both with\s+((?:\[[^\]]+\]\s*(?:or\s+)?)+)/i);
    if (bm) shared.push(...bracketTokens(bm[1]));

    // The criteria-bearing clause comes in three shapes, all anchored to a
    // deck-fetch verb so timing brackets ([On Play] etc.) never leak in:
    //   • "<verb> … among them/it"  — fetch from the just-revealed top cards.
    //     verbs: add / play / place / put (and "digivolve … into"). This is the
    //     Memory Boost / Training pattern "reveal top N, play 1 [X] among them".
    //   • "add … to hand"           — tutor straight to hand.
    //   • "search your deck for …"
    const amongM =
      sent.match(
        new RegExp(`(?:add|play|place|put)\\s+(.*?)\\bamong (?:them|it)`, "i"),
      ) ??
      sent.match(
        new RegExp(`digivolve\\b[^.]*?\\binto\\s+(.*?)\\bamong (?:them|it)`, "i"),
      );
    const handM = sent.match(new RegExp(`add\\s+(.*?)\\b${HAND}`, "i"));
    const searchM = sent.match(
      new RegExp(`search your deck for\\s+(.*?)(?:\\.|,|;|\\band add|${HAND}|$)`, "i"),
    );
    const criteria = amongM?.[1] ?? handM?.[1] ?? searchM?.[1];
    if (!criteria) continue;

    // Resolve this clause's source. "search your deck for" is self-evidently
    // the deck; an "among them/it" add refers back to the tracked zone; an
    // inline security/trash phrase in this very sentence overrides. Skip
    // anything that isn't pulling from the deck.
    const clauseZone: "deck" | "security" | "trash" | null = searchM
      ? "deck"
      : secSrc
        ? "security"
        : trashSrc
          ? "trash"
          : zone ?? "deck";
    if (clauseZone !== "deck") continue;

    for (const part of criteria.split(/,?\s+and\s+/i)) {
      // Each "and"-part is one slot; its "or"-alternatives are the disjuncts.
      const alts: Criteria[] = [];
      for (const frag of splitAlternatives(part)) {
        const c = parseCriteria(frag, shared);
        if (c) alts.push(c);
      }
      if (alts.length) slots.push({ alts });
    }
  }
  return slots;
}

function criteriaLabel(c: Criteria): string {
  const parts: string[] = [];
  if (c.types.length) parts.push(c.types.join("/"));
  if (c.colors.length) parts.push(c.colors.join("/"));
  if (c.tokens.length) parts.push(c.tokens.map((t) => `[${t}]`).join("/"));
  return parts.join(" · ");
}

function slotLabel(slot: Slot): string {
  return slot.alts.map(criteriaLabel).filter(Boolean).join(" 或 ");
}

/**
 * Returns a map of cardId → search slots. Each slot lists the deck cards that
 * slot can fetch. Non-searchers (or searchers whose targets aren't in the
 * deck) are absent.
 */
export function computeDeckSearchTargets(
  cards: SearchableCard[],
): Map<string, SearchGroup[]> {
  const meta = cards.map((c) => ({
    card: c,
    traits: traitsOf(c.digi_types),
    name: (c.name ?? "").toLowerCase(),
    type: c.card_type ?? "",
    color: (c.color ?? "").toLowerCase(),
  }));
  type Meta = (typeof meta)[number];

  // A criteria set ANDs its dimensions; each dimension is satisfied if any of
  // its listed values matches.
  function matchesCriteria(d: Meta, c: Criteria): boolean {
    if (c.tokens.length) {
      const toks = c.tokens.map((t) => t.toLowerCase());
      const ok = toks.some(
        (tk) =>
          d.traits.includes(tk) || (tk.length >= 4 && d.name.includes(tk)),
      );
      if (!ok) return false;
    }
    if (c.types.length) {
      // A "Dual" card counts as both a Digimon and a Tamer.
      const ok = c.types.some(
        (t) =>
          d.type === t ||
          (d.type === "Dual" && (t === "Digimon" || t === "Tamer")),
      );
      if (!ok) return false;
    }
    if (c.colors.length) {
      const ok = c.colors.some((cc) => d.color.includes(cc.toLowerCase()));
      if (!ok) return false;
    }
    return true;
  }

  // A slot is a disjunction: a card fills it if it matches ANY alternative.
  function matches(d: Meta, slot: Slot): boolean {
    return slot.alts.some((c) => matchesCriteria(d, c));
  }

  const out = new Map<string, SearchGroup[]>();

  for (const self of meta) {
    const text = [
      self.card.main_effect,
      self.card.inherited_effect,
      self.card.security_effect,
    ]
      .filter(Boolean)
      .join("\n");
    if (!text || !TUTOR.test(text)) continue;

    const slots = parseSlots(text);
    if (slots.length === 0) continue;

    const groups: SearchGroup[] = [];
    const groupSig = new Set<string>(); // dedupe slots with identical targets
    for (const slot of slots) {
      const targets: SearchTarget[] = [];
      const seenNames = new Set<string>();
      for (const other of meta) {
        if (other.card.id === self.card.id) continue;
        if (other.name === self.name) continue; // skip other printings of self
        if (seenNames.has(other.name)) continue;
        if (!matches(other, slot)) continue;
        seenNames.add(other.name);
        targets.push({
          id: other.card.id,
          code: other.card.code,
          name: other.card.name,
          image_url: other.card.image_url,
        });
      }
      if (targets.length === 0) continue;
      const sig = targets
        .map((t) => t.id)
        .sort()
        .join(",");
      if (groupSig.has(sig)) continue; // same slot twice / overlapping wording
      groupSig.add(sig);
      groups.push({ label: slotLabel(slot), targets });
    }

    if (groups.length > 0) out.set(self.card.id, groups);
  }

  return out;
}
