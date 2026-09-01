/**
 * The shops we quote prices from, and how to reach the page a quote came from.
 *
 * One definition for both ends: the scrapers fetch these URLs, and the card
 * page links to them so a price is checkable rather than just asserted. A URL
 * written twice is a URL that drifts — PAO's needs `search_category`, and the
 * scrape learnt that the hard way.
 */
export type ShopId = "cardrush" | "pao";

export const SHOPS: Record<
  ShopId,
  { label: string; search: (code: string) => string }
> = {
  cardrush: {
    label: "Cardrush",
    search: (code) =>
      `https://www.cardrush-digimon.jp/product-list?keyword=${encodeURIComponent(code)}`,
  },
  pao: {
    label: "PAO",
    // Inside the Digimon category: the site-wide search returns other games.
    search: (code) =>
      `https://pao-onlineshop.com/view/search?search_keyword=${encodeURIComponent(code)}` +
      `&search_category=DC`,
  },
};

export function shopSearchUrl(shop: ShopId, code: string): string {
  return SHOPS[shop].search(code);
}
