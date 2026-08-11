/**
 * Pure parsers for the two official banlist pages.
 *
 *   - Digimon: https://world.digimoncard.com/rule/restriction_card/
 *     The page has a long history of announcements, but section
 *     `#application` ("List of Currently Affected Cards") is the
 *     authoritative current state — only that part is parsed.
 *
 *     Section `#limitedCardlist` ("現在施行中のカードの使用制限について")
 *     is the authoritative current list.
 *
 * Both return rows ready to UPSERT into the `card_restrictions` table.
 * `identity` is the deduplication key (full card code minus any `_pN`
 * parallel suffix), keyed-against `card_restrictions.identity` and
 * resolved at query time when the app checks deck limits.
 *
 * Banned Pairs (Digimon's "if A in deck, B is banned") live in a separate
 * `banned_pairs` table and are produced by `parseDigimonBannedPairs`.
 * Only Digimon has pair restrictions.
 */

import * as cheerio from "cheerio";

export type ParsedRestriction = {
  /** Card code without `_pN` suffix. */
  identity: string;
  status: "banned" | "limited_1" | "limited_2";
  max_count: 0 | 1 | 2;
  /** True if all parallel printings of this card count toward the limit. */
  includes_parallel: boolean;
};

/**
 * Parse Digimon's banlist (English, world.digimoncard.com).
 *
 * Walks the `#application` section's `<h5>` headers ("Banned cards", "Restricted Cards (1)")
 * and gathers the `<span class="num">CODE</span>` items inside the
 * following `.restriction_card` block.
 */
export function parseDigimonRestrictions(html: string): ParsedRestriction[] {
  const $ = cheerio.load(html);
  const out: ParsedRestriction[] = [];
  const $section = $("#application");
  if ($section.length === 0) return out;

  $section.find("h5.minTit").each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    let status: ParsedRestriction["status"];
    let max: ParsedRestriction["max_count"];
    if (text.startsWith("Banned cards")) {
      status = "banned";
      max = 0;
    } else if (text.startsWith("Restricted Cards (1)")) {
      status = "limited_1";
      max = 1;
    } else {
      // "Banned Pair" or any other section — skip
      return;
    }
    // The h5 is wrapped in a div; the card list is the next .restriction_card
    // sibling at the same depth.
    const $cardBlock = $(el).parent().nextAll(".restriction_card").first();
    $cardBlock.find("span.num").each((_j, num) => {
      const code = $(num).text().trim();
      if (code && /^[A-Z]+\d*-\d+/.test(code)) {
        out.push({
          identity: code,
          status,
          max_count: max,
          // Digimon alt-art shares the cards.code (`_P1` is just a key in
          // card_images), so a restriction on code automatically covers
          // all parallel printings.
          includes_parallel: true,
        });
      }
    });
  });

  return out;
}

export type ParsedPair = {
  /** Code of the trigger card ("Component Card A" — its presence in a deck
   *  outlaws the banned partners). */
  trigger_identity: string;
  /** Code of the partner that becomes banned when the trigger is in the deck. */
  banned_identity: string;
};

/**
 * Parse Digimon's "Banned Pair" section (English page, under `#application`).
 *
 * Real markup is one `<div class="noticeFrame noticeBase">` per pair, with
 * a fixed sub-structure:
 *
 *   <div class="noticeFrame noticeBase">
 *     <div class="noticeArea ...">Component Card A</div>
 *     <ul class="noticeList ...">
 *       <li>・<a href="...card_no=CODE">CODE Name</a></li>
 *       <li>...possibly more A cards...</li>
 *     </ul>
 *     <div class="noticeArea ...">Component Card B</div>
 *     <ul class="noticeList ...">
 *       <li>・<a href="...card_no=CODE">CODE Name</a></li>
 *       <li>...possibly more B cards...</li>
 *     </ul>
 *   </div>
 *
 * Codes are extracted from each `<a>`'s `card_no` query parameter — that's
 * the official ID and dodges the bullet character / whitespace issues that
 * make text-parsing fragile. The `<a>` tags appear in document order
 * within each noticeFrame: first under the A's noticeArea, then under B's.
 * We use a simple two-cursor walk (current role flips on each noticeArea).
 *
 * The output is denormalized to (trigger, banned) edges. One pair with 1
 * trigger × 2 banned cards yields 2 rows.
 */
export function parseDigimonBannedPairs(html: string): ParsedPair[] {
  const $ = cheerio.load(html);
  const $section = $("#application");
  if ($section.length === 0) return [];

  const pairs: ParsedPair[] = [];

  $section.find("div.noticeFrame").each((_i, frame) => {
    const $frame = $(frame);
    const triggers: string[] = [];
    const bannedSet: string[] = [];
    let role: "A" | "B" | null = null;

    // Walk direct + nested noticeArea/ul.noticeList in document order. The
    // structure nests one level for the B half ("noticeArea isRed" lives
    // inside a sibling .mt_s div, alongside its ul). Using a flat find()
    // captures both depths in source order, which matches the visual order.
    $frame.find(".noticeArea, ul.noticeList").each((_j, el) => {
      const $el = $(el);
      if ($el.hasClass("noticeArea")) {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (/Component Card A\b/.test(text)) role = "A";
        else if (/Component Card B\b/.test(text)) role = "B";
        return;
      }
      // ul.noticeList — collect codes from each link's card_no parameter.
      $el.find("a[href]").each((_k, a) => {
        const href = $(a).attr("href") ?? "";
        const m = href.match(/card_no=([A-Z]+\d*-\d+)/);
        if (!m) return;
        const code = m[1];
        if (role === "A") {
          if (!triggers.includes(code)) triggers.push(code);
        } else if (role === "B") {
          if (!bannedSet.includes(code)) bannedSet.push(code);
        }
      });
    });

    for (const t of triggers) {
      for (const b of bannedSet) {
        if (t === b) continue; // defensive
        pairs.push({ trigger_identity: t, banned_identity: b });
      }
    }
  });

  // De-dupe across noticeFrames in case the page repeats a pair under
  // both the historical "Effective on …" subsection and the current
  // "List of Currently Affected Cards" section (we scope to #application,
  // but better safe than sorry).
  const seen = new Set<string>();
  return pairs.filter((p) => {
    const k = `${p.trigger_identity}::${p.banned_identity}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
