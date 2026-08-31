"use client";

import { cardImageSrc } from "@/lib/card-image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderDecksAction, setDeckPinnedAction } from "@/app/[game]/actions";
import {
  deckCountBadge,
  deckIsComplete,
  DECK_TARGET,
} from "@/lib/deck-legality";

/**
 * The deck-name status dots.
 *
 * Two different kinds of "not ready", so two colours rather than one warning
 * sign: red is a rules problem (the banlist disagrees with this deck), yellow
 * is just unfinished (it isn't 50 + ≤5 yet). A deck can be both, and then it
 * shows both — collapsing them would hide the one that takes work to fix.
 */
function StatusDot({
  color,
  label,
  title,
}: {
  color: string;
  label: string;
  title: string;
}) {
  return (
    <span
      className={`shrink-0 w-2 h-2 rounded-full ${color}`}
      title={title}
      aria-label={label}
      role="img"
    />
  );
}

export type DeckCardInfo = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
  cover_image_url: string | null;
  counts: { main: number; egg: number };
  /** How many cards in it the current banlist disagrees with. */
  issues: number;
  /** Closed to edits. */
  locked: boolean;
  updated_at: string;
  /** Display name of the deck's owner, or null for legacy unowned decks. */
  owner_name: string | null;
  /** True iff this deck belongs to the currently-logged-in user. */
  mine: boolean;
  /** True for decks the owner actually plays (vs. just keeps on record). */
  pinned: boolean;
  /** True iff every card in this deck is already covered by the user's
   *  card_collection (sum across variants). Renders a green ✓ next to the
   *  deck name. Only meaningful for `mine` decks. */
  complete: boolean;
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DecksGrid({
  game,
  decks,
}: {
  game: string;
  decks: DeckCardInfo[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState<DeckCardInfo[]>(decks);
  const [dragId, setDragId] = useState<string | null>(null);
  /**
   * Where the dragged tile will land. We render a vertical line on the
   * `side` edge of `id` to preview the insertion. `null` while no valid
   * target is hovered.
   */
  const [insertAt, setInsertAt] = useState<{
    id: string;
    side: "before" | "after";
  } | null>(null);
  const draggedRef = useRef(false);

  // Keep local order in sync if server data changes (e.g. new deck added).
  // React 19 docs' recommended pattern: compare during render and call
  // setState conditionally, rather than using a useEffect. Avoids the
  // cascading-render that effect-driven syncs cause.
  const [lastDecksProp, setLastDecksProp] = useState(decks);
  if (decks !== lastDecksProp) {
    setLastDecksProp(decks);
    setOrder(decks);
  }

  function togglePinned(d: DeckCardInfo) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", d.id);
    fd.set("pinned", d.pinned ? "0" : "1");
    startTransition(async () => {
      await setDeckPinnedAction(fd);
      // The tile moves between the 主力 / 其他 sections, which are separate
      // grids rendered by the server — refresh rather than trying to animate
      // it across two component trees.
      router.refresh();
    });
  }

  function persist(next: DeckCardInfo[]) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("ids", next.map((d) => d.id).join(","));
    startTransition(async () => {
      await reorderDecksAction(fd);
      router.refresh();
    });
  }

  /**
   * Insert the dragged deck at the previewed position. We splice it out of
   * its current spot first, then splice into the target slot — taking care
   * that removing the source shifts the target index down by 1 when the
   * source was before the target.
   */
  function commitDrop() {
    if (!dragId || !insertAt) {
      setDragId(null);
      setInsertAt(null);
      return;
    }
    const from = order.findIndex((d) => d.id === dragId);
    let to = order.findIndex((d) => d.id === insertAt.id);
    if (from === -1 || to === -1) {
      setDragId(null);
      setInsertAt(null);
      return;
    }
    if (insertAt.side === "after") to += 1;
    if (from < to) to -= 1; // account for removing source first
    if (from === to) {
      // No effective movement
      setDragId(null);
      setInsertAt(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    setDragId(null);
    setInsertAt(null);
    persist(next);
  }

  return (
    <div className="card-grid">
      {order.map((d) => {
        const isDragging = dragId === d.id;
        const showLineLeft =
          dragId !== null &&
          dragId !== d.id &&
          insertAt?.id === d.id &&
          insertAt.side === "before";
        const showLineRight =
          dragId !== null &&
          dragId !== d.id &&
          insertAt?.id === d.id &&
          insertAt.side === "after";
        return (
          // Wrapper: hosts the drop-preview line in the gap between tiles.
          // The inner <Link> has `overflow-hidden` to clip the rounded
          // corners — if we put the line on the Link directly, anything
          // positioned outside its box gets clipped invisible. The wrapper
          // is `relative` but doesn't clip, so we can paint the line into
          // the grid's gap (12px) centered between tiles.
          // role/aria-label: the star button lives outside the <Link>, so
          // "this deck's star" has no shared ancestor to scope to without one.
          <div
            key={d.id}
            role="group"
            aria-label={d.name}
            className="relative group"
          >
            {/* Sits OUTSIDE the <Link>: a <button> nested in an <a> is invalid
                markup and the click would navigate. Own decks only — you
                can't re-file someone else's deck. */}
            {d.mine ? (
              <button
                type="button"
                onClick={() => togglePinned(d)}
                aria-pressed={d.pinned}
                title={d.pinned ? "取消主力" : "标记为主力卡组"}
                className={`absolute top-1.5 right-1.5 z-20 w-7 h-7 rounded-md flex items-center justify-center text-sm cursor-pointer transition-all ${
                  d.pinned
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow"
                    : "hover-reveal bg-black/60 text-white/70 hover:bg-black/80 hover:text-white"
                }`}
              >
                {d.pinned ? "★" : "☆"}
              </button>
            ) : null}
            {showLineLeft ? (
              <span
                aria-hidden
                className="absolute top-0 bottom-0 w-1.5 rounded-full bg-[var(--color-accent)] pointer-events-none z-10 shadow-[0_0_10px_var(--color-accent)]"
                style={{ left: "-7.5px" }}
              />
            ) : null}
            {showLineRight ? (
              <span
                aria-hidden
                className="absolute top-0 bottom-0 w-1.5 rounded-full bg-[var(--color-accent)] pointer-events-none z-10 shadow-[0_0_10px_var(--color-accent)]"
                style={{ right: "-7.5px" }}
              />
            ) : null}
            <Link
              href={`/${game}/decks/${d.id}`}
              draggable={d.mine}
              onDragStart={
                d.mine
                  ? (e) => {
                      draggedRef.current = true;
                      setDragId(d.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", d.id);
                    }
                  : undefined
              }
              onDragEnd={
                d.mine
                  ? () => {
                      setDragId(null);
                      setInsertAt(null);
                      setTimeout(() => (draggedRef.current = false), 0);
                    }
                  : undefined
              }
              onDragOver={
                d.mine
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      // Decide before/after based on which half of the tile the
                      // pointer is in. `currentTarget` is the <Link> wrapper,
                      // so its bounding box matches what the user sees.
                      const rect = e.currentTarget.getBoundingClientRect();
                      const side =
                        e.clientX - rect.left < rect.width / 2
                          ? "before"
                          : "after";
                      if (
                        !insertAt ||
                        insertAt.id !== d.id ||
                        insertAt.side !== side
                      ) {
                        setInsertAt({ id: d.id, side });
                      }
                    }
                  : undefined
              }
              onDrop={
                d.mine
                  ? (e) => {
                      e.preventDefault();
                      commitDrop();
                    }
                  : undefined
              }
              onClick={(e) => {
                // Suppress the click that browsers may fire right after a drag
                if (draggedRef.current) {
                  e.preventDefault();
                }
              }}
              className={`group relative rounded-lg border bg-[var(--color-card)] transition-all overflow-hidden block ${
                d.mine ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              } ${
                isDragging
                  ? "opacity-40 border-[var(--color-accent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
              }`}
            >
              <div className="card-thumb relative pointer-events-none">
                {d.cover_image_url ? (
                  <img
                    src={cardImageSrc(d.cover_image_url)}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-3xl"
                    style={{
                      background: d.accent_color2
                        ? `linear-gradient(135deg, ${d.accent_color}55, ${d.accent_color2}55)`
                        : `linear-gradient(135deg, ${d.accent_color}44, ${d.accent_color}11)`,
                    }}
                  >
                    <span
                      className="font-bold opacity-80"
                      style={{ color: d.accent_color }}
                    >
                      {d.name.slice(0, 2)}
                    </span>
                  </div>
                )}
                {/* INSIDE the thumb, so `.card-thumb`'s overflow:hidden clips
                  it to the same rounded corners the art has — a bar sitting
                  below the image would run straight past where the image has
                  already curved away. */}
                <span
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{
                    background: d.accent_color2
                      ? `linear-gradient(90deg, ${d.accent_color}, ${d.accent_color2})`
                      : d.accent_color,
                  }}
                />
                {/* Only while the deck is unfinished — see deckCountBadge. A
                  legal deck says nothing here and gives its artwork the corner
                  back. */}
                {deckCountBadge(d.counts) ? (
                  <span
                    className="absolute top-1.5 left-1.5 px-2 py-0.5 text-xs rounded-md bg-black/75 text-white font-bold tabular-nums"
                    title={`主卡组 ${d.counts.main} / ${DECK_TARGET.main} · 蛋卡 ${d.counts.egg} / ${DECK_TARGET.egg}`}
                  >
                    {deckCountBadge(d.counts)}
                  </span>
                ) : null}
                {/* The banlist warning lives on the deck NAME (see StatusDot),
                  not up here — a corner badge had to fight the owner badge for
                  the same spot, and one of them lost. */}
                {!d.mine && d.owner_name ? (
                  <span
                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-black/65 text-white font-medium max-w-[80%] truncate"
                    title={`所有者:${d.owner_name}`}
                  >
                    👁 {d.owner_name}
                  </span>
                ) : null}
              </div>
              <div className="px-2 py-1.5 pointer-events-none">
                <div
                  className="card-code text-[10px] text-[var(--color-muted-fg)] font-mono truncate"
                  title={formatDate(d.updated_at)}
                >
                  {formatDate(d.updated_at)}
                </div>
                <div className="card-name flex items-center gap-1 text-xs font-medium group-hover:text-[var(--color-accent)] min-w-0">
                  <span className="truncate">{d.name}</span>
                  {d.locked ? (
                    <span
                      className="shrink-0 text-[10px]"
                      title="已锁定 —— 改不了,直到在卡组页解锁"
                      aria-label="已锁定"
                    >
                      🔒
                    </span>
                  ) : null}
                  {d.issues > 0 ? (
                    <StatusDot
                      color="bg-red-500"
                      label="不符合禁限表"
                      title={`${d.issues} 张卡违反现行禁限表 —— 打开卡组查看,系统不会自动改`}
                    />
                  ) : null}
                  {!deckIsComplete(d.counts) ? (
                    <StatusDot
                      color="bg-amber-400"
                      label="缺卡"
                      title={`还没配齐:主卡组 ${d.counts.main} / ${DECK_TARGET.main} · 蛋卡 ${d.counts.egg} / ${DECK_TARGET.egg}`}
                    />
                  ) : null}
                  {d.mine && d.complete ? (
                    <span
                      className="shrink-0 text-green-600 dark:text-green-400 font-bold"
                      title="所有卡牌都已收集齐"
                      aria-label="已收齐"
                    >
                      ✓
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
