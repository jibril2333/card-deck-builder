"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustCardCollectionAction,
  setCardCollectionAction,
} from "@/app/[game]/actions";
import { colorHex } from "@/lib/games";

export type CollectionRow = {
  card_id: string;
  code: string;
  /** "" base, "_P1" / "_P2" … for Digimon parallels. UA always "". */
  variant: string;
  name: string;
  color: string | null;
  rarity: string | null;
  image_url: string | null;
  quantity: number;
};

export function CollectionGrid({
  game,
  rows,
}: {
  game: string;
  rows: CollectionRow[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {rows.map((row) => (
        <CollectionCard
          key={`${row.card_id}|${row.variant}`}
          game={game}
          row={row}
        />
      ))}
    </div>
  );
}

function CollectionCard({
  game,
  row,
}: {
  game: string;
  row: CollectionRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    row,
    (state: CollectionRow, patch: Partial<CollectionRow>): CollectionRow => ({
      ...state,
      ...patch,
    }),
  );

  function dispatch(
    action: (fd: FormData) => Promise<void>,
    extra: Record<string, string>,
    nextQty: number,
  ) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("card_id", row.card_id);
    fd.set("variant", row.variant);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      setOptimistic({ quantity: nextQty });
      await action(fd);
      router.refresh();
    });
  }

  const qty = optimistic.quantity;
  // Link points at the base card detail. Use `?v=` for Digimon variants so the
  // image gallery defaults to the right alt-art.
  const codeForLink = row.code; // base code (Digimon: BT1-001; UA: full code w/ _p1)
  const href = `/${game}/card/${codeForLink
    .split("/")
    .map(encodeURIComponent)
    .join("/")}${row.variant ? `?v=${encodeURIComponent(row.variant)}` : ""}`;

  // Variant label: "原画" for base, the raw suffix (without leading _) for parallels.
  const variantLabel = row.variant
    ? row.variant.replace(/^_/, "")
    : "原画";

  return (
    <div
      className={`group rounded-lg overflow-hidden border bg-[var(--color-card)] border-[var(--color-border)] hover:border-[var(--color-fg)] transition-colors ${
        pending ? "opacity-90" : ""
      }`}
    >
      <Link href={href} className="block relative">
        <div className="card-thumb relative">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt={row.name}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--color-muted-fg)] text-xs">
              no image
            </div>
          )}
          <span className="absolute top-1.5 left-1.5 px-2 py-0.5 text-xs rounded-md bg-black/75 text-white font-bold tabular-nums">
            ×{qty}
          </span>
          {row.variant ? (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-[var(--color-accent)]/90 text-white font-bold">
              {variantLabel}
            </span>
          ) : null}
          {row.rarity ? (
            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-black/65 text-white font-medium">
              {row.rarity}
            </span>
          ) : null}
        </div>

        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-fg)] font-mono">
            {row.color ? (
              <span
                className="chip-dot shrink-0"
                style={{ background: colorHex(row.color) }}
              />
            ) : null}
            <span className="truncate">{row.code}</span>
            {row.variant ? (
              <span className="text-[var(--color-accent)]">
                {row.variant.replace(/^_/, "")}
              </span>
            ) : null}
          </div>
          <div className="text-xs font-medium truncate group-hover:text-[var(--color-accent)]">
            {row.name}
          </div>
        </div>
      </Link>

      <div className="flex items-stretch border-t border-[var(--color-border)] divide-x divide-[var(--color-border)]">
        <button
          type="button"
          onClick={() =>
            dispatch(
              adjustCardCollectionAction,
              { delta: "-1" },
              Math.max(0, qty - 1),
            )
          }
          disabled={pending || qty === 0}
          className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="−1"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          defaultValue={qty}
          key={`q-${qty}`}
          onBlur={(e) => {
            const v = Math.max(0, Number(e.currentTarget.value));
            if (v !== qty)
              dispatch(setCardCollectionAction, { quantity: String(v) }, v);
          }}
          className="w-10 h-8 text-center text-sm bg-transparent tabular-nums focus:outline-none focus:bg-[var(--color-muted)]"
        />
        <button
          type="button"
          onClick={() =>
            dispatch(
              adjustCardCollectionAction,
              { delta: "1" },
              qty + 1,
            )
          }
          disabled={pending}
          className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
          title="+1"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch(
              setCardCollectionAction,
              { quantity: "0" },
              0,
            )
          }
          disabled={pending || qty === 0}
          className="w-8 h-8 hover:bg-red-500/10 text-red-500 text-sm cursor-pointer disabled:opacity-40"
          title="移除"
        >
          ×
        </button>
      </div>
    </div>
  );
}
