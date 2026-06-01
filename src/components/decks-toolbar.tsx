"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createDeckAction,
  importDeckAction,
} from "@/app/[game]/actions";
import {
  MissingCardsTool,
  type DeckShortfall,
} from "@/components/missing-cards-tool";
import {
  DeckDiffTool,
  type DeckForDiff,
} from "@/components/deck-diff-tool";

/**
 * Compact decks-page toolbar.
 *
 * The deck-name input is shared between two actions:
 *   - "＋ 创建"           → submit form, server creates empty deck
 *   - "⇣ 从剪贴板导入"    → reads navigator.clipboard.readText() then
 *                            POSTs name + text to importDeckAction
 *
 * That's the whole import flow now — no textarea, no panel. The
 * importDeckAction's existing fallback (auto-pick Lv6 hero name + cover
 * for Digimon when name is empty) still applies, so users CAN leave the
 * name blank and let import name it from the deck contents.
 *
 * Auxiliary tools (缺卡统计 / 对比) keep their old toggle-panel-below
 * pattern.
 */
export function DecksToolbar({
  game,
  accent,
  deckCount,
  deckShortfalls,
  decksForDiff,
}: {
  game: string;
  accent: string;
  deckCount: number;
  deckShortfalls: DeckShortfall[];
  decksForDiff: DeckForDiff[];
}) {
  const router = useRouter();
  const [missingOpen, setMissingOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  // `notice` is a single status line below the form — used for both
  // import errors (couldn't read clipboard, parser found nothing, etc.)
  // and import success summaries (e.g. "导入 47 张, 3 张跳过 (禁卡)"). We
  // pick a tone (error/warn/ok) per case so the user can scan at a glance.
  const [notice, setNotice] = useState<{
    tone: "error" | "warn" | "ok";
    text: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function buildFD(extra: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("accent_color", accent);
    fd.set("name", name.trim());
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      // createDeckAction tolerates empty name (server fallback = "新卡组")
      // and redirects on success — the throw propagates and Next handles
      // the navigation. So we don't need to clear `name` here; we won't
      // be on this page when this resolves.
      await createDeckAction(buildFD());
    });
  }

  async function onImport() {
    setNotice(null);
    // Read the clipboard FIRST so we can short-circuit on permission /
    // empty-clipboard before we kick off a transition.
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setNotice({
        tone: "error",
        text: "无法读取剪贴板。请检查浏览器权限(可能需要 HTTPS / 用户授权)。",
      });
      return;
    }
    if (!text.trim()) {
      setNotice({
        tone: "error",
        text: "剪贴板是空的 — 先复制一份卡组文本再试。",
      });
      inputRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const r = await importDeckAction(buildFD({ text }));
      if (r.ok && r.deckId) {
        // Compose a one-line summary; the deck's notes already carries
        // the detailed drop reasons (parse errors / banned / pair /
        // overlimit) so we don't need to re-render them here.
        const bits: string[] = [`导入 ${r.imported ?? 0} 张`];
        if (r.missing && r.missing.length > 0) {
          bits.push(`${r.missing.length} 张数据库里没找到`);
        }
        setNotice({ tone: "ok", text: "✓ " + bits.join(" · ") });
        setName("");
        router.push(`/${game}/decks/${r.deckId}`);
      } else {
        setNotice({
          tone: "error",
          text: r.error ?? "导入失败",
        });
      }
    });
  }

  const noticeClass =
    notice?.tone === "ok"
      ? "text-green-600 dark:text-green-400"
      : notice?.tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold mr-auto">
          我的卡组{" "}
          <span className="text-[var(--color-muted-fg)] font-normal text-sm">
            ({deckCount})
          </span>
        </h1>

        <form
          onSubmit={onCreate}
          className="flex items-center gap-2 order-3 sm:order-2 w-full sm:w-auto"
        >
          <input
            ref={inputRef}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="卡组名(留空也可以,可后改)…"
            className="flex-1 sm:w-56 h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            disabled={pending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            title="新建一个空卡组(不填名字默认叫 “新卡组”,之后可改)"
          >
            ＋ 创建
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onImport}
            disabled={pending}
            title="从剪贴板里的卡组文本导入(支持 digimoncard.io / DCGO / Project Drasil / 通用 “数量 编号” 格式)"
          >
            {pending ? "处理中…" : "⇣ 导入"}
          </Button>
        </form>

        <div className="flex items-center gap-2 order-2 sm:order-3">
          {deckShortfalls.length > 0 ? (
            <button
              type="button"
              onClick={() => setMissingOpen((v) => !v)}
              aria-pressed={missingOpen}
              className={`h-9 px-3 rounded-md border text-sm cursor-pointer flex items-center gap-1.5 transition-colors ${
                missingOpen
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
              }`}
            >
              🛒 缺卡统计
            </button>
          ) : null}
          {decksForDiff.length >= 2 ? (
            <button
              type="button"
              onClick={() => setDiffOpen((v) => !v)}
              aria-pressed={diffOpen}
              className={`h-9 px-3 rounded-md border text-sm cursor-pointer flex items-center gap-1.5 transition-colors ${
                diffOpen
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
              }`}
            >
              🔀 对比
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className={`mt-2 text-xs ${noticeClass}`}>{notice.text}</div>
      ) : null}

      {missingOpen ? (
        <div className="mt-3">
          <MissingCardsTool
            game={game}
            decks={deckShortfalls}
            onClose={() => setMissingOpen(false)}
          />
        </div>
      ) : null}

      {diffOpen ? (
        <div className="mt-3">
          <DeckDiffTool
            game={game}
            decks={decksForDiff}
            onClose={() => setDiffOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
