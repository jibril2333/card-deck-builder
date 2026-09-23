/** 卡牌检索页、收集页的标题与结果区,以及卡牌缩略图。 */
import { section } from "../define";

export default section({
  zh: {
    title: "卡牌检索",
    cards: (n: number) => `${n.toLocaleString()} 张`,
    pageOf: (page: number, total: number) => `第 ${page} / ${total} 页`,
    noResults: "没有符合条件的卡牌",
    versions: (n: number) => `${n} 个版本`,
    cardrushCheapest: "Cardrush 最便宜在售价",
    cardrushLastSold: "Cardrush 最后记录价(已售罄)",
    includedIn: "收录：",
    collectionTitle: "已收集",
    ownedSummary: (kinds: number, copies: number) =>
      `${kinds} 种 · 共 ${copies} 张`,
    pageOfTotal: (page: number, pages: number, total: number) =>
      `第 ${page} / ${pages} 页 · 共 ${total.toLocaleString()} 张`,
  },
  ja: {
    title: "カード検索",
    cards: (n) => `${n.toLocaleString()} 枚`,
    pageOf: (page, total) => `${page} / ${total} ページ`,
    noResults: "条件に合うカードはありません",
    versions: (n) => `${n} 種類のイラスト`,
    cardrushCheapest: "カードラッシュの最安在庫価格",
    cardrushLastSold: "カードラッシュの最終記録価格(売り切れ)",
    includedIn: "収録:",
    collectionTitle: "コレクション",
    ownedSummary: (kinds, copies) => `${kinds} 種類 · 計 ${copies} 枚`,
    pageOfTotal: (page, pages, total) =>
      `${page} / ${pages} ページ · 計 ${total.toLocaleString()} 枚`,
  },
  en: {
    title: "Card search",
    cards: (n) => `${n.toLocaleString()} ${n === 1 ? "card" : "cards"}`,
    pageOf: (page, total) => `Page ${page} of ${total}`,
    noResults: "No cards match these filters",
    versions: (n) => `${n} printings`,
    cardrushCheapest: "Cheapest in-stock price at Cardrush",
    cardrushLastSold: "Last recorded Cardrush price (sold out)",
    includedIn: "Printed in: ",
    collectionTitle: "Collection",
    ownedSummary: (kinds, copies) =>
      `${kinds} ${kinds === 1 ? "card" : "cards"} · ${copies} ${copies === 1 ? "copy" : "copies"} in all`,
    pageOfTotal: (page, pages, total) =>
      `Page ${page} of ${pages} · ${total.toLocaleString()} ${total === 1 ? "card" : "cards"}`,
  },
});
