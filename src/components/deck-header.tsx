"use client";

import { useState } from "react";
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

/**
 * The deck's identity: cover art, name and notes, in one banner.
 *
 * These used to be two things — a decorative strip at the top of the page and
 * a "卡组信息" card in the 300px sidebar — which put the deck's name in two
 * places at once, one of them an input box the width of a phone. The banner
 * already carried the cover and the accent colour, so it was showing most of
 * that panel's content already, just not the part you could edit.
 *
 * Editing is behind a toggle rather than always-on: the name is read far more
 * often than it is changed, and a permanently-open form is what made the
 * sidebar version feel like settings instead of a title. Opened, the form gets
 * the full width of the main column, so the colour pickers and the notes box
 * stop being cramped.
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
  const [editing, setEditing] = useState(false);

  const wash = deck.accent_color2
    ? `linear-gradient(135deg, ${deck.accent_color}55, ${deck.accent_color2}55)`
    : `linear-gradient(135deg, ${deck.accent_color}33, transparent)`;

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

        <div className="relative flex items-end gap-3 sm:gap-4 p-3 sm:p-4 min-h-[8rem] sm:min-h-[10rem]">
          {cover?.image_url ? (
            <img
              src={cover.image_url}
              alt={cover.name}
              referrerPolicy="no-referrer"
              className="h-20 sm:h-28 aspect-[5/7] object-cover rounded-md shadow-lg border-2 border-white/80 shrink-0"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold break-words">{deck.name}</h1>
              {!mine ? (
                <span
                  className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-muted)] text-[var(--color-muted-fg)] border border-[var(--color-border)]"
                  title="这是别人的卡组,你只能浏览"
                >
                  👁 只读
                </span>
              ) : null}
            </div>
            {deck.notes ? (
              // Clamped: notes run to whatever length the owner wants, and the
              // banner is a header, not the place to read an essay. The full
              // text is one click away in the form.
              <p className="mt-1 text-sm text-[var(--color-muted-fg)] whitespace-pre-wrap line-clamp-2">
                {deck.notes}
              </p>
            ) : null}
          </div>

          {mine ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
              className="shrink-0 self-start px-2.5 h-8 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-card)]/80 backdrop-blur hover:border-[var(--color-fg)] transition-colors cursor-pointer"
            >
              {editing ? "收起" : "✎ 编辑"}
            </button>
          ) : null}
        </div>
      </div>

      {mine && editing ? (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <DeckMetaForm
            game={game}
            deck={deck}
            coverAccent={cover?.accent ?? null}
            coverAccent2={cover?.accent2 ?? null}
            exportText={exportText}
            exportUrl={exportUrl}
          />
          {/* Only worth showing when the cover card actually has more than one
              printing to choose between. */}
          {cover && cover.arts.length > 1 ? (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <CoverVariantPicker
                game={game}
                deckId={deck.id}
                arts={cover.arts}
                current={deck.cover_variant ?? ""}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
