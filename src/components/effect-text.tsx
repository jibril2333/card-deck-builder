/**
 * Renders Digimon card effect text with the bracketed tokens highlighted, the
 * way community card viewers (e.g. digicamoe) present them:
 *
 *   - TIMING / CONDITION brackets — 【登场时】 [On Play] 〔进化〕 [When Digivolving]
 *     and EN trait tags like [Angel] — bold accent text. These mark when an
 *     effect fires (and traits), so they read as the structure of the text.
 *   - KEYWORD ABILITIES — 《阻挡者》 ≪天昇≫ ＜Recovery +1＞ — a small filled pill,
 *     since they're named, rules-defined abilities.
 *
 * Plain text (including the line breaks the source provides) is preserved via
 * `whitespace-pre-wrap`, so multi-clause effects keep their line structure.
 *
 * Pure presentational + deterministic; works for EN / 中文 / 日本語 alike since
 * all three use the same bracket families.
 */

// One capturing split regex so `String.split` returns text and brackets
// interleaved. Order doesn't matter (the families don't nest in this data).
const BRACKET_RE =
  /(【[^】]*】|〔[^〕]*〕|\[[^\]]+\]|《[^》]*》|≪[^≫]*≫|＜[^＞]*＞)/g;

function isTiming(tok: string): boolean {
  const c = tok[0];
  return c === "【" || c === "〔" || c === "[";
}
function isKeyword(tok: string): boolean {
  const c = tok[0];
  return c === "《" || c === "≪" || c === "＜";
}

export function EffectText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(BRACKET_RE);
  return (
    <span className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {parts.map((p, i) => {
        if (!p) return null;
        if (isTiming(p)) {
          return (
            <b
              key={i}
              className="font-semibold text-[var(--color-accent)]"
            >
              {p}
            </b>
          );
        }
        if (isKeyword(p)) {
          return (
            <span
              key={i}
              className="inline-block px-1 rounded bg-[var(--color-accent)]/12 text-[var(--color-accent)] font-medium"
            >
              {p}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}
