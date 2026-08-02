/**
 * Renders Digimon effect text with its tokens as chips, the way community card
 * viewers (digicamoe et al.) present them. Three families, three treatments:
 *
 Colours match the printed card, sampled from the official art:
 *
 *   TIMING — 【登場時】 [On Play], plus the EN trait tags sharing that bracket.
 *     NAVY on the card.
 *
 *   LIMITER — ［ターンに1回］ [Once Per Turn] ［1回合1次］. RED on the card, and
 *     visibly distinct from the navy timing tag it usually sits next to.
 *
 *   KEYWORD ABILITY — 《阻挡者》 ≪Sアタック+1≫ ＜Rush＞. ORANGE on the card.
 *
 *   SPECIAL PLAY / DIGIVOLVE — 〔ジョグレス〕 アセンブリ-6 デジクロス-2. TEAL on
 *     the card; a different mechanic from the keyword abilities above.
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
  /(【[^】]*】|〔[^〕]*〕|\[[^\]]+\]|［[^］]+］|\{[^}]+\}|《[^》]*》|≪[^≫]*≫|＜[^＞]*＞|「[^」]*」|“[^”]*”)/g;

type Kind = "timing" | "limiter" | "keyword" | "special" | "name" | "text";

/**
 * "Once per turn"-style limiters, which the card prints red rather than navy.
 * EN shares the [] bracket with timings, so it has to be matched by phrase.
 */
const LIMITER_RE =
  /ターンに\s*\d+\s*回|回合\s*\d+\s*次|Once Per (?:Turn|Match)|\d+\s*Per Turn/i;

function kindOf(tok: string): Kind {
  switch (tok[0]) {
    case "【":
      return "timing";
    // 〔…〕 is the special-digivolve bracket — 〔進化〕〔ジョグレス〕 — a different
    // mechanic (and colour) from a timing window.
    case "〔":
      return "special";
    case "[":
    // CN text uses the fullwidth bracket for the same tags — ［每回合1次］.
    case "［":
    // 126 cards spell the play-location tag with braces — {Hand}[Counter].
    case "{":
      return LIMITER_RE.test(tok) ? "limiter" : "timing";
    case "《":
    case "≪":
    case "＜":
      return "keyword";
    case "「":
    case "“": // opening curly double quote, used by the CN text
      return "name";
    default:
      return LIMITER_RE.test(tok) ? "limiter" : "text";
  }
}

/** Card-accurate chip colours. Fixed values, not theme tokens: they encode
 *  what's printed on the card, so they must not drift with the site theme. */
const CHIP_STYLE: Record<
  "timing" | "limiter" | "keyword" | "special",
  string
> = {
  timing: "bg-[#1f3a93] text-white",
  limiter: "bg-[#d2232a] text-white",
  keyword: "bg-[#e8830c] text-white",
  special: "bg-[#158a7a] text-white",
};

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
        const kind = kindOf(p);
        switch (kind) {
          case "timing":
          case "limiter":
          case "keyword":
          case "special":
            return (
              <span key={i} className={`${CHIP} ${CHIP_STYLE[kind]}`}>
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
                      // Bare (bracket-less) keywords are the special play /
                      // digivolve family — アセンブリ-6, デジクロス-2 — which the
                      // card prints teal.
                      className={`${CHIP} ${CHIP_STYLE.special}`}
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
