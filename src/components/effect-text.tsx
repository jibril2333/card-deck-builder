/**
 * Renders Digimon effect text with its tokens as chips, the way community card
 * viewers (digicamoe et al.) present them. Three families, three treatments:
 *
 *   TIMING / CONDITION — 【登场时】 [On Play] 〔进化〕 [When Digivolving], and the
 *     EN trait tags that share the bracket ([Angel], [Lucemon]). These are the
 *     skeleton of the text: when the effect fires. Dark filled chip.
 *
 *   KEYWORD ABILITY — 《阻挡者》 ≪天昇≫ ＜Rush＞ ＜Recovery +1＞. Named,
 *     rules-defined abilities. Amber filled chip so they pop out of a
 *     paragraph the way they do on the printed card.
 *
 *   QUOTED NAME — 「スカモン」 “亚古兽”. References to another card or trait by
 *     name; emphasised rather than chipped, since they're part of the sentence
 *     and are often long.
 *
 * A few keywords are printed WITHOUT brackets — "アセンブリ-6:「ネガーモン」4枚",
 * "デジクロス-2", "数码合体-2" — so there is nothing structural to key off.
 * Pass `keywords` (the official vocabulary, scraped into `card_keywords`) and
 * those get the keyword chip too, trailing "-N" included.
 *
 * Everything else is plain text, and the source's line breaks survive via
 * `whitespace-pre-wrap` so multi-clause effects keep their structure.
 *
 * Purely presentational and deterministic. All three languages use the same
 * bracket families, so one pass covers EN / 中文 / 日本語.
 */

// A single capturing split regex, so `String.split` hands back text and tokens
// interleaved. The families don't nest in this data, so order doesn't matter.
const TOKEN_RE =
  /(【[^】]*】|〔[^〕]*〕|\[[^\]]+\]|\{[^}]+\}|《[^》]*》|≪[^≫]*≫|＜[^＞]*＞|「[^」]*」|“[^”]*”)/g;

type Kind = "timing" | "keyword" | "name" | "text";

function kindOf(tok: string): Kind {
  switch (tok[0]) {
    case "【":
    case "〔":
    case "[":
    // 126 cards spell the play-location tag with braces — {Hand}[Counter] —
    // instead of brackets. Same kind of token, so treat it the same.
    case "{":
      return "timing";
    case "《":
    case "≪":
    case "＜":
      return "keyword";
    case "「":
    case "“": // opening curly double quote, used by the CN text
      return "name";
    default:
      return "text";
  }
}

const CHIP =
  "inline-block px-1.5 rounded align-[0.05em] text-[0.92em] font-medium " +
  "leading-[1.5] whitespace-nowrap";

/**
 * Build a matcher for bare keywords. Longest-first so "セキュリティアタック+1"
 * wins over "セキュリティアタック", and an optional "-N"/"+N" tail is absorbed so
 * "アセンブリ-6" chips as one unit rather than leaving the number outside.
 */
function bareKeywordRe(keywords: string[]): RegExp | null {
  const usable = keywords
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .sort((a, b) => b.length - a.length);
  if (usable.length === 0) return null;
  const esc = usable.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // The alternation MUST be wrapped: `(a|b(?:tail)?)` would attach the tail to
  // the last alternative only, so with the real 106-keyword list "アセンブリ-6"
  // chipped as "アセンブリ" and left "-6" outside.
  return new RegExp(`((?:${esc.join("|")})(?:[-+－＋]\\d+)?)`, "g");
}

export function EffectText({
  text,
  className = "",
  keywords,
}: {
  text: string;
  className?: string;
  /** Official keyword vocabulary, for the ones printed without brackets. */
  keywords?: string[];
}) {
  const bareRe = keywords?.length ? bareKeywordRe(keywords) : null;
  const parts = text.split(TOKEN_RE);
  return (
    <span className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {parts.map((p, i) => {
        if (!p) return null;
        switch (kindOf(p)) {
          case "timing":
            return (
              <span
                key={i}
                // Deliberately NOT the accent colour: timings are by far the
                // most common token, and a paragraph of amber would drown the
                // keywords that actually need to stand out.
                className={`${CHIP} bg-[var(--color-fg)]/85 text-[var(--color-bg)]`}
              >
                {p}
              </span>
            );
          case "keyword":
            return (
              <span
                key={i}
                className={`${CHIP} bg-[var(--color-accent)] text-[var(--color-accent-fg)]`}
              >
                {p}
              </span>
            );
          case "name":
            return (
              <b key={i} className="font-semibold italic">
                {p}
              </b>
            );
          default:
            // Plain run — still scan it for unbracketed keywords.
            if (!bareRe) return <span key={i}>{p}</span>;
            return (
              <span key={i}>
                {p.split(bareRe).map((frag, j) =>
                  j % 2 === 1 ? (
                    <span
                      key={j}
                      className={`${CHIP} bg-[var(--color-accent)] text-[var(--color-accent-fg)]`}
                    >
                      {frag}
                    </span>
                  ) : (
                    frag
                  ),
                )}
              </span>
            );
        }
      })}
    </span>
  );
}
