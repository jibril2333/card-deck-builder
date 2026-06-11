import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import {
  pickStr,
  pickList,
  pickNum,
  pickSort,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { TopNav } from "@/components/top-nav";
import { CardThumb, type CardLite } from "@/components/card-thumb";
import { FilterForm, type FilterField } from "@/components/filter-form";
import { FilterPanel } from "@/components/filter-panel";
import { ActiveFilters, type ChipSpec } from "@/components/active-filters";
import * as digimon from "@/lib/db/digimon";
import * as ua from "@/lib/db/unionarena";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function CardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  const sp = await searchParams;
  const page = Math.max(1, pickNum(sp, "page") ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const sort = pickSort(sp);

  let rows: CardLite[];
  let total: number;
  let fields: FilterField[];
  let sortOptions: { value: string; label: string }[];
  let chipSpecs: ChipSpec[];

  if (game === "digimon") {
    const colors = digimon.distinct("color");
    const types = digimon.distinct("card_type");
    // DB has mixed case ("SEC" + "sec" = same rarity from different sources).
    // Dedupe by uppercase so the UI shows one chip per actual rarity.
    const rarities = [
      ...new Set(digimon.distinct("rarity").map((r) => r.toUpperCase())),
    ].sort();
    const forms = digimon.distinct("form");
    const stages = digimon.distinct("stage");
    const attributes = digimon.distinct("attribute");
    const levels = digimon.distinctNumbers("level");
    const playCosts = digimon.distinctNumbers("play_cost");
    const dps = digimon.distinctNumbers("dp");
    const setNames = digimon.distinctSetNames();

    fields = [
      {
        type: "search",
        key: "q",
        label: "关键词",
        placeholder: "名称 / 编号 / 效果",
      },
      {
        type: "multi",
        key: "color",
        label: "颜色",
        options: colors,
        colorChips: true,
        maxSelect: 2,
      },
      { type: "multi", key: "card_type", label: "类型", options: types },
      { type: "multi", key: "rarity", label: "稀有度", options: rarities },
      { type: "range", key: "level", label: "等级", options: levels },
      { type: "range", key: "play_cost", label: "费用", options: playCosts },
      {
        type: "range",
        key: "dp",
        label: "DP",
        options: dps.map((n) => ({ value: n, label: n.toLocaleString() })),
      },
      {
        type: "boolean",
        key: "has_inherited",
        label: "只看有继承效果的卡",
      },
      {
        type: "boolean",
        key: "has_security",
        label: "只看有安全区效果的卡",
      },
      {
        type: "boolean",
        key: "show_alt_arts",
        label: "异画各版本单独显示",
      },
      {
        type: "group",
        key: "more",
        label: "更多筛选",
        fields: [
          { type: "multi", key: "form", label: "Form", options: forms },
          { type: "multi", key: "stage", label: "Stage", options: stages },
          {
            type: "multi",
            key: "attribute",
            label: "属性",
            options: attributes,
          },
          {
            type: "multi-scroll",
            key: "set",
            label: "卡包 / Card Set",
            options: setNames,
          },
        ],
      },
    ];

    sortOptions = [
      { value: "code", label: "编号 ↑" },
      { value: "-code", label: "编号 ↓" },
      { value: "name", label: "名称 ↑" },
      { value: "-name", label: "名称 ↓" },
      { value: "level", label: "等级 ↑" },
      { value: "-level", label: "等级 ↓" },
      { value: "play_cost", label: "费用 ↑" },
      { value: "-play_cost", label: "费用 ↓" },
      { value: "dp", label: "DP ↑" },
      { value: "-dp", label: "DP ↓" },
    ];

    chipSpecs = [
      { kind: "single", key: "q", label: "关键词" },
      { kind: "list", key: "color", label: "颜色", colorChips: true },
      { kind: "list", key: "card_type", label: "类型" },
      { kind: "list", key: "rarity", label: "稀有度" },
      { kind: "range", minKey: "level_min", maxKey: "level_max", label: "等级" },
      {
        kind: "range",
        minKey: "play_cost_min",
        maxKey: "play_cost_max",
        label: "费用",
      },
      { kind: "range", minKey: "dp_min", maxKey: "dp_max", label: "DP" },
      { kind: "bool", key: "has_inherited", label: "有继承效果" },
      { kind: "bool", key: "has_security", label: "有安全区效果" },
      { kind: "bool", key: "show_alt_arts", label: "异画单列" },
      { kind: "list", key: "form", label: "Form" },
      { kind: "list", key: "stage", label: "Stage" },
      { kind: "list", key: "attribute", label: "属性" },
      { kind: "list", key: "set", label: "卡包" },
      {
        kind: "sort",
        key: "sort",
        labelMap: {
          code: "编号",
          name: "名称",
          level: "等级",
          play_cost: "费用",
          dp: "DP",
        },
      },
    ];

    const r = digimon.searchCards({
      q: pickStr(sp, "q"),
      colors: pickList(sp, "color"),
      card_types: pickList(sp, "card_type"),
      rarities: pickList(sp, "rarity"),
      forms: pickList(sp, "form"),
      stages: pickList(sp, "stage"),
      attributes: pickList(sp, "attribute"),
      sets: pickList(sp, "set"),
      level_min: pickNum(sp, "level_min"),
      level_max: pickNum(sp, "level_max"),
      play_cost_min: pickNum(sp, "play_cost_min"),
      play_cost_max: pickNum(sp, "play_cost_max"),
      dp_min: pickNum(sp, "dp_min"),
      dp_max: pickNum(sp, "dp_max"),
      has_inherited: pickStr(sp, "has_inherited") === "1",
      has_security: pickStr(sp, "has_security") === "1",
      show_alt_arts: pickStr(sp, "show_alt_arts") === "1",
      sort_field: sort.field,
      sort_dir: sort.dir,
      limit: PAGE_SIZE,
      offset,
    });
    const encD = (s: string) =>
      s.split("/").map(encodeURIComponent).join("/");
    // Batch-load Cardrush prices for the entire visible page. variant ""
    // → "base" bucket, anything else → "parallel".
    const priceMap = digimon.getExternalPrices(r.rows.map((c) => c.id));
    const restrictionMap = digimon.getRestrictionMap(r.rows.map((c) => c.id));
    const tMap = digimon.getDisplayTranslations(
      r.rows.map((c) => c.code),
      cardLang,
    );
    rows = r.rows.map((c) => {
      const baseHref = `/${game}/card/${encD(c.code)}`;
      const href = c.variant
        ? `${baseHref}?v=${encodeURIComponent(c.variant)}`
        : baseHref;
      const priceKey = `${c.id}|${c.variant === "" ? "base" : "parallel"}`;
      const priceRow = priceMap.get(priceKey);
      const t = tMap.get(c.code);
      return {
        ...c,
        name: t?.name ?? c.name,
        // Alt-art tiles are pinned to their specific printing's art; only the
        // base tile swaps to the localized card image.
        image_url: c.variant
          ? c.display_image
          : (t?.image_url ?? c.display_image),
        variant_count: c.variant_count,
        href,
        market_price: priceRow?.price_yen ?? null,
        market_in_stock: priceRow?.in_stock ?? false,
        restriction: restrictionMap.get(c.id) ?? null,
      };
    });
    total = r.total;
  } else {
    const colors = ua.distinct("color");
    const types = ua.distinct("card_type");
    // Filter out parallel / alt rarities from the default option list
    const rarities = ua
      .distinct("rarity")
      .filter((r) => !r.startsWith("Pc") && !r.includes("★"));
    // Series sorted by card count, but pin EVA (新劇場版) to the top.
    const series = (() => {
      const list = ua.seriesList().map((s) => s.name);
      const isEva = (s: string) => s.includes("ヴァンゲリヲン") || s.includes("エヴァ");
      const eva = list.filter(isEva);
      const rest = list.filter((s) => !isEva(s));
      return [...eva, ...rest];
    })();
    const energies = ua.distinctNumbers("energy_cost");
    const aps = ua.distinctNumbers("ap_cost");
    const bps = ua.distinctNumbers("bp").filter((n) => n > 0);
    const packs = ua.distinctPacks();

    fields = [
      {
        type: "search",
        key: "q",
        label: "关键词",
        placeholder: "名称 / 编号 / 效果",
      },
      {
        type: "select",
        key: "series",
        label: "作品",
        options: series,
        placeholder: "全部作品",
      },
      {
        type: "multi",
        key: "color",
        label: "颜色",
        options: colors,
        colorChips: true,
      },
      { type: "multi", key: "card_type", label: "类型", options: types },
      { type: "multi", key: "rarity", label: "稀有度", options: rarities },
      { type: "range", key: "energy", label: "Energy", options: energies },
      { type: "range", key: "ap", label: "AP", options: aps },
      {
        type: "range",
        key: "bp",
        label: "BP",
        options: bps.map((n) => ({ value: n, label: n.toLocaleString() })),
      },
      { type: "boolean", key: "has_trigger", label: "只看带 Trigger 的卡" },
      { type: "boolean", key: "has_effect", label: "只看带效果文本的卡" },
      {
        type: "boolean",
        key: "show_alt_arts",
        label: "异画各版本单独显示",
      },
      {
        type: "group",
        key: "more",
        label: "更多筛选",
        fields: [
          {
            type: "multi-scroll",
            key: "pack",
            label: "卡包 (Pack)",
            options: packs,
          },
        ],
      },
    ];

    sortOptions = [
      { value: "code", label: "编号 ↑" },
      { value: "-code", label: "编号 ↓" },
      { value: "name", label: "名称 ↑" },
      { value: "-name", label: "名称 ↓" },
      { value: "series", label: "作品 ↑" },
      { value: "energy_cost", label: "Energy ↑" },
      { value: "-energy_cost", label: "Energy ↓" },
      { value: "ap_cost", label: "AP ↑" },
      { value: "-ap_cost", label: "AP ↓" },
      { value: "bp", label: "BP ↑" },
      { value: "-bp", label: "BP ↓" },
    ];

    chipSpecs = [
      { kind: "single", key: "q", label: "关键词" },
      { kind: "single", key: "series", label: "作品" },
      { kind: "list", key: "color", label: "颜色", colorChips: true },
      { kind: "list", key: "card_type", label: "类型" },
      { kind: "list", key: "rarity", label: "稀有度" },
      { kind: "range", minKey: "energy_min", maxKey: "energy_max", label: "Energy" },
      { kind: "range", minKey: "ap_min", maxKey: "ap_max", label: "AP" },
      { kind: "range", minKey: "bp_min", maxKey: "bp_max", label: "BP" },
      { kind: "bool", key: "has_trigger", label: "带 Trigger" },
      { kind: "bool", key: "has_effect", label: "有效果文本" },
      { kind: "bool", key: "show_alt_arts", label: "异画单列" },
      { kind: "list", key: "pack", label: "卡包" },
      {
        kind: "sort",
        key: "sort",
        labelMap: {
          code: "编号",
          name: "名称",
          series: "作品",
          energy_cost: "Energy",
          ap_cost: "AP",
          bp: "BP",
        },
      },
    ];

    const r = ua.searchCards({
      q: pickStr(sp, "q"),
      colors: pickList(sp, "color"),
      card_types: pickList(sp, "card_type"),
      series_list: pickStr(sp, "series") ? [pickStr(sp, "series")!] : [],
      rarities: pickList(sp, "rarity"),
      packs: pickList(sp, "pack"),
      energy_min: pickNum(sp, "energy_min"),
      energy_max: pickNum(sp, "energy_max"),
      ap_min: pickNum(sp, "ap_min"),
      ap_max: pickNum(sp, "ap_max"),
      bp_min: pickNum(sp, "bp_min"),
      bp_max: pickNum(sp, "bp_max"),
      has_trigger: pickStr(sp, "has_trigger") === "1",
      has_effect: pickStr(sp, "has_effect") === "1",
      show_alt_arts: pickStr(sp, "show_alt_arts") === "1",
      sort_field: sort.field,
      sort_dir: sort.dir,
      limit: PAGE_SIZE,
      offset,
    });
    // Every version links to its card's canonical (base) detail page. When the
    // tile is an alt-art (code != base_code), append ?v=<code> so the gallery
    // opens defaulting to that art.
    const enc = (s: string) =>
      s.split("/").map(encodeURIComponent).join("/");
    // Cardrush doesn't sell UA today, so this map is empty in practice —
    // wired up the same way as Digimon so adding another source later
    // (dorasuta etc.) only requires a scraper, no UI plumbing.
    const uaPriceMap = ua.getExternalPrices(r.rows.map((c) => c.id));
    const uaRestrictionMap = ua.getRestrictionMap(r.rows.map((c) => c.id));
    rows = r.rows.map((c) => {
      const baseHref = `/${game}/card/${enc(c.base_code)}`;
      const href =
        c.code === c.base_code
          ? baseHref
          : `${baseHref}?v=${encodeURIComponent(c.code)}`;
      const priceRow = uaPriceMap.get(`${c.id}|base`);
      return {
        ...c,
        variant_count: c.variant_count,
        href,
        market_price: priceRow?.price_yen ?? null,
        market_in_stock: priceRow?.in_stock ?? false,
        restriction: uaRestrictionMap.get(c.id) ?? null,
      };
    });
    total = r.total;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <TopNav game={game as GameId} active="search" />
      <main className="w-full mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside>
          <FilterPanel activeCount={chipSpecs.length}>
            <FilterForm
              basePath={`/${game}`}
              fields={fields}
              sortOptions={sortOptions}
            />
          </FilterPanel>
        </aside>

        <section className="min-w-0">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-semibold">
              卡牌检索{" "}
              <span className="text-[var(--color-muted-fg)] font-normal text-sm">
                {total.toLocaleString()} 张
              </span>
            </h1>
            <div className="text-xs text-[var(--color-muted-fg)]">
              第 {page} / {totalPages} 页
            </div>
          </div>

          <ActiveFilters basePath={`/${game}`} specs={chipSpecs} />

          {rows.length === 0 ? (
            <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              没有符合条件的卡牌
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {rows.map((c) => (
                <CardThumb key={c.href ?? c.id} game={game} card={c} />
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <Pagination
              basePath={`/${game}`}
              page={page}
              totalPages={totalPages}
              sp={sp}
            />
          ) : null}
        </section>
      </main>
    </>
  );
}

function Pagination({
  basePath,
  page,
  totalPages,
  sp,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  sp: SearchParamsRecord;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((vv) => params.append(k, vv));
    else params.set(k, v);
  }
  const mk = (p: number) => {
    const c = new URLSearchParams(params);
    c.set("page", String(p));
    return `${basePath}?${c.toString()}`;
  };

  return (
    <nav className="flex items-center justify-center gap-2 mt-8 text-sm">
      {page > 1 ? (
        <Link
          href={mk(page - 1)}
          className="px-3 h-8 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] flex items-center"
        >
          上一页
        </Link>
      ) : null}
      <span className="text-[var(--color-muted-fg)]">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={mk(page + 1)}
          className="px-3 h-8 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] flex items-center"
        >
          下一页
        </Link>
      ) : null}
    </nav>
  );
}
