"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useComposition } from "@/lib/use-composition";
import {
  addDeckAdjustmentAction,
  removeDeckAdjustmentAction,
  setDeckAdjustmentNoteAction,
  setDeckAdjustmentQuantityAction,
  searchCardsAction,
} from "@/app/[game]/actions";

export type Adjustment = {
  id: string;
  card_id: string;
  kind: "add" | "remove";
  /** How many copies the note is about. */
  quantity: number;
  note: string | null;
  code: string;
  name: string;
  image_url: string | null;
};

type Hit = { id: string; code: string; name: string; image_url: string | null };

/**
 * A per-deck scratch list of swaps you're thinking about: cards to try, cards
 * to cut, each with an optional one-line reason.
 *
 * It participates in NOTHING else — not the 主卡组 count, the price total, the
 * shortfall tool, the shared pool, deck limits or export. That isolation is
 * structural: the rows live in their own `deck_adjustments` table, and every
 * one of those features reads `deck_cards`.
 *
 * Owner-only; a friend viewing the deck doesn't see your half-formed plans.
 */
export function DeckAdjustments({
  game,
  deckId,
  items,
  lang,
}: {
  game: string;
  deckId: string;
  items: Adjustment[];
  /** Reader's card language, so picker results read like the rest of the page. */
  lang: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced lookup. The action itself ignores queries under 2 chars, so
  // typing a single letter never hits the DB.
  //
  // `composing` is a dependency, not just a guard: skipping the search while
  // an IME is open is only half of it — the effect also has to re-run once the
  // word is committed, or the finished query never gets searched.
  const { composing, bind: imeBind } = useComposition((final) => setQ(final));
  useEffect(() => {
    if (composing) return;
    const query = q.trim();
    let cancelled = false;
    // Everything happens inside the timeout: setting state synchronously in an
    // effect body cascades renders (and eslint rejects it).
    const t = setTimeout(async () => {
      if (query.length < 2) {
        if (!cancelled) setHits([]);
        return;
      }
      if (!cancelled) setSearching(true);
      try {
        const r = await searchCardsAction(game, query, { lang });
        if (!cancelled) setHits(r);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, composing, game, lang]);

  function run(action: (fd: FormData) => Promise<void>, fd: FormData) {
    fd.set("game", game);
    fd.set("deck_id", deckId);
    startTransition(async () => {
      await action(fd);
      router.refresh();
    });
  }

  function add(cardId: string, kind: "add" | "remove") {
    const fd = new FormData();
    fd.set("card_id", cardId);
    fd.set("kind", kind);
    run(addDeckAdjustmentAction, fd);
    setQ("");
    setHits([]);
  }

  const toAdd = items.filter((i) => i.kind === "add");
  const toCut = items.filter((i) => i.kind === "remove");

  return (
    <section className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <header className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold">调整备忘</h2>
        <span className="text-[11px] text-[var(--color-muted-fg)]">
          只是记下想怎么改（含张数）· 不计入卡组张数、价格、缺卡、共享卡池和导出
        </span>
      </header>

      <div className="relative mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          {...imeBind}
          placeholder="搜卡片（名称或编号），再选加入哪一栏…"
          className="w-full h-9 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-sm"
        />
        {q.trim().length >= 2 ? (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl">
            {searching && hits.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                搜索中…
              </div>
            ) : hits.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                没有匹配的卡
              </div>
            ) : (
              hits.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-muted)]"
                >
                  {h.image_url ? (
                    <img
                      src={h.image_url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-7 aspect-[5/7] object-cover rounded shrink-0"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono text-[var(--color-muted-fg)]">
                      {h.code}
                    </div>
                    <div className="text-xs truncate">{h.name}</div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => add(h.id, "add")}
                    className="text-[11px] px-2 h-7 rounded border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50"
                  >
                    ＋想加
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => add(h.id, "remove")}
                    className="text-[11px] px-2 h-7 rounded border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 cursor-pointer disabled:opacity-50"
                  >
                    －想减
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Column
          title="考虑加入"
          accent="text-emerald-500"
          items={toAdd}
          game={game}
          pending={pending}
          run={run}
        />
        <Column
          title="考虑换下"
          accent="text-amber-500"
          items={toCut}
          game={game}
          pending={pending}
          run={run}
        />
      </div>
    </section>
  );
}

function Column({
  title,
  accent,
  items,
  game,
  pending,
  run,
}: {
  title: string;
  accent: string;
  items: Adjustment[];
  game: string;
  pending: boolean;
  run: (action: (fd: FormData) => Promise<void>, fd: FormData) => void;
}) {
  return (
    <div>
      <div className={`text-xs font-semibold mb-1.5 ${accent}`}>
        {title}{" "}
        <span className="text-[var(--color-muted-fg)] font-normal">
          ({items.length} 种 · {items.reduce((n, i) => n + i.quantity, 0)} 张)
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-[var(--color-muted-fg)] border border-dashed border-[var(--color-border)] rounded-md py-6 text-center">
          还没有
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <Row
              key={it.id}
              item={it}
              game={game}
              pending={pending}
              run={run}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  item,
  game,
  pending,
  run,
}: {
  item: Adjustment;
  game: string;
  pending: boolean;
  run: (action: (fd: FormData) => Promise<void>, fd: FormData) => void;
}) {
  const [note, setNote] = useState(item.note ?? "");

  function saveNote() {
    if (note === (item.note ?? "")) return;
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("note", note);
    run(setDeckAdjustmentNoteAction, fd);
  }

  return (
    <li className="flex items-center gap-2 rounded-md border border-[var(--color-border)] p-1.5">
      <Link
        href={`/${game}/card/${item.code.split("/").map(encodeURIComponent).join("/")}`}
        className="shrink-0"
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-9 aspect-[5/7] object-cover rounded"
          />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-mono text-[var(--color-muted-fg)] truncate">
          {item.code}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-medium truncate flex-1">{item.name}</div>
          <Stepper
            value={item.quantity}
            pending={pending}
            onChange={(q) => {
              const fd = new FormData();
              fd.set("id", item.id);
              fd.set("quantity", String(q));
              run(setDeckAdjustmentQuantityAction, fd);
            }}
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="理由（可留空）"
          className="mt-1 w-full h-6 px-1.5 rounded border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-border)] bg-transparent text-[11px] text-[var(--color-muted-fg)]"
        />
      </div>
      <button
        type="button"
        disabled={pending}
        title="移除"
        onClick={() => {
          const fd = new FormData();
          fd.set("id", item.id);
          run(removeDeckAdjustmentAction, fd);
        }}
        className="shrink-0 w-6 h-6 rounded text-[var(--color-muted-fg)] hover:text-red-500 hover:bg-red-500/10 cursor-pointer disabled:opacity-50"
      >
        ×
      </button>
    </li>
  );
}

/** Copy-count stepper. Clamped to the same 1..20 the server enforces. */
function Stepper({
  value,
  pending,
  onChange,
}: {
  value: number;
  pending: boolean;
  onChange: (q: number) => void;
}) {
  const btn =
    "w-5 h-5 rounded flex items-center justify-center text-xs leading-none " +
    "border border-[var(--color-border)] hover:border-[var(--color-fg)] " +
    "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        disabled={pending || value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="减少一张"
        className={btn}
      >
        −
      </button>
      <span className="text-xs tabular-nums w-6 text-center font-medium">
        ×{value}
      </span>
      <button
        type="button"
        disabled={pending || value >= 20}
        onClick={() => onChange(value + 1)}
        aria-label="增加一张"
        className={btn}
      >
        ＋
      </button>
    </div>
  );
}
