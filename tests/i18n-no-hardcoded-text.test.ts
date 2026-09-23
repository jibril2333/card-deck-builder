/**
 * No hard-coded Chinese or Japanese outside the dictionary.
 *
 * The site speaks three languages now, and the way that decays is not a bad
 * translation — it is one more button added next week with its label typed
 * straight into the JSX. It renders fine for the person who wrote it and is
 * invisible to everyone else. This walks the source and fails on any CJK
 * outside a comment, so that button has to pick up a key on the way in.
 *
 * What is allowed is listed one file at a time, with the reason: text that is
 * DATA (the keyword table, which is trilingual by design), PATTERNS matched
 * against Japanese or Chinese card text, and text that has no reader with a
 * language — a container log, a push notification to the owner's phone.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** file → why its Chinese/Japanese belongs in the source. */
const ALLOWED: Record<string, string> = {
  // The switch's own labels stay in their own languages: a reader who cannot
  // read the current interface still has to find theirs.
  "src/lib/card-lang.ts": "the EN / 中 / 日 labels of the language switch",
  // Trilingual data, not interface copy — see the file's header.
  "src/lib/keywords.ts": "the keyword table, written in all three languages",

  // Patterns matched against the cards' own text. Translating these would
  // stop them matching anything.
  "src/lib/cards/effect-vocab.ts": "vocabulary matched in card text",
  "src/lib/jogress.ts": "parses the Japanese ジョグレス condition",
  "src/lib/kana.ts": "kana ranges",
  "src/lib/keyword-derive.ts": "matches keyword spellings in card text",
  "src/lib/search-terms.ts": "CJK range for splitting search terms",
  "src/components/effect-text.tsx": "matches a timing phrase in card text",
  "src/lib/scraper/cardrush.ts": "parses the shop's pages",
  "src/lib/scraper/digimon.ts": "parses the official Japanese card list",
  "src/lib/scraper/digimon-cn.ts": "parses the official Chinese feed",
  "src/lib/scraper/pao.ts": "parses the shop's pages",
  "src/lib/scraper/sanity.ts": "words a real card page must contain",
  "src/lib/db/translations-ddl.ts": "column comments quoting card data",
  "src/lib/db/migrations.ts": "SQL matching stored card text",

  // Written for the operator, not for a reader of the site: container logs,
  // thrown errors that end up in a log, and the push notification the
  // refresh sends to one phone. None of them has a request to take a
  // language from.
  "src/lib/db/bootstrap-admin.ts": "first-run console output",
  "src/lib/db/connection.ts": "startup errors, logged",
  "src/lib/refresh-notify.ts": "the ntfy push to the owner's phone",
  "src/lib/refresh-schedule.ts": "the daemon's own summary of the schedule",
  "src/lib/scrape-health.ts": "the ntfy push and the daemon's log",
  "src/components/error-panel.tsx": "matches the Chinese text of our own error",
};

const CJK = /[一-鿿぀-ヿ]/;

/** Source with comments removed — line, block and `{/* … *\/}` alike. */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "string" | "template" = "code";
  let quote = "";
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (state === "code") {
      if (two === "//") {
        state = "line";
        i += 2;
        continue;
      }
      if (two === "/*") {
        state = "block";
        i += 2;
        continue;
      }
      if (src[i] === '"' || src[i] === "'") {
        state = "string";
        quote = src[i];
      } else if (src[i] === "`") {
        state = "template";
      }
      out += src[i++];
      continue;
    }
    if (state === "line") {
      if (src[i] === "\n") {
        state = "code";
        out += "\n";
      }
      i++;
      continue;
    }
    if (state === "block") {
      if (two === "*/") {
        state = "code";
        i += 2;
        continue;
      }
      if (src[i] === "\n") out += "\n";
      i++;
      continue;
    }
    // inside a string or template: copy through, honouring escapes
    if (src[i] === "\\") {
      out += src.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (
      (state === "string" && src[i] === quote) ||
      (state === "template" && src[i] === "`")
    ) {
      state = "code";
    }
    out += src[i++];
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("the interface has no hard-coded Chinese or Japanese", () => {
  const root = process.cwd();
  const files = sourceFiles(path.join(root, "src"))
    .map((p) => path.relative(root, p))
    .filter((p) => !p.startsWith(path.join("src", "lib", "i18n")));

  it("finds the source to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("keeps every user-visible string in the dictionary", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (ALLOWED[rel]) continue;
      const code = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
      const lines = code
        .split("\n")
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => CJK.test(l));
      for (const [n, l] of lines) offenders.push(`${rel}:${n}  ${l.trim()}`);
    }
    expect(offenders, offenders.slice(0, 10).join("\n")).toEqual([]);
  });

  it("does not allow files that no longer need it", () => {
    // An entry left behind after its text moved would quietly permit new
    // hard-coded copy in that file.
    for (const [rel, why] of Object.entries(ALLOWED)) {
      const full = path.join(root, rel);
      expect(fs.existsSync(full), rel).toBe(true);
      expect(why.length, rel).toBeGreaterThan(10);
      const code = stripComments(fs.readFileSync(full, "utf8"));
      expect(CJK.test(code), `${rel} no longer has any — drop the entry`).toBe(
        true,
      );
    }
  });
});
