import Link from "next/link";

export type DiffCard = {
  code: string;
  name: string;
  image_url: string | null;
  quantity: number;
};

export type DeckDiff = {
  onlyA: DiffCard[];
  onlyB: DiffCard[];
  diffQty: (DiffCard & { qtyB: number })[];
  sameKinds: number;
};

/**
 * What differs between two decks.
 *
 * Card identity matches on `code` (exact print). Two decks that share the
 * same card in different parallel variants surface as "only in A" / "only in
 * B" — by design: a deck listing `BT1-009_p1` is materially different from
 * one listing `BT1-009`. Logical-identity matching would be its own feature.
 *
 * Cards present in both with identical quantities are counted but not
 * listed — they're the boring rows and would drown the actual diff.
 */
export function computeDeckDiff(
  aCards: DiffCard[],
  bCards: DiffCard[],
): DeckDiff {
  const mapA = new Map(aCards.map((c) => [c.code, c]));
  const mapB = new Map(bCards.map((c) => [c.code, c]));
  const byCode = (x: DiffCard, y: DiffCard) => x.code.localeCompare(y.code);
  const onlyA = aCards.filter((c) => !mapB.has(c.code)).sort(byCode);
  const onlyB = bCards.filter((c) => !mapA.has(c.code)).sort(byCode);
  const diffQty: (DiffCard & { qtyB: number })[] = [];
  let sameKinds = 0;
  for (const ca of aCards) {
    const cb = mapB.get(ca.code);
    if (!cb) continue;
    if (cb.quantity !== ca.quantity) diffQty.push({ ...ca, qtyB: cb.quantity });
    else sameKinds += 1;
  }
  diffQty.sort(byCode);
  return { onlyA, onlyB, diffQty, sameKinds };
}

/**
 * The diff, rendered on the deck page above its card grid.
 *
 * Left deck is always the deck you are on, so the columns can be labelled
 * 本卡组 / 对比卡组 instead of A / B — with a fixed left side there is no
 * pair to keep straight, and no swap button to need.
 *
 * Server component: the whole thing is a function of `?compare=<deckId>`,
 * so picking a deck is a navigation and the result arrives rendered.
 */
export function DeckDiffPanel({
  game,
  a,
  b,
  closeHref,
}: {
  game: string;
  a: { name: string; accent: string; cards: DiffCard[] };
  b: {
    name: string;
    accent: string;
    ownerName: string | null;
    cards: DiffCard[];
  };
  closeHref: string;
}) {
  const { onlyA, onlyB, diffQty, sameKinds } = computeDeckDiff(a.cards, b.cards);
  const identical =
    onlyA.length === 0 && onlyB.length === 0 && diffQty.length === 0;

  return (
    <section
      aria-label="卡组对比"
      className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
          🔀 对比
          <span className="text-[var(--color-muted-fg)] font-normal truncate">
            {b.name}
            {b.ownerName ? ` · ${b.ownerName}` : ""}
          </span>
        </h3>
        <Link
          href={closeHref}
          replace
          scroll={false}
          aria-label="结束对比"
          className="ml-auto shrink-0 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] text-sm px-1"
        >
          ×
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-2.5 text-xs text-[var(--color-muted-fg)]">
        <div>
          本卡组独有{" "}
          <b className="text-[var(--color-fg)] tabular-nums">{onlyA.length}</b>{" "}
          · 数量不同{" "}
          <b className="text-[var(--color-fg)] tabular-nums">
            {diffQty.length}
          </b>{" "}
          · 对比卡组独有{" "}
          <b className="text-[var(--color-fg)] tabular-nums">{onlyB.length}</b>
        </div>
        <div>
          相同 <b className="text-[var(--color-fg)] tabular-nums">{sameKinds}</b>{" "}
          种
        </div>
      </div>

      {identical ? (
        <div className="text-xs text-[var(--color-muted-fg)] py-3 text-center">
          两副卡组内容相同
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <DiffColumn
            game={game}
            title="本卡组独有"
            subtitle={a.name}
            accent={a.accent}
            cards={onlyA.map((c) => ({
              code: c.code,
              name: c.name,
              image_url: c.image_url,
              badge: `${c.quantity}×`,
              badgeClass: "text-[var(--color-fg)]",
            }))}
          />
          <DiffColumn
            game={game}
            title="数量不同"
            subtitle="本卡组 → 对比卡组"
            accent={null}
            cards={diffQty.map((c) => ({
              code: c.code,
              name: c.name,
              image_url: c.image_url,
              badge: `${c.quantity} → ${c.qtyB}`,
              badgeClass:
                c.qtyB > c.quantity
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-amber-600 dark:text-amber-400",
            }))}
          />
          <DiffColumn
            game={game}
            title="对比卡组独有"
            subtitle={b.name}
            accent={b.accent}
            cards={onlyB.map((c) => ({
              code: c.code,
              name: c.name,
              image_url: c.image_url,
              badge: `${c.quantity}×`,
              badgeClass: "text-[var(--color-fg)]",
            }))}
          />
        </div>
      )}
    </section>
  );
}

/** One of the three diff columns. */
function DiffColumn({
  game,
  title,
  subtitle,
  cards,
  accent,
}: {
  game: string;
  title: string;
  subtitle: string;
  cards: {
    code: string;
    name: string;
    image_url: string | null;
    badge: string;
    badgeClass: string;
  }[];
  accent: string | null;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden"
    >
      <div className="px-2.5 py-1.5 border-b border-[var(--color-border)] flex items-center gap-1.5">
        {accent ? (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: accent }}
          />
        ) : null}
        <span className="text-xs font-semibold shrink-0">{title}</span>
        <span className="text-[10px] text-[var(--color-muted-fg)] truncate">
          {subtitle}
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-muted-fg)] tabular-nums shrink-0">
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted-fg)] p-3 text-center">
          0 张
        </div>
      ) : (
        <div className="p-1.5 flex flex-col gap-1">
          {cards.map((c) => (
            <Link
              key={c.code}
              href={`/${game}/card/${c.code
                .split("/")
                .map(encodeURIComponent)
                .join("/")}`}
              className="group rounded border border-transparent hover:border-[var(--color-border)] bg-transparent hover:bg-[var(--color-muted)]/40 flex items-center gap-2 p-1"
            >
              <div className="w-8 shrink-0 aspect-[5/7] rounded overflow-hidden bg-[var(--color-muted)]">
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt={c.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono text-[var(--color-muted-fg)] truncate">
                  {c.code}
                </div>
                <div className="text-xs font-medium truncate group-hover:text-[var(--color-accent)]">
                  {c.name}
                </div>
              </div>
              <div
                className={`text-[11px] font-semibold tabular-nums shrink-0 ${c.badgeClass}`}
              >
                {c.badge}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
