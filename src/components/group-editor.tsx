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
};

/**
 * Inline management for a deck group: rename, pick which of the user's decks
 * belong to the shared pool, and delete. Each control posts a server action
 * and refreshes; membership edits are batched behind a "保存成员" button so
 * ticking boxes doesn't fire a write per click.
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

  const dirty =
    picked.size !== memberIds.length ||
    memberIds.some((id) => !picked.has(id));

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

  function saveMembers() {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("id", groupId);
    for (const id of picked) fd.append("deck_id", id);
    startTransition(async () => {
      await setGroupDecksAction(fd);
      router.refresh();
    });
  }

  function del() {
    if (!confirm("删除这个组合？(只删组合，不影响里面的卡组)")) return;
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
          <div className="text-xs text-[var(--color-muted-fg)] mb-2">
            勾选要共享同一套卡的卡组（只在这些卡组之间组合）：
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {allDecks.map((d) => {
              const on = picked.has(d.id);
              return (
                <label
                  key={d.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer text-sm ${
                    on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/8"
                      : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(d.id)) n.delete(d.id);
                        else n.add(d.id);
                        return n;
                      })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: dot(d) }}
                  />
                  <span className="truncate">{d.name}</span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={saveMembers}
              disabled={!dirty || pending}
              className="px-3 h-8 rounded-md text-sm font-medium bg-[var(--color-accent)] text-[var(--color-accent-fg)] disabled:opacity-40 cursor-pointer"
            >
              保存成员
            </button>
            <button
              type="button"
              onClick={del}
              className="px-3 h-8 rounded-md text-sm border border-red-500/40 text-red-500 hover:bg-red-500/10 cursor-pointer ml-auto"
            >
              删除组合
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
