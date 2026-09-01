/**
 * Renders Digimon effect text with its tags as chips, coloured the way the
 * printed card colours them.
 *
 *   TIMING   navy   — 【登場時】 [On Play]. When the effect happens.
 *   LIMITER  red    — ［ターンに1回］ [Once Per Turn]. How often.
 *   KEYWORD  orange — ≪ブロッカー≫ ＜Rush＞ 《阻挡者》. A named ability.
 *   SPECIAL  blue-violet — 〔進化〕 [Digivolve] アセンブリ-6:. Another way onto the
 *                     field; a different mechanic from a timing window.
 *   NAME     italic — 「グレイモン」 [Greymon] [X Antibody]. A reference to
 *                     another card or a trait, part of the sentence.
 *
 * WHICH bracket a tag uses does not decide its family — see
 * `@/lib/cards/effect-vocab`. English writes timings and trait references in
 * the same square brackets, and Chinese wraps whole DigiXros requirement lines
 * in 【】, so the families come from closed vocabularies and everything else in
 * a bracket is a name. That also makes the languages agree: EN [Greymon] now
 * renders like JA 「グレイモン」 instead of as a navy timing chip.
 *
 * Line breaks survive via `whitespace-pre-wrap`. Purely presentational and
 * deterministic; one pass covers EN / 中文 / 日本語.
 */

import { classifyTag, BARE_REQUIREMENT_RE } from "@/lib/cards/effect-vocab";

/**
 * One capturing split regex, so `String.split` hands back text and tags
 * interleaved.
 *
 * 《》 allows ONE level of nesting, because the CN text nests it:
 * 《使用条件《特征“光辉黎明”》》. Matching lazily to the first 》 chopped that in
 * half and left a stray bracket loose in the sentence.
 *
 * The last alternative is the bracket-less requirement line — アセンブリ-6: and
 * friends — which is a tag with no bracket to key off, so it's recognized by
 * its shape here rather than by scanning the prose for vocabulary words.
 */
const TOKEN_RE = new RegExp(
  "(" +
    [
      "【[^】]*】",
      "〔[^〕]*〕",
      "\\[[^\\]]+\\]",
      "［[^］]+］",
      "\\{[^}]+\\}",
      "《(?:[^《》]|《[^》]*》)*》",
      "≪[^≫]*≫",
      "＜[^＞]*＞",
      // U+3008/3009, a different character from the ＜＞ above and used by the
      // JP/CN text for the Link condition and for rules notes.
      "〈[^〉]*〉",
      "「[^」]*」",
      "“[^”]*”",
      BARE_REQUIREMENT_RE.source,
    ].join("|") +
    ")",
  "g",
);

/**
 * "Once per turn"-style limiters that the vocabulary can't catch because they
 * carry a number — ［ターンに2回］ — rather than being a fixed phrase.
 */
// The JP text writes this BOTH ways — [ターンに1回] 1357 times and [ターン1回]
// 148 times — so the に has to be optional or those 148 fall through to being
// rendered as a name.
const LIMITER_RE =
  /^(?:ターンに?\s*\d+\s*回|(?:每)?回合\s*\d+\s*次|\d+\s*Per Turn)$/i;

/**
 * A requirement line the CN source wrapped in its own 【】 — captures the
 * marker and the remaining prose separately.
 */
const WRAPPED_REQUIREMENT_RE = new RegExp(
  `^【(${BARE_REQUIREMENT_RE.source})([^】]*)】$`,
);

/** Card-accurate chip colours. Fixed values, not theme tokens: they encode
 *  what's printed on the card, so they must not drift with the site theme. */
const CHIP_STYLE = {
  timing: "bg-[#1f3a93] text-white",
  limiter: "bg-[#d2232a] text-white",
  keyword: "bg-[#e8830c] text-white",
  // Blue-violet, NOT teal. Sampled off the printed cards: the digivolve box
  // reads #0e2459 on BT20-007 and #0d4356 on EX8-031 — a dark blue leaning
  // violet, close to but distinguishable from the timing box's #09243b. Both
  // measurements are near-black, so this is brightened by the same amount the
  // timing navy already is (#09243b → #1f3a93). The earlier teal was a guess
  // that no card actually carries.
  special: "bg-[#3b3a9e] text-white",
} as const;

const CHIP =
  "inline-block px-1.5 rounded align-[0.05em] text-[0.92em] font-medium " +
  "leading-[1.5] whitespace-nowrap";

/** The keyword chip exactly as card text draws it, for the glossary on the
 *  game-knowledge page: a keyword should look the same wherever it is read. */
export const KEYWORD_CHIP = `${CHIP} ${CHIP_STYLE.keyword}`;

const PAIRS: Record<string, string> = {
  "【": "】", "〔": "〕", "[": "]", "［": "］", "{": "}",
  "《": "》", "≪": "≫", "＜": "＞", "〈": "〉", "「": "」", "“": "”",
};

type Kind = keyof typeof CHIP_STYLE | "name";

function kindOf(tok: string): Kind {
  const open = tok[0];
  const close = PAIRS[open];
  // No bracket at all → the bare requirement line, which is always special.
  if (!close || !tok.endsWith(close)) return "special";
  const inner = tok.slice(1, -1);
  // A numbered limiter can't be a fixed vocabulary entry.
  if (LIMITER_RE.test(inner.trim())) return "limiter";
  return classifyTag(open, inner);
}

export function EffectText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(TOKEN_RE);
  return (
    <span className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {parts.map((p, i) => {
        if (!p) return null;
        // split() with one capture group interleaves: even = text, odd = tag.
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        // The CN source wraps a whole requirement LINE in 【】 —
        // 【数码合体-2：“高吼兽”×“弩炮兽”…】 — but the card only boxes the
        // marker; the rest is ordinary text. Chip the marker alone and drop
        // the source's line brackets, which aren't on the card either.
        const wrapped = p.match(WRAPPED_REQUIREMENT_RE);
        if (wrapped) {
          return (
            <span key={i}>
              <span className={`${CHIP} ${CHIP_STYLE.special}`}>
                {wrapped[1]}
              </span>
              {wrapped[2]}
            </span>
          );
        }
        const kind = kindOf(p);
        if (kind === "name") {
          return (
            <b key={i} className="font-semibold italic">
              {p}
            </b>
          );
        }
        return (
          <span key={i} className={`${CHIP} ${CHIP_STYLE[kind]}`}>
            {p}
          </span>
        );
      })}
    </span>
  );
}
