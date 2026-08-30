import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId, colorHex } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { splitSetNames } from "@/lib/card-sets";
import { Badge } from "@/components/ui/badge";
import { AddToDeck } from "@/components/add-to-deck";
import { BackLink } from "@/components/back-link";
import { CardImageGallery } from "@/components/card-image-gallery";
import { CardPriceInput } from "@/components/card-price-input";
import { EffectText } from "@/components/effect-text";
import { EvolutionCost, parseEvolutionCost } from "@/components/evolution-cost";
import { CardRulings } from "@/components/card-rulings";
import {
  buildCardView,
  FIELD_SOURCE,
  visibleFields,
  type CardView,
  type FieldKey,
} from "@/lib/cards/digimon-fields";
import { getCurrentUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";

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

  const card = digimon.getCardByCode(decoded);
  if (!card) notFound();
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  // Which field comes from which language is declared once, in
  // FIELD_SOURCE — see src/lib/cards/digimon-fields.ts. Hand-writing the
  // fallbacks here is how BT9-104 ended up showing its Japanese trait beside
  // its English attribute.
  const t = digimon.getCardTranslation(card.code, cardLang);
  const view = buildCardView(card, t);
  const decks = me
    ? digimon.listDecksWithCardQty(meId, card.id).map((d) => ({
        id: d.id,
        name: d.name,
        accent_color: d.accent_color,
        accent_color2: d.accent_color2,
        card_qty: d.card_qty,
        total: d.total,
        locked: !!d.locked,
      }))
    : [];
  // Art in the reader's language. getCardImages never interleaves languages:
  // it returns this language's variants, or the EN set when we have no art
  // for this card in that language at all.
  let variants = digimon.getCardImages(card.code, cardLang);
  const haveLocalizedArt = variants.some((v) => v.lang === cardLang);
  // No probed art in this language, but the translation row carries the
  // localized base scan — lead with it so the DEFAULT view is in-language
  // and the EN variants read as clearly-labelled extras behind it.
  if (!haveLocalizedArt && t?.image_url) {
    variants = [
      { variant: `lang-${cardLang}`, image_url: t.image_url, lang: cardLang },
      ...variants,
    ];
  }
  // Last resort: nothing probed for this code yet — use the card's own
  // image_url so the page isn't empty.
  if (variants.length === 0 && card.image_url) {
    variants = [{ variant: "", image_url: card.image_url, lang: "en" }];
  }
  // Cardrush per-illustrator market prices (each distinct printing).
  const listings = digimon.getExternalListings(card.id);
  // What the reader's own shelf holds. Null for anon — nobody's shelf.
  const owned = me ? digimon.getCardOwnership(meId, card.id) : null;
  return (
    <DetailShell game={game}>
      <DigimonDetail
        card={view}
        subName={t?.name && t.name !== card.name ? card.name : undefined}
        decks={decks}
        variants={variants}
        defaultVariant={defaultVariant}
        cardLang={cardLang}
        price={digimon.getCardPrice(meId, card.id)}
        marketListings={listings}
        rulings={digimon.getCardRulings(card.code)}
        owned={owned}
        readonly={!me}
      />
    </DetailShell>
  );
  
}

/**
 * How many of this card the reader owns, linked to the collection page filtered
 * to it — the number is only half an answer if there is no way to correct it.
 *
 * The split across printings goes in the tooltip: the total is what anyone
 * came for, and "2 张,其中 P1 一张" on the face of it is noise on every card
 * anybody owns twice.
 */
function OwnedRow({
  code,
  owned,
}: {
  code: string;
  owned: { total: number; byVariant: { variant: string; quantity: number }[] };
}) {
  const split =
    owned.byVariant.length > 1
      ? owned.byVariant
          .map(
            (v) => `${v.variant ? v.variant.replace(/^_/, "") : "原版"} ×${v.quantity}`,
          )
          .join(" · ")
      : undefined;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-medium text-[var(--color-muted-fg)] shrink-0">
        已收集
      </span>
      <Link
        href={`/digimon/collection?q=${encodeURIComponent(code)}`}
        title={split}
        className="tabular-nums hover:text-[var(--color-accent)] transition-colors"
      >
        {owned.total > 0 ? `📦 ${owned.total} 张` : "还没有"}
      </Link>
    </div>
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
      <main className="w-full mx-auto max-w-6xl px-4 sm:px-6 py-6">
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
      <div className="text-sm bg-[var(--color-muted)] rounded-md p-3 border border-[var(--color-border)]">
        <EffectText text={text} />
      </div>
    </div>
  );
}

/** Effect blocks, in print order, with the label the page shows for each. */
const TEXT_BLOCKS: [FieldKey, string][] = [
  ["main_effect", "主要效果"],
  ["security_effect", "安全区效果"],
  ["inherited_effect", "进化继承效果"],
  ["source_effect", "源池效果"],
  ["special_rule", "特别规则"],
];

const STAT_LABELS: Partial<Record<FieldKey, string>> = {
  level: "Lv",
  play_cost: "Play Cost",
  dp: "DP",
  dual_cost: "使用费用",
};

/**
 * The numeric stats this card actually has.
 *
 * A flex row rather than a fixed three-column grid: a Tamer has only a play
 * cost, and reserving two empty columns for the level and DP it will never
 * have was the layout equivalent of the data bugs above.
 */
function StatRow({ card, fields }: { card: CardView; fields: FieldKey[] }) {
  const stats = fields.filter((f) => f in STAT_LABELS);
  if (stats.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-3 p-3 rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)]">
      {stats.map((f) => (
        <Stat
          key={f}
          label={STAT_LABELS[f]!}
          value={card[FIELD_SOURCE[f].base] as string | number | null}
        />
      ))}
    </div>
  );
}

/** 形态 / 属性 / 特征 — the fields that say what KIND of card this is. */
function IdentityBlock({ card, fields }: { card: CardView; fields: FieldKey[] }) {
  const has = (f: FieldKey) => fields.includes(f);
  if (!has("form") && !has("attribute") && !has("digi_types")) return null;
  return (
    <div className="rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)] p-3 space-y-2.5">
      {has("form") || has("attribute") ? (
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {has("form") ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                形态
              </div>
              <div className="text-sm font-medium">{card.form}</div>
            </div>
          ) : null}
          {has("attribute") ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                属性
              </div>
              <div className="text-sm font-medium">{card.attribute}</div>
            </div>
          ) : null}
        </div>
      ) : null}
      {has("digi_types") ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
            特征
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {card
              .digi_types!.split("/")
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
  );
}

/** How this card gets onto the field, when it isn't simply played. */
function DigivolveBlock({
  card,
  fields,
}: {
  card: CardView;
  fields: FieldKey[];
}) {
  const has = (f: FieldKey) => fields.includes(f);
  if (!has("evolution_cost") && !has("evolution_requirements")) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      {has("evolution_cost") ? (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
            进化消费
          </span>
          <EvolutionCost value={card.evolution_cost!} />
        </div>
      ) : null}
      {has("evolution_requirements") ? (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
            进化条件
          </span>
          {/* DigiXros / special-digivolve lines carry the same bracket tokens
              as effect text, so chip them the same way. */}
          <EffectText
            text={card.evolution_requirements!}
            className="text-sm"
            />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Option half of a Dual card (デジモン/オプション).
 *
 * A Dual card is two cards printed on one, and everything else on this page
 * describes only the Digimon half. Framed as its own panel so it reads as a
 * second card rather than more effect text — which is exactly how the three
 * sources used to mangle it: English filed it under 进化元效果, Japanese threw
 * it away, Chinese kept it but labelled it wrong.
 */
function DualFace({
  card,
}: {
  card: CardView;
}) {
  if (!card.dual_effect && !card.dual_name) return null;
  const colors = card.dual_color
    ? (parseEvolutionCost(card.dual_color)?.colors ?? [])
    : [];
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-fg)]">
          选项面
        </span>
        {card.dual_name ? (
          <span className="text-sm font-semibold">{card.dual_name}</span>
        ) : null}
        {colors.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 pl-1.5 pr-2 h-6 rounded-md text-xs font-medium border border-[var(--color-border)]"
          >
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: colorHex(c) }}
            />
            {c}
          </span>
        ))}
        {card.dual_cost !== null && card.dual_cost !== undefined ? (
          <Badge>使用费用 {card.dual_cost}</Badge>
        ) : null}
      </div>
      <EffectBlock label="选项效果" text={card.dual_effect} />
      <EffectBlock label="双力规则" text={card.dual_rule} />
    </div>
  );
}

/**
 * The "plugged in" half of a Link card (リンク).
 *
 * A Link card is played sideways underneath another Digimon and contributes
 * these three things to it. That is a different relationship from an inherited
 * effect (what a card grants the Digimon stacked ON TOP of it), which is
 * exactly the distinction every source lost: the JP scrape dropped all three
 * blocks, and both English sources folded them into 进化元效果.
 */
function LinkFace({
  card,
}: {
  card: CardView;
}) {
  if (!card.link_requirement && !card.link_effect && card.link_dp === null)
    return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-fg)]">
          链接
        </span>
        {card.link_dp !== null && card.link_dp !== undefined ? (
          <Badge>DP +{card.link_dp}</Badge>
        ) : null}
      </div>
      <EffectBlock
        label="链接条件"
        text={card.link_requirement}
       
      />
      <EffectBlock
        label="链接中效果"
        text={card.link_effect}
       
      />
    </div>
  );
}

function DigimonDetail({
  card,
  subName,
  decks,
  variants,
  defaultVariant,
  cardLang,
  price,
  marketListings,
  rulings,
  owned,
  readonly,
}: {
  card: CardView;
  /** Original EN name, shown small under a translated title. */
  subName?: string;
  rulings: import("@/lib/db/rulings-ddl").CardRuling[];
  decks: {
    id: string;
    name: string;
    accent_color: string;
    accent_color2: string | null;
    card_qty: number;
    total: number;
    /** Closed to edits — listed with a 🔒 and no controls. */
    locked: boolean;
  }[];
  variants: digimon.CardImageVariant[];
  defaultVariant?: string;
  /** Reader's card language, so the gallery can flag non-native art. */
  cardLang: string;
  price: number | null;
  marketListings: digimon.ExternalListing[];
  /** The reader's own copies of this card; null when nobody is signed in. */
  owned: { total: number; byVariant: { variant: string; quantity: number }[] } | null;
  /** Anon viewer: hide the editable price input + the AddToDeck widget. */
  readonly: boolean;
}) {
  const shown = visibleFields(card);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
      <div className="space-y-3">
        <CardImageGallery
          name={card.name}
          variants={variants}
          defaultVariant={defaultVariant}
          cardLang={cardLang}
        />
        {/* Everything in this panel is conditional, so the panel has to be
            too — an anonymous reader looking at a card with no market listings
            and no price got an empty bordered box. */}
        {!readonly || marketListings.length > 0 || price != null ? (
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
              {owned ? <OwnedRow code={card.code} owned={owned} /> : null}
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
        ) : null}
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

        {/* Everything below is driven by `visibleFields`, so a card only ever
            shows the fields its own type prints — plus any field that
            unexpectedly holds a value, which is kept rather than hidden. */}
        <StatRow card={card} fields={shown} />
        <IdentityBlock card={card} fields={shown} />
        <DigivolveBlock card={card} fields={shown} />

        {TEXT_BLOCKS.filter(([f]) => shown.includes(f)).map(([f, label]) => (
          <EffectBlock
            key={f}
            label={label}
            text={card[FIELD_SOURCE[f].base] as string | null}
            />
        ))}

        <DualFace card={card} />

        <LinkFace card={card} />

        <SetList sets={splitSetNames(card.set_names)} />

        <CardRulings rulings={rulings} />

        <div className="grid grid-cols-2 gap-3 text-xs text-[var(--color-muted-fg)] pt-3 border-t border-[var(--color-border)]">
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
        title="Cardrush 最低价(品相 A- 以上)"
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

/**
 * Products this card can be pulled from. A list rather than the raw
 * semicolon-joined string: promos run to seven entries and read as a wall of
 * text otherwise.
 */
function SetList({ sets }: { sets: string[] }) {
  if (sets.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)] mb-1">
        收录信息{sets.length > 1 ? `（${sets.length} 个产品）` : ""}
      </div>
      <ul className="text-sm bg-[var(--color-muted)] rounded-md p-3 border border-[var(--color-border)] space-y-1">
        {sets.map((s) => (
          <li key={s} className="flex items-start gap-2">
            <span aria-hidden className="text-[var(--color-muted-fg)]">
              ·
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
