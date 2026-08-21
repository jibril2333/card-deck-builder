"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renameGroupAction,
  setGroupDecksAction,
  deleteGroupAction,
} from "@/app/[game]/actions";

type DeckLite = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
  /** Cover art, already resolved to the deck's chosen printing. */
  cover_image_url: string | null;
};

/**
 * Inline management for a deck group: rename, pick which of the user's decks
 * belong to the shared pool, and delete.
 *
 * Ticking a deck saves it. The panel used to batch edits behind a 保存成员
 * button, which meant every visit ended in the same two clicks and a closed
 * panel could still be holding changes that were never written. One tile, one
 * write — the same shape as the deck page's own pool select.
 */
export function GroupEditor({
  game,
  groupId,
  name,
  allDecks,
  memberIds,
}: {
  game: string;
  groupId: string;
  name: string;
  allDecks: DeckLite[];
  memberIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(name);
  const [picked, setPicked] = useState<Set<string>>(new Set(memberIds));
  const [open, setOpen] = useState(false);

  function dot(d: DeckLite) {
    return d.accent_color2
      ? `linear-gradient(135deg, ${d.accent_color}, ${d.accent_color2})`
      : d.accent_color;
  }

  function saveName() {
    const v = nameVal.trim();
    if (!v || v === name) {
      setEditingName(false);
      setNameVal(name);
      return;
    }
    const fd = new FormData();
    fd.set("game", game);
    fd.set("id", groupId);
    fd.set("name", v);
    startTransition(async () => {
      await renameGroupAction(fd);
      setEditingName(false);
      router.refresh();
    });
  }

  /**
   * Toggle one deck and write the whole membership list.
   *
   * The action SETS rather than adds, so the post carries every id — which is
   * also why the optimistic set has to be computed before the transition
   * rather than read out of state inside it.
   */
  function toggleDeck(deckId: string) {
    const next = new Set(picked);
    if (next.has(deckId)) next.delete(deckId);
    else next.add(deckId);
    setPicked(next);
    const fd = new FormData();
    fd.set("game", game);
    fd.set("id", groupId);
    for (const id of next) fd.append("deck_id", id);
    startTransition(async () => {
      await setGroupDecksAction(fd);
      router.refresh();
    });
  }

  function del() {
    if (!confirm("删除这个卡池？卡组本身不受影响")) return;
    const fd = new FormData();
    fd.set("game", game);
    fd.set("id", groupId);
    startTransition(() => deleteGroupAction(fd));
  }

  return (
    <div className={pending ? "opacity-70" : ""}>
      <div className="flex items-center gap-2 flex-wrap">
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setEditingName(false);
                setNameVal(name);
              }
            }}
            className="text-2xl font-bold bg-transparent border-b border-[var(--color-accent)] focus:outline-none"
          />
        ) : (
          <h1
            className="text-2xl font-bold cursor-text"
            onClick={() => setEditingName(true)}
            title="点击重命名"
          >
            {name}
          </h1>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-muted)] text-[var(--color-muted-fg)]">
          🎴 共享卡池
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto px-3 h-8 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer"
        >
          {open ? "收起" : "管理成员"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
          {/* Cover tiles, not a checkbox list. Decks are recognised by their
              art long before their name is read, and the page is up to 1500px
              wide — two columns of text left most of it empty and made a
              dozen decks a scroll. */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {allDecks.map((d) => {
              const on = picked.has(d.id);
              return (
                <label
                  key={d.id}
                  title={d.name}
                  className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all ${
                    on
                      ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40"
                      : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
                  }`}
                >
                  {/* The real control, kept for keyboard and screen readers —
                      the tile is its label, so clicking anywhere toggles. */}
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleDeck(d.id)}
                    className="sr-only"
                  />
                  <div className="card-thumb relative">
                    {d.cover_image_url ? (
                      <img
                        src={d.cover_image_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        draggable={false}
                        className={
                          on ? "" : "opacity-55 group-hover:opacity-80"
                        }
                      />
                    ) : (
                      // Same fallback the deck list uses: accent wash plus the
                      // first two characters, so a coverless deck still reads
                      // as itself rather than as a blank tile.
                      <div
                        className="w-full h-full flex items-center justify-center"
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
                    {on ? (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-xs font-bold flex items-center justify-center shadow">
                        ✓
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-1 bg-[var(--color-card)]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: dot(d) }}
                    />
                    <span className="truncate text-xs">{d.name}</span>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={del}
              className="px-3 h-8 rounded-md text-sm border border-red-500/40 text-red-500 hover:bg-red-500/10 cursor-pointer ml-auto"
            >
              删除卡池
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
