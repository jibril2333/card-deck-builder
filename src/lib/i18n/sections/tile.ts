/**
 * 卡组里单张卡上的两个标记:检索目标(🔍)与联展进化,以及它们拼条件时用的措辞。
 */
import { section } from "../define";

type Words = {
  nameContains: (s: string) => string;
  traits: (s: string) => string;
  mentions: (s: string) => string;
  colors: Record<string, string>;
};

export default section({
  zh: {
    searchTitle: (slots: number | null, n: number) =>
      `检索:${slots !== null ? `${slots} 个槽,` : ""}共可拿本卡组 ${n} 张`,
    slots: (n: number) => `·${n}槽`,
    searchable: "可检索",
    or: " 或 ",
    jogress: "联展进化",
    jogressNone: (conditions: string) =>
      `联展进化:${conditions} —— 本卡组里没有能凑出来的组合`,
    jogressSome: (n: number) => `联展进化:本卡组里有 ${n} 种组合`,
    jogressShort: (n: number) => `联展 ${n}`,
    jogressPairs: "联展组合",
    cost: (n: number) => ` · 费用${n}`,
    noPair: "这副卡组里没有能凑出这个条件的两张卡",
    unsupported: "这个条件的写法还没支持,请看卡面",
    words: {
      nameContains: (s) => `名称含「${s}」`,
      traits: (s) => `特征「${s}」`,
      mentions: (s) => `提及「${s}」`,
      colors: {
        Red: "红",
        Blue: "蓝",
        Yellow: "黄",
        Green: "绿",
        Black: "黑",
        Purple: "紫",
        White: "白",
      },
    } as Words,
  },
  ja: {
    searchTitle: (slots, n) =>
      `サーチ:${slots !== null ? `${slots} 枠、` : ""}このデッキから計 ${n} 枚`,
    slots: (n) => `·${n}枠`,
    searchable: "サーチ可能",
    or: " または ",
    jogress: "ジョグレス進化",
    jogressNone: (conditions) =>
      `ジョグレス進化:${conditions} —— このデッキでは組み合わせを作れません`,
    jogressSome: (n) => `ジョグレス進化:このデッキに ${n} 通りの組み合わせ`,
    jogressShort: (n) => `ジョグ ${n}`,
    jogressPairs: "ジョグレスの組み合わせ",
    cost: (n) => ` · コスト${n}`,
    noPair: "このデッキにはこの条件を満たす 2 枚がありません",
    unsupported: "この条件の書き方には未対応です。カードを確認してください",
    words: {
      nameContains: (s) => `名称に「${s}」を含む`,
      traits: (s) => `特徴「${s}」`,
      mentions: (s) => `「${s}」の記述`,
      colors: {
        Red: "赤",
        Blue: "青",
        Yellow: "黄",
        Green: "緑",
        Black: "黒",
        Purple: "紫",
        White: "白",
      },
    },
  },
  en: {
    searchTitle: (slots, n) =>
      `Search: ${slots !== null ? `${slots} slots, ` : ""}can fetch ${n} ${n === 1 ? "card" : "cards"} from this deck`,
    slots: (n) => `·${n} slots`,
    searchable: "Searchable",
    or: " or ",
    jogress: "DNA Digivolution",
    jogressNone: (conditions) =>
      `DNA Digivolution: ${conditions} — no pair in this deck can make it`,
    jogressSome: (n) =>
      `DNA Digivolution: ${n} ${n === 1 ? "pair" : "pairs"} in this deck`,
    jogressShort: (n) => `DNA ${n}`,
    jogressPairs: "DNA Digivolution pairs",
    cost: (n) => ` · cost ${n}`,
    noPair: "No two cards in this deck meet this condition",
    unsupported: "This condition's wording is not supported yet; see the card",
    words: {
      nameContains: (s) => `name contains "${s}"`,
      traits: (s) => `trait "${s}"`,
      mentions: (s) => `mentions "${s}"`,
      colors: {
        Red: "Red",
        Blue: "Blue",
        Yellow: "Yellow",
        Green: "Green",
        Black: "Black",
        Purple: "Purple",
        White: "White",
      },
    },
  },
});
