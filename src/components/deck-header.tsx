"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDeckMetaAction } from "@/app/[game]/actions";
import { CoverVariantPicker } from "@/components/cover-variant-picker";
import { DeckAccentPicker } from "@/components/deck-accent-picker";
import { InlineText, type SaveStatus } from "@/components/inline-text";

type DeckLite = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  accent_color2: string | null;
  cover_variant: string | null;
};

type Cover = {
  image_url: string | null;
  name: string;
  accent: string | null;
  accent2: string | null;
  arts: { variant: string; image_url: string; label?: string | null }[];
};

const SAVE_DEBOUNCE_MS = 500;

/**
 * The deck's identity: cover, name, notes and colours, all edited in place.
 *
 * Everything here used to be a "卡组信息" card in the sidebar, then a panel
 * that expanded out of this banner. Both put a step between seeing a value and
 * changing it. Now the name and notes ARE the inputs (see `InlineText`), the
 * colours are three dots in the corner, and the cover opens its alt-art picker
 * when the card has more than one printing. Nothing here opens a form.
 *
 * Export and delete are elsewhere — export next to 导出图片 in the toolbar,
 * where the other output actions are, and delete at the foot of the sidebar,
 * as far as possible from a field you edit by clicking on it.
 *
 * The notes row holds its height whether or not there are notes: letting it
 * collapse moved the title, so where the title sat depended on whether the
 * deck happened to have a description.
 */
export function DeckHeader({
  game,
  deck,
  cover,
  mine,
}: {
  game: string;
  deck: DeckLite;
  cover: Cover | null;
  mine: boolean;
}) {
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
              // Focus a quarter of the way down, not the middle. A card is
              // 5:7 and this strip is wide and short, so object-center lands
              // on the effect box — and on the SAMPLE watermark printed across
              // it. A quarter down is the illustration.
              className="absolute inset-0 w-full h-full object-cover object-[50%_25%] opacity-90"
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
                title={mine ? "封面来自卡组里点了 ★ 的那张卡" : undefined}
                className="h-20 sm:h-28 aspect-[5/7] object-cover rounded-md shadow-lg border-2 border-white/80 shrink-0"
              />
            )
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <DeckName game={game} deck={deck} editable={mine} />
              {!mine ? (
                <span
                  className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-muted)] text-[var(--color-muted-fg)] border border-[var(--color-border)]"
                  title="这是别人的卡组,你只能浏览"
                >
                  👁 只读
                </span>
              ) : null}
            </div>
            <div className="mt-1 min-h-[2.5rem]">
              <DeckNotes game={game} deck={deck} editable={mine} />
            </div>
          </div>

          {mine ? (
            <div className="shrink-0 self-end">
              <DeckAccentPicker
                game={game}
                deckId={deck.id}
                accent={deck.accent_color}
                accent2={deck.accent_color2}
                coverAccent={cover?.accent ?? null}
                coverAccent2={cover?.accent2 ?? null}
              />
            </div>
          ) : null}
        </div>

        {/* The same hairline the deck grid draws under each cover, so a deck
            reads the same in the list and on its own page. Inside the rounded
            box, which clips it to the corners. */}
        <div
          className="relative h-1 w-full"
          style={{
            background: deck.accent_color2
              ? `linear-gradient(90deg, ${deck.accent_color}, ${deck.accent_color2})`
              : deck.accent_color,
          }}
        />
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
    </div>
  );
}

/**
 * Debounced save of ONE field. The action treats an absent field as "don't
 * touch", so sending just this one leaves the rest of the deck's metadata
 * alone — which is what lets these be separate editors at all.
 */
function useFieldSave(game: string, deckId: string) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

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

/** "保存中… / 已保存 / 保存失败", so an autosave isn't entirely silent. */
function SaveMark({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span
      className={`text-[11px] shrink-0 ${
        status === "error" ? "text-red-500" : "text-[var(--color-muted-fg)]"
      }`}
    >
      {status === "saving" ? "保存中…" : status === "saved" ? "已保存" : "保存失败"}
    </span>
  );
}

function DeckName({
  game,
  deck,
  editable,
}: {
  game: string;
  deck: DeckLite;
  editable: boolean;
}) {
  const { save, status } = useFieldSave(game, deck.id);
  return (
    <span className="flex items-baseline gap-2 min-w-0">
      <InlineText
        as="h1"
        initial={deck.name}
        placeholder="未命名卡组"
        editable={editable}
        ariaLabel="卡组名"
        title={editable ? "点击改名" : undefined}
        onChange={(v) => {
          // An empty name would leave a blank banner, and the action ignores
          // it anyway — don't send one.
          if (v.trim()) save("name", v.trim());
        }}
        className="text-2xl font-bold break-words min-w-0"
      />
      <SaveMark status={status} />
    </span>
  );
}

function DeckNotes({
  game,
  deck,
  editable,
}: {
  game: string;
  deck: DeckLite;
  editable: boolean;
}) {
  const { save, status } = useFieldSave(game, deck.id);
  if (!editable && !deck.notes) return null;
  return (
    <div className="flex items-start gap-2">
      <InlineText
        as="div"
        initial={deck.notes ?? ""}
        placeholder="添加备注…"
        editable={editable}
        ariaLabel="备注"
        title={editable ? "点击编辑备注" : undefined}
        onChange={(v) => save("notes", v)}
        className="text-sm text-[var(--color-muted-fg)] whitespace-pre-wrap min-w-0 flex-1"
      />
      <SaveMark status={status} />
    </div>
  );
}
