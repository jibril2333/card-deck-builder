"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type DeckForDiff = {
  id: string;
  name: string;
  accent_color: string;
  mine: boolean;
  owner_name: string | null;
  cards: {
    code: string;
    name: string;
    image_url: string | null;
    quantity: number;
  }[];
};

/**
 * "Pick two decks and show what's different" panel.
 *
 * Card identity matches on `code` (exact print). Two decks that share the
 * same card in different parallel variants will surface as "only in A" /
 * "only in B" — by design: a deck listing `BT1-009_p1` is materially
 * different from one listing `BT1-009` even though they're the same
 * Pokémon-equivalent. If users want logical-identity matching later, that's
 * a separate feature.
 *
 * Three buckets:
 *   - 只在 A: codes in A but not B
 *   - 只在 B: codes in B but not A
 *   - 数量不同: codes in both with different `quantity` (shown as A→B)
 *
 * Cards present in both with identical quantities are hidden — they're the
 * boring rows and would drown the actual diff.
 */
export function DeckDiffTool({
  game,
  decks,
  onClose,
}: {
  game: string;
  decks: DeckForDiff[];
  onClose: () => void;
}) {
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  const a = decks.find((d) => d.id === aId) ?? null;
  const b = decks.find((d) => d.id === bId) ?? null;

  const { onlyA, onlyB, diffQty, sameKinds, sameDeckPicked } = useMemo(() => {
    if (!a || !b) {
      return {
        onlyA: [],
        onlyB: [],
        diffQty: [] as Array<DeckForDiff["cards"][number] & { qtyB: number }>,
        sameKinds: 0,
        sameDeckPicked: false,
      };
    }
    const mapA = new Map(a.cards.map((c) => [c.code, c]));
    const mapB = new Map(b.cards.map((c) => [c.code, c]));
    const onlyA = a.cards
      .filter((c) => !mapB.has(c.code))
      .sort((x, y) => x.code.localeCompare(y.code));
    const onlyB = b.cards
      .filter((c) => !mapA.has(c.code))
      .sort((x, y) => x.code.localeCompare(y.code));
    const diffQty: Array<DeckForDiff["cards"][number] & { qtyB: number }> = [];
    let sameKinds = 0;
    for (const ca of a.cards) {
      const cb = mapB.get(ca.code);
      if (!cb) continue;
      if (cb.quantity !== ca.quantity) {
        diffQty.push({ ...ca, qtyB: cb.quantity });
      } else {
        sameKinds += 1;
      }
    }
    diffQty.sort((x, y) => x.code.localeCompare(y.code));
    return {
      onlyA,
      onlyB,
      diffQty,
      sameKinds,
      sameDeckPicked: a.id === b.id,
    };
  }, [a, b]);

  function swap() {
    setAId(bId);
    setBId(aId);
  }

  return (
    <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">🔀 卡组对比</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] text-sm cursor-pointer"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-[var(--color-muted-fg)] flex-1 min-w-0">
          点击两个卡组选 A 和 B,下面列出&ldquo;只在 A / 只在 B / 数量不同&rdquo;的差异。完全相同的卡片省略。
        </p>
        <button
          type="button"
          onClick={swap}
          disabled={!aId || !bId}
          className="shrink-0 text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-[var(--color-muted)]"
          title="交换 A 和 B"
        >
          ⇅ 交换 A/B
        </button>
      </div>

      <DeckPickerSingle
        decks={decks}
        aId={aId}
        bId={bId}
        onChange={(next) => {
          setAId(next.aId);
          setBId(next.bId);
        }}
      />

      {!a || !b ? (
        <div className="text-xs text-[var(--color-muted-fg)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-md">
          各选一个卡组开始对比
        </div>
      ) : sameDeckPicked ? (
        <div className="text-xs text-[var(--color-muted-fg)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-md">
          选的是同一个卡组,没什么可比的
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted-fg)]">
            <div>
              只在 A: <b className="text-[var(--color-fg)] tabular-nums">{onlyA.length}</b> · 只在 B:{" "}
              <b className="text-[var(--color-fg)] tabular-nums">{onlyB.length}</b> · 数量不同:{" "}
              <b className="text-[var(--color-fg)] tabular-nums">{diffQty.length}</b>
            </div>
            <div>
              相同 <b className="text-[var(--color-fg)] tabular-nums">{sameKinds}</b> 种
            </div>
          </div>

          {onlyA.length === 0 && onlyB.length === 0 && diffQty.length === 0 ? (
            <div className="text-xs text-green-600 dark:text-green-400 py-3 text-center">
              🎉 两个卡组的卡完全相同
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <DiffColumn
                game={game}
                title={`只在 A`}
                subtitle={a.name}
                cards={onlyA.map((c) => ({
                  code: c.code,
                  name: c.name,
                  image_url: c.image_url,
                  badge: `${c.quantity}×`,
                  badgeClass: "text-[var(--color-fg)]",
                }))}
                accent={a.accent_color}
              />
              <DiffColumn
                game={game}
                title="数量不同"
                subtitle="A → B"
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
                accent={null}
              />
              <DiffColumn
                game={game}
                title="只在 B"
                subtitle={b.name}
                cards={onlyB.map((c) => ({
                  code: c.code,
                  name: c.name,
                  image_url: c.image_url,
                  badge: `${c.quantity}×`,
                  badgeClass: "text-[var(--color-fg)]",
                }))}
                accent={b.accent_color}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Single row of deck pills serving BOTH A and B slots.
 *
 * Click cycling:
 *   - pill is currently A     → deselect A
 *   - pill is currently B     → deselect B
 *   - pill is unselected:
 *       A empty → assign to A
 *       else B empty → assign to B
 *       else (both filled) → replace B with this pill
 *
 * The "replace B" branch keeps interaction continuous when users are
 * iterating against a fixed A ("how does my Red deck differ from this
 * one… now from this one… now from this one"). If the user wants to
 * replace A instead, the ⇅ swap button + a click on the to-be-replaced
 * pill gives a 2-click path.
 *
 * Visual: selected pills get an accent ring plus a small "A" / "B" badge
 * on the right edge. Color is intentionally the same for both — the
 * letter badge does the labeling, not the hue.
 */
function DeckPickerSingle({
  decks,
  aId,
  bId,
  onChange,
}: {
  decks: DeckForDiff[];
  aId: string | null;
  bId: string | null;
  onChange: (next: { aId: string | null; bId: string | null }) => void;
}) {
  function click(id: string) {
    if (aId === id) return onChange({ aId: null, bId });
    if (bId === id) return onChange({ aId, bId: null });
    if (aId === null) return onChange({ aId: id, bId });
    if (bId === null) return onChange({ aId, bId: id });
    // Both filled — newest click takes B.
    return onChange({ aId, bId: id });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {decks.map((d) => {
        const slot = aId === d.id ? "A" : bId === d.id ? "B" : null;
        const isOn = slot !== null;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => click(d.id)}
            className={`px-2.5 h-8 rounded-md border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
              isOn
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-fg)]"
                : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)]"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: d.accent_color }}
            />
            <span>{d.name}</span>
            {!d.mine && d.owner_name ? (
              <span className="text-[10px] text-[var(--color-muted-fg)]">
                · {d.owner_name}
              </span>
            ) : null}
            {slot ? (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold text-white bg-[var(--color-accent)]">
                {slot}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** One of the three diff columns (only-A / only-B / diff-qty). */
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
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
      <div className="px-2.5 py-1.5 border-b border-[var(--color-border)] flex items-center gap-1.5">
        {accent ? (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: accent }}
          />
        ) : null}
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[10px] text-[var(--color-muted-fg)] truncate">
          {subtitle}
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-muted-fg)] tabular-nums shrink-0">
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted-fg)] p-3 text-center">
          ——
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
    </div>
  );
}
