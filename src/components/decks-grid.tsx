"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderDecksAction } from "@/app/[game]/actions";

export type DeckCardInfo = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
  cover_image_url: string | null;
  count: number;
  updated_at: string;
  /** Display name of the deck's owner, or null for legacy unowned decks. */
  owner_name: string | null;
  /** True iff this deck belongs to the currently-logged-in user. */
  mine: boolean;
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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
          <div key={d.id} className="relative">
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
                    const rect =
                      e.currentTarget.getBoundingClientRect();
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
              d.mine
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-pointer"
            } ${
              isDragging
                ? "opacity-40 border-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
            }`}
          >
            <div className="card-thumb relative pointer-events-none">
              {d.cover_image_url ? (
                <img
                  src={d.cover_image_url}
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
              <span className="absolute top-1.5 left-1.5 px-2 py-0.5 text-xs rounded-md bg-black/75 text-white font-bold tabular-nums">
                {d.count}
              </span>
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
                className="text-[10px] text-[var(--color-muted-fg)] font-mono truncate"
                title={formatDate(d.updated_at)}
              >
                {formatDate(d.updated_at)}
              </div>
              <div className="flex items-center gap-1 text-xs font-medium group-hover:text-[var(--color-accent)] min-w-0">
                <span className="truncate">{d.name}</span>
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
