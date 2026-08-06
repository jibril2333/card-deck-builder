"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDeckMetaAction } from "@/app/[game]/actions";
import { DeckMetaForm } from "@/components/deck-meta-form";
import { CoverVariantPicker } from "@/components/cover-variant-picker";

type DeckLite = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  accent_color2: string | null;
  cover_variant: string | null;
  locked_series: string | null;
  locked_color: string | null;
};

type Cover = {
  image_url: string | null;
  name: string;
  accent: string | null;
  accent2: string | null;
  arts: { variant: string; image_url: string; label?: string | null }[];
};

/** Debounce before an inline edit is flushed, matching DeckMetaForm. */
const SAVE_DEBOUNCE_MS = 500;

/**
 * The deck's identity — cover, name, notes — edited where it is displayed.
 *
 * The name and notes are click-to-edit in place rather than fields in a panel
 * you open first: they are the two things most often tweaked right after
 * looking at the deck, and making that a two-step interaction is what the
 * sidebar version already got wrong. Saving is debounced and automatic, so
 * there is no save button to hunt for either.
 *
 * Colour, export and delete stay behind a toggle. They are rare, they need
 * more room than a banner line, and putting them inline would recreate the
 * panel this replaced.
 *
 * The notes row keeps its height whether or not there are notes. Letting it
 * collapse moved the title down, so the title's position depended on whether
 * the deck happened to have a description.
 */
export function DeckHeader({
  game,
  deck,
  cover,
  mine,
  exportText,
  exportUrl,
}: {
  game: string;
  deck: DeckLite;
  cover: Cover | null;
  mine: boolean;
  exportText: string;
  exportUrl: string;
}) {
  const [more, setMore] = useState(false);
  const [arts, setArts] = useState(false);

  const wash = deck.accent_color2
    ? `linear-gradient(135deg, ${deck.accent_color}55, ${deck.accent_color2}55)`
    : `linear-gradient(135deg, ${deck.accent_color}33, transparent)`;

  const canPickArt = mine && !!cover && cover.arts.length > 1;

  return (
    <div className="mb-3">
      <div
        className="relative rounded-lg overflow-hidden border border-[var(--color-border)]"
        style={{ background: wash }}
      >
        {cover?.image_url ? (
          <>
            <img
              src={cover.image_url}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover object-center opacity-90"
              style={{ filter: "blur(8px) saturate(1.2)" }}
            />
            {/* Solid at the bottom, where the text sits — the name has to stay
                readable over whatever art the cover happens to be. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(0deg, var(--color-bg) 15%, transparent 85%)",
              }}
            />
          </>
        ) : null}

        <div className="relative flex items-end gap-3 sm:gap-4 p-3 sm:p-4">
          {cover?.image_url ? (
            canPickArt ? (
              <button
                type="button"
                onClick={() => setArts((v) => !v)}
                title={`换一张异画（${cover.arts.length} 个版本）`}
                className="shrink-0 rounded-md overflow-hidden border-2 border-white/80 shadow-lg hover:border-[var(--color-accent)] transition-colors cursor-pointer"
              >
                <img
                  src={cover.image_url}
                  alt={cover.name}
                  referrerPolicy="no-referrer"
                  className="h-20 sm:h-28 aspect-[5/7] object-cover block"
                />
              </button>
            ) : (
              <img
                src={cover.image_url}
                alt={cover.name}
                referrerPolicy="no-referrer"
                title={
                  mine ? "封面来自卡组里点了 ★ 的那张卡" : undefined
                }
                className="h-20 sm:h-28 aspect-[5/7] object-cover rounded-md shadow-lg border-2 border-white/80 shrink-0"
              />
            )
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {mine ? (
                <InlineName game={game} deck={deck} />
              ) : (
                <h1 className="text-2xl font-bold break-words">{deck.name}</h1>
              )}
              {!mine ? (
                <span
                  className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-muted)] text-[var(--color-muted-fg)] border border-[var(--color-border)]"
                  title="这是别人的卡组,你只能浏览"
                >
                  👁 只读
                </span>
              ) : null}
            </div>
            {/* Fixed height: see the component note — a collapsing notes row
                dragged the title down on decks without one. */}
            <div className="mt-1 min-h-[2.5rem]">
              {mine ? (
                <InlineNotes game={game} deck={deck} />
              ) : deck.notes ? (
                <p className="text-sm text-[var(--color-muted-fg)] whitespace-pre-wrap line-clamp-2">
                  {deck.notes}
                </p>
              ) : null}
            </div>
          </div>

          {mine ? (
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              title="配色 / 导出 / 删除"
              className="shrink-0 self-start px-2.5 h-8 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-card)]/80 backdrop-blur hover:border-[var(--color-fg)] transition-colors cursor-pointer"
            >
              {more ? "收起" : "⋯ 更多"}
            </button>
          ) : null}
        </div>
      </div>

      {canPickArt && arts ? (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <CoverVariantPicker
            game={game}
            deckId={deck.id}
            arts={cover!.arts}
            current={deck.cover_variant ?? ""}
          />
        </div>
      ) : null}

      {mine && more ? (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <DeckMetaForm
            game={game}
            deck={deck}
            coverAccent={cover?.accent ?? null}
            coverAccent2={cover?.accent2 ?? null}
            exportText={exportText}
            exportUrl={exportUrl}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Debounced save of ONE field. The action treats an absent field as "don't
 * touch", so sending just this one leaves the rest of the deck's metadata
 * alone — which is the whole point of editing them separately.
 */
function useFieldSave(game: string, deckId: string) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function save(field: "name" | "notes", value: string) {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("id", deckId);
      fd.set(field, value);
      try {
        await updateDeckMetaAction(fd);
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    }, SAVE_DEBOUNCE_MS);
  }

  return { save, status };
}

/** Small "saving / saved / failed" marker, so an autosave isn't silent. */
function SaveMark({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  const text =
    status === "saving" ? "保存中…" : status === "saved" ? "已保存" : "保存失败";
  return (
    <span
      className={`text-[11px] ${
        status === "error"
          ? "text-red-500"
          : "text-[var(--color-muted-fg)]"
      }`}
    >
      {text}
    </span>
  );
}

function InlineName({ game, deck }: { game: string; deck: DeckLite }) {
  const { save, status } = useFieldSave(game, deck.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(deck.name);

  function commit() {
    setEditing(false);
    // An empty name would render as a blank banner, and the action ignores it
    // anyway — put the old one back rather than showing nothing.
    if (!value.trim()) setValue(deck.name);
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2 min-w-0">
        {/* The button goes INSIDE the h1. Putting role="button" on the h1
            itself replaces the heading role, which costs the page its only
            level-1 heading and makes a screen reader announce a control where
            the title should be. */}
        <h1 className="text-2xl font-bold break-words min-w-0">
          <button
            type="button"
            title="点击改名"
            onClick={() => setEditing(true)}
            className="text-left cursor-text rounded px-1 -mx-1 hover:bg-[var(--color-muted)]/60 transition-colors"
          >
            {value}
          </button>
        </h1>
        <SaveMark status={status} />
      </span>
    );
  }

  return (
    <input
      autoFocus
      aria-label="卡组名"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (e.target.value.trim()) save("name", e.target.value.trim());
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setValue(deck.name);
          setEditing(false);
        }
      }}
      className="text-2xl font-bold bg-transparent border-b border-[var(--color-accent)] focus:outline-none min-w-0 flex-1"
    />
  );
}

function InlineNotes({ game, deck }: { game: string; deck: DeckLite }) {
  const { save, status } = useFieldSave(game, deck.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(deck.notes ?? "");

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <button
          type="button"
          title="点击编辑备注"
          onClick={() => setEditing(true)}
          className={`text-left text-sm whitespace-pre-wrap line-clamp-2 cursor-text rounded px-1 -mx-1 hover:bg-[var(--color-muted)]/60 transition-colors ${
            value
              ? "text-[var(--color-muted-fg)]"
              : "text-[var(--color-muted-fg)] opacity-60"
          }`}
        >
          {value || "＋ 添加备注"}
        </button>
        <SaveMark status={status} />
      </div>
    );
  }

  return (
    <textarea
      autoFocus
      aria-label="备注"
      rows={2}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        save("notes", e.target.value);
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setValue(deck.notes ?? "");
          setEditing(false);
        }
      }}
      className="w-full text-sm bg-[var(--color-card)]/80 backdrop-blur rounded border border-[var(--color-accent)] px-2 py-1 focus:outline-none resize-none"
    />
  );
}
