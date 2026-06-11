import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId, colorHex } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { TopNav } from "@/components/top-nav";
import { Badge } from "@/components/ui/badge";
import { AddToDeck } from "@/components/add-to-deck";
import { BackLink } from "@/components/back-link";
import { CardImageGallery } from "@/components/card-image-gallery";
import { CardPriceInput } from "@/components/card-price-input";
import { getCurrentUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";
import * as ua from "@/lib/db/unionarena";

export const dynamic = "force-dynamic";

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string; code: string[] }>;
  searchParams: Promise<{ v?: string }>;
}) {
  // Anon → card view is read-only: no AddToDeck widget, no editable price.
  // The empty sentinel id is safe with our queries: listDecksWithCardQty
  // returns zero rows (decks are owned by SOMEONE), getCardPrice falls
  // through to the user_id-IS-NULL global price.
  const me = await getCurrentUser();
  const meId = me?.id ?? "";
  const { game, code } = await params;
  const { v: defaultVariant } = await searchParams;
  if (!isGameId(game)) notFound();
  const decoded = code.map((s) => decodeURIComponent(s)).join("/");

  if (game === "digimon") {
    const card = digimon.getCardByCode(decoded);
    if (!card) notFound();
    const cardLang = parseCardLang(
      (await cookies()).get(CARD_LANG_COOKIE)?.value,
    );
    // Per-field overlay: anything the CN/JP source doesn't have falls back
    // to the EN base text, so a partially-translated card still reads fine.
    const t = digimon.getCardTranslation(card.code, cardLang);
    const view: digimon.DigimonCard = t
      ? {
          ...card,
          name: t.name ?? card.name,
          card_type: t.card_type ?? card.card_type,
          form: t.form ?? card.form,
          stage: t.form ?? card.stage,
          attribute: t.attribute ?? card.attribute,
          digi_types: t.traits ?? card.digi_types,
          main_effect: t.effect_main ?? card.main_effect,
          security_effect: t.effect_2 ?? card.security_effect,
          inherited_effect: t.effect_3 ?? card.inherited_effect,
        }
      : card;
    const decks = me
      ? digimon.listDecksWithCardQty(meId, card.id).map((d) => ({
          id: d.id,
          name: d.name,
          accent_color: d.accent_color,
          accent_color2: d.accent_color2,
          card_qty: d.card_qty,
          total: d.total,
        }))
      : [];
    let variants = digimon.getCardImages(card.code);
    // Fallback: if scraper hasn't run for this code yet, use the card's
    // own image_url so the page isn't empty.
    if (variants.length === 0 && card.image_url) {
      variants = [{ variant: "", image_url: card.image_url }];
    }
    // Localized card art leads the gallery (and is the default view) when
    // the user picked a language that has one.
    if (t?.image_url) {
      variants = [
        { variant: `lang-${cardLang}`, image_url: t.image_url },
        ...variants,
      ];
    }
    // Cardrush per-illustrator market prices (each distinct printing).
    const listings = digimon.getExternalListings(card.id);
    return (
      <DetailShell game={game}>
        <DigimonDetail
          card={view}
          subName={t?.name && t.name !== card.name ? card.name : undefined}
          decks={decks}
          variants={variants}
          defaultVariant={defaultVariant}
          price={digimon.getCardPrice(meId, card.id)}
          marketListings={listings}
          readonly={!me}
        />
      </DetailShell>
    );
  }

  const card = ua.getCardByCode(decoded);
  if (!card) notFound();
  const decks = me
    ? ua.listDecksWithCardQty(meId, card.id).map((d) => ({
        id: d.id,
        name: d.name,
        accent_color: d.accent_color,
        accent_color2: d.accent_color2,
        card_qty: d.card_qty,
        total: d.total,
      }))
    : [];
  let uaVariants = ua
    .getCardVariants(card.code)
    .filter((v) => v.image_url)
    .map((v) => ({
      variant: v.code,
      image_url: v.image_url!,
      label: v.rarity,
    }));
  if (uaVariants.length === 0 && card.image_url) {
    uaVariants = [
      { variant: card.code, image_url: card.image_url, label: card.rarity },
    ];
  }
  const uaListings = ua.getExternalListings(card.id);
  return (
    <DetailShell game={game}>
      <UADetail
        card={card}
        decks={decks}
        variants={uaVariants}
        defaultVariant={defaultVariant}
        price={ua.getCardPrice(meId, card.id)}
        marketListings={uaListings}
        readonly={!me}
      />
    </DetailShell>
  );
}

function DetailShell({
  game,
  children,
}: {
  game: GameId;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopNav game={game} active="search" />
      <main className="w-full mx-auto max-w-5xl px-4 py-6">
        <BackLink
          fallback={`/${game}`}
          className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 mb-4"
        >
          ← 返回
        </BackLink>
        {children}
      </main>
    </>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function EffectBlock({
  label,
  text,
}: {
  label: string;
  text: string | null | undefined;
}) {
  if (!text) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)] mb-1">
        {label}
      </div>
      <div className="text-sm whitespace-pre-wrap leading-relaxed bg-[var(--color-muted)] rounded-md p-3 border border-[var(--color-border)]">
        {text}
      </div>
    </div>
  );
}

function DigimonDetail({
  card,
  subName,
  decks,
  variants,
  defaultVariant,
  price,
  marketListings,
  readonly,
}: {
  card: digimon.DigimonCard;
  /** Original EN name, shown small under a translated title. */
  subName?: string;
  decks: {
    id: string;
    name: string;
    accent_color: string;
    accent_color2: string | null;
    card_qty: number;
    total: number;
  }[];
  variants: digimon.CardImageVariant[];
  defaultVariant?: string;
  price: number | null;
  marketListings: digimon.ExternalListing[];
  /** Anon viewer: hide the editable price input + the AddToDeck widget. */
  readonly: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
      <div className="space-y-3">
        <CardImageGallery
          name={card.name}
          variants={variants}
          defaultVariant={defaultVariant}
        />
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-3">
          <MarketListingsBlock listings={marketListings} />
          {readonly ? (
            price != null ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-[var(--color-muted-fg)]">
                  预期价格
                </span>
                <span className="font-mono tabular-nums">¥{price}</span>
              </div>
            ) : null
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-muted-fg)] shrink-0">
                  预期价格
                </span>
                <CardPriceInput
                  game="digimon"
                  cardId={card.id}
                  price={price}
                  className="w-28"
                />
              </div>
              <AddToDeck game="digimon" cardId={card.id} decks={decks} />
            </>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-xs font-mono text-[var(--color-muted-fg)]">
            {card.code}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{card.name}</h1>
          {subName ? (
            <div className="text-sm text-[var(--color-muted-fg)] mt-0.5">
              {subName}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {card.color ? (
              <span className="chip">
                <span
                  className="chip-dot"
                  style={{ background: colorHex(card.color) }}
                />
                {card.color}
              </span>
            ) : null}
            {card.color2 ? (
              <span className="chip">
                <span
                  className="chip-dot"
                  style={{ background: colorHex(card.color2) }}
                />
                {card.color2}
              </span>
            ) : null}
            {card.card_type ? <Badge>{card.card_type}</Badge> : null}
            {card.rarity ? <Badge>{card.rarity}</Badge> : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)]">
          <Stat label="Lv" value={card.level} />
          <Stat label="Play Cost" value={card.play_cost} />
          <Stat label="DP" value={card.dp} />
        </div>

        {/* Type line — 形态 / 属性 / 特征 grouped + labeled. These define the
            card's identity and used to be scattered as unlabeled badges. */}
        {card.stage || card.form || card.attribute || card.digi_types ? (
          <div className="rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)] p-3 space-y-2.5">
            {card.stage || card.form || card.attribute ? (
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {card.stage || card.form ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                      形态
                    </div>
                    <div className="text-sm font-medium">
                      {card.stage || card.form}
                    </div>
                  </div>
                ) : null}
                {card.attribute ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                      属性
                    </div>
                    <div className="text-sm font-medium">{card.attribute}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {card.digi_types ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                  特征
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {card.digi_types
                    .split("/")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-md text-sm bg-[var(--color-bg)] border border-[var(--color-border)]"
                      >
                        {t}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {card.evolution_cost || card.evolution_requirements ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Stat label="进化消费" value={card.evolution_cost} />
            <Stat label="进化条件" value={card.evolution_requirements} />
          </div>
        ) : null}

        <EffectBlock label="主要效果" text={card.main_effect} />
        <EffectBlock label="安全区效果" text={card.security_effect} />
        <EffectBlock label="进化继承效果" text={card.inherited_effect} />
        <EffectBlock label="源池效果" text={card.source_effect} />

        <div className="grid grid-cols-2 gap-3 text-xs text-[var(--color-muted-fg)] pt-3 border-t border-[var(--color-border)]">
          <Stat label="收录" value={card.set_names} />
          <Stat label="画师" value={card.artist} />
          {card.source_url ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide">源</span>
              <a
                href={card.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline truncate"
              >
                查看页面 ↗
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UADetail({
  card,
  decks,
  variants,
  defaultVariant,
  price,
  marketListings,
  readonly,
}: {
  card: ua.UACard;
  decks: {
    id: string;
    name: string;
    accent_color: string;
    accent_color2: string | null;
    card_qty: number;
    total: number;
  }[];
  variants: { variant: string; image_url: string; label?: string }[];
  defaultVariant?: string;
  price: number | null;
  marketListings: ua.ExternalListing[];
  /** Anon viewer: hide the editable price input + the AddToDeck widget. */
  readonly: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
      <div className="space-y-3">
        <CardImageGallery
          name={card.name}
          variants={variants}
          defaultVariant={defaultVariant}
        />
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-3">
          <MarketListingsBlock listings={marketListings} />
          {readonly ? (
            price != null ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-[var(--color-muted-fg)]">
                  预期价格
                </span>
                <span className="font-mono tabular-nums">¥{price}</span>
              </div>
            ) : null
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-muted-fg)] shrink-0">
                  预期价格
                </span>
                <CardPriceInput
                  game="unionarena"
                  cardId={card.id}
                  price={price}
                  className="w-28"
                />
              </div>
              <AddToDeck game="unionarena" cardId={card.id} decks={decks} />
            </>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-xs font-mono text-[var(--color-muted-fg)]">
            {card.code}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{card.name}</h1>
          {card.name_reading ? (
            <div className="text-xs text-[var(--color-muted-fg)] mt-0.5">
              {card.name_reading}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="chip">
              <span
                className="chip-dot"
                style={{ background: colorHex(card.color) }}
              />
              {card.color}
            </span>
            <Badge>{card.card_type}</Badge>
            <Badge>{card.rarity}</Badge>
            <Badge className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/30">
              {card.series}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)]">
          <Stat label="Energy" value={card.energy_cost} />
          <Stat label="AP" value={card.ap_cost} />
          <Stat label="BP" value={card.bp || null} />
        </div>

        <EffectBlock label="Trigger" text={card.trigger_text} />
        <EffectBlock label="Effect" text={card.effect_text} />

        <div className="grid grid-cols-2 gap-3 text-xs text-[var(--color-muted-fg)] pt-3 border-t border-[var(--color-border)]">
          <Stat label="Locale" value={card.locale} />
          <Stat label="Source" value={card.source} />
          {card.source_url ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide">源</span>
              <a
                href={card.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline truncate"
              >
                查看页面 ↗
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One row showing a scraped third-party market price. Renders nothing if
 * `entry` is null (no data scraped for this variant yet). When the cheapest
 * listing scraped was sold out we still show the price but strike it through
 * — it's the most recent signal, even if you can't buy it right now.
 */
/**
 * Cardrush market-price breakout: one row per (variant_type, illustrator)
 * pair. The same card_id can have several rows — e.g. Omnimon's "sasasi"
 * base art (¥100) and "Tonamikanji" re-illustration (¥19,300) both
 * register as "base" but are visually different printings.
 *
 * Renders nothing when no listings have been scraped yet.
 */
function MarketListingsBlock({
  listings,
}: {
  listings: {
    variant_type: "base" | "parallel";
    illustrator: string;
    price_yen: number;
    in_stock: boolean;
  }[];
}) {
  if (listings.length === 0) return null;
  return (
    <div className="space-y-1">
      <div
        className="text-xs font-medium text-[var(--color-muted-fg)]"
        title="数据来源:Cardrush(取每个画师版本的最低品相 A- 以上价)"
      >
        Cardrush 市场价
      </div>
      <div className="space-y-0.5">
        {listings.map((l, i) => (
          <div
            key={`${l.variant_type}|${l.illustrator}|${i}`}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className={`shrink-0 px-1 py-px text-[9px] rounded font-bold uppercase ${
                  l.variant_type === "base"
                    ? "bg-[var(--color-muted)] text-[var(--color-muted-fg)]"
                    : "bg-purple-600/15 text-purple-600 dark:text-purple-300"
                }`}
              >
                {l.variant_type === "base" ? "原画" : "异画"}
              </span>
              <span className="truncate text-[var(--color-muted-fg)]">
                {l.illustrator}
              </span>
            </span>
            <span
              className={`font-mono tabular-nums shrink-0 ${
                l.in_stock
                  ? "text-[var(--color-fg)]"
                  : "text-[var(--color-muted-fg)] line-through opacity-70"
              }`}
              title={l.in_stock ? "在售" : "已售罄(最后记录价)"}
            >
              ¥{l.price_yen.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
