"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateDeckMetaAction, deleteDeckAction } from "@/app/[game]/actions";
import { DeckExportPanel } from "@/components/deck-export";

type Props = {
  game: string;
  deck: {
    id: string;
    name: string;
    notes: string | null;
    accent_color: string;
    accent_color2: string | null;
    /** UA only: locked series ("作品") for this deck, or null when unlocked.
     *  Auto-set by the first card added; auto-cleared when the deck empties.
     *  Read-only here — there's no manual clear control by design. */
    locked_series: string | null;
    /** UA only: locked color, or null when unlocked. Same lifecycle as
     *  `locked_series`. */
    locked_color: string | null;
  };
  /** Current cover card's color(s) in hex form. Null when the deck has no
   *  cover. When present, drives the "应用封面卡颜色" button — the click
   *  just slams these into local accent / accent2 state and lets autosave
   *  persist them. accent2 is null for single-color covers. */
  coverAccent: string | null;
  coverAccent2: string | null;
  exportText: string;
  exportUrl: string;
};

/** How long after the last keystroke / color tweak before we flush a save. */
const SAVE_DEBOUNCE_MS = 500;

/**
 * Editable deck metadata panel. No explicit save button — every field
 * autosaves on change with a small debounce, and a status pill in the
 * footer tells the user whether the last save succeeded.
 *
 * Local state is seeded once from the server-rendered `deck` prop and
 * never re-synced. That matters because `updateDeckMetaAction` triggers
 * `router.refresh()`, which re-runs the parent server component and feeds
 * new props in — but if the user is mid-keystroke when that lands we
 * don't want to clobber their input.
 *
 * Dual-color: the second color picker only appears when `accent_color2`
 * is set. Tapping "＋ 副色" seeds it with the primary (so the user can
 * tweak from there); "移除副色" sends it back to null = single-color
 * mode. Both clicks update local state, the autosave effect picks it up.
 */
export function DeckMetaForm({
  game,
  deck,
  coverAccent,
  coverAccent2,
  exportText,
  exportUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exportOpen, setExportOpen] = useState(false);

  const [name, setName] = useState(deck.name);
  const [notes, setNotes] = useState(deck.notes ?? "");
  const [accent, setAccent] = useState(deck.accent_color);
  // UA is single-color only — force-clear any legacy accent_color2 on load
  // so the very next autosave wipes it from the DB too. Digimon keeps the
  // value as-is.
  const [accent2, setAccent2] = useState<string | null>(
    game === "digimon" ? deck.accent_color2 : null,
  );
  // UA single-作品 / single-color locks are READ-ONLY in this form — they're
  // managed entirely server-side (first card sets them, emptying the deck
  // clears them). No local state, no autosave field: we just display the
  // values handed down from the server.
  const lockedSeries = deck.locked_series;
  const lockedColor = deck.locked_color;

  // `idle`     — page just loaded, no save attempted yet
  // `saving`   — debounce expired and we're in-flight
  // `saved`    — last save succeeded
  // `error`    — last save threw
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMount = useRef(true);

  // Whenever a tracked field changes, schedule a debounced save. The first
  // render's seeding of state from props doesn't count — otherwise we'd
  // POST an identical-to-DB payload on mount.
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("id", deck.id);
      fd.set("name", name);
      fd.set("notes", notes);
      fd.set("accent_color", accent);
      // Empty string = explicit clear (null); a value = update.
      fd.set("accent_color2", accent2 ?? "");
      // NOTE: locked_series / locked_color are intentionally NOT sent —
      // they're read-only here and owned by the server (first-card lock +
      // empty-deck auto-clear). The action's "field absent → don't touch"
      // path keeps them untouched.
      startTransition(async () => {
        try {
          await updateDeckMetaAction(fd);
          setStatus("saved");
          router.refresh();
        } catch {
          setStatus("error");
        }
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // We intentionally exclude `game`, `deck.id`, `router` — those are stable
    // for the lifetime of this component, including them just bloats the dep
    // array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, notes, accent, accent2]);

  function onDelete() {
    if (!confirm(`确认删除卡组「${deck.name}」？这会同时移除其中所有卡。`))
      return;
    const fd = new FormData();
    fd.set("game", game);
    fd.set("id", deck.id);
    startTransition(async () => {
      await deleteDeckAction(fd);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>卡组名</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label>备注</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label>主题色</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-1"
            title="主色"
          />
          {/* Dual-color is a Digimon-only concept (multicolor Digimon cards
              have both `color` and `color2`). UA cards are always
              single-color, so the secondary picker would be misleading. */}
          {game === "digimon" ? (
            accent2 !== null ? (
              <>
                <span className="text-[var(--color-muted-fg)] text-sm">+</span>
                <input
                  type="color"
                  value={accent2}
                  onChange={(e) => setAccent2(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-1"
                  title="副色"
                />
                <button
                  type="button"
                  onClick={() => setAccent2(null)}
                  className="text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] underline cursor-pointer"
                >
                  移除副色
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAccent2(accent)}
                className="text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] underline cursor-pointer"
              >
                ＋ 加副色(双色)
              </button>
            )
          ) : null}
          {/* Inline preview swatch showing the current single / dual color */}
          <span
            aria-hidden
            className="h-6 w-12 rounded border border-[var(--color-border)] ml-1"
            style={{
              background: accent2 && game === "digimon"
                ? `linear-gradient(90deg, ${accent}, ${accent2})`
                : accent,
            }}
          />
        </div>
        {coverAccent ? (
          <button
            type="button"
            onClick={() => {
              setAccent(coverAccent);
              // For UA, force null even if coverAccent2 happens to be set
              // (defensive — the page should send null for UA anyway).
              setAccent2(game === "digimon" ? coverAccent2 : null);
            }}
            className="text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] underline cursor-pointer inline-flex items-center gap-1.5"
            title="把卡组颜色设为当前封面卡的颜色"
          >
            <span
              aria-hidden
              className="inline-block h-3 w-6 rounded border border-[var(--color-border)]"
              style={{
                background:
                  coverAccent2 && game === "digimon"
                    ? `linear-gradient(90deg, ${coverAccent}, ${coverAccent2})`
                    : coverAccent,
              }}
            />
            应用封面卡颜色
          </button>
        ) : null}
      </div>

      {game === "unionarena" ? (
        <div className="space-y-1">
          <Label>规则锁定</Label>
          <p className="text-[11px] text-[var(--color-muted-fg)]">
            官方规则:单作品 + 单颜色。第一张加进卡组的卡会自动锁定,后续不符的卡会被拦截;清空卡组后自动解锁。
          </p>
          <div className="flex flex-wrap gap-1.5">
            <LockChip
              label="作品"
              value={lockedSeries}
              emptyLabel="未锁定(下一张卡决定)"
            />
            <LockChip
              label="颜色"
              value={lockedColor}
              emptyLabel="未锁定(下一张卡决定)"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-2 flex-wrap">
        <SaveStatus status={status} pending={pending} />
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExportOpen((o) => !o)}
        >
          ⇡ 导出
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={pending}
        >
          删除卡组
        </Button>
      </div>

      {exportOpen ? (
        <DeckExportPanel
          text={exportText}
          url={exportUrl}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Tiny pill showing the autosave state. Idle = nothing rendered (no chrome
 * on first paint); saving/saved/error each get their own color + glyph.
 */
function SaveStatus({
  status,
  pending,
}: {
  status: "idle" | "saving" | "saved" | "error";
  pending: boolean;
}) {
  if (status === "idle") return null;
  if (pending || status === "saving")
    return (
      <span className="text-xs text-[var(--color-muted-fg)] inline-flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        保存中…
      </span>
    );
  if (status === "saved")
    return (
      <span className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1">
        ✓ 已保存
      </span>
    );
  return (
    <span className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-1">
      ✗ 保存失败
    </span>
  );
}

/**
 * A single locked-rule pill (作品 / 颜色). Pure read-only display — shows
 * the current value, or a placeholder like "未锁定" when unset. There is
 * deliberately NO clear control: locks are managed server-side (set by the
 * first card, cleared automatically when the deck empties), so the user
 * never deletes them by hand.
 */
function LockChip({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  emptyLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 h-7 rounded-md border text-xs ${
        value
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 text-[var(--color-fg)]"
          : "border-dashed border-[var(--color-border)] text-[var(--color-muted-fg)]"
      }`}
    >
      <span className="font-semibold uppercase text-[10px] tracking-wide text-[var(--color-muted-fg)]">
        {label}
      </span>
      <span className="truncate max-w-[12em]">{value ?? emptyLabel}</span>
    </span>
  );
}
