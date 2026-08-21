"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  describeExport,
  isUserExport,
  type ImportReport,
} from "@/lib/user-data";

/**
 * Carry this account's work to another install of the app, or keep a copy.
 *
 * Two deployments share nothing: the same person on the NAS and on the Mac is
 * two accounts with two ids. This is the bridge — and it deliberately moves
 * only what is yours to move (see lib/user-data.ts: no password, no sessions,
 * no passkeys).
 *
 * Two tiles, one per direction, because that is the whole shape of the
 * feature. The import half used to be a bare `<input type=file>`, which on
 * this page rendered as the browser's own grey "Choose File / No file chosen"
 * — a control from a different application, in English, that says nothing
 * about what it accepts. It's now a drop target that takes a drag as readily
 * as a click, and that fills with the file's CONTENTS once one is chosen: the
 * file is read and summarised in the browser BEFORE anything is sent, so the
 * confirm step can say "55 副卡组 · 1081 条卡片记录" rather than asking you to
 * trust a filename.
 *
 * Both tiles say that same sentence — outgoing counts under 导出, the picked
 * file's counts under 导入 — so the two directions can be compared at a
 * glance, which is the actual question when moving between two installs:
 * "does what's arriving look like what left?"
 */
export function DataSection({ mine }: { mine: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<{
    name: string;
    text: string;
    summary: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function pick(f: File | null) {
    setMsg(null);
    setReport(null);
    if (!f) return setFile(null);
    const text = await f.text();
    try {
      const parsed = JSON.parse(text);
      if (!isUserExport(parsed)) throw new Error("not an export");
      setFile({ name: f.name, text, summary: describeExport(parsed) });
    } catch {
      setFile(null);
      setMsg({ ok: false, text: "这个文件不是本站导出的数据" });
    }
  }

  function clear() {
    setFile(null);
    setMsg(null);
    setReplace(false);
    // Without this the same file picked twice in a row fires no change event.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/account/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: JSON.parse(file.text), replace }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "导入失败");
      // Order matters: clear() resets the message along with the picked file,
      // so the result has to be set after it, not before.
      clear();
      setReport(j.report as ImportReport);
      setMsg({ ok: true, text: "导入完成" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const tile =
    "h-20 rounded-lg border flex flex-col items-center justify-center gap-1 text-sm cursor-pointer transition-colors px-3 text-center";

  return (
    <section
      aria-label="数据搬运"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <h2 className="text-sm font-semibold">数据搬运</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href="/api/account/export"
          download
          className={`${tile} border-[var(--color-border)] hover:bg-[var(--color-muted)]`}
        >
          <span aria-hidden className="text-lg leading-none">
            ⇣
          </span>
          导出
          <span className="text-xs text-[var(--color-muted-fg)]">{mine}</span>
        </a>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`${tile} border-dashed ${
            dragging
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
              : file
                ? "border-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          {file ? (
            <>
              <span className="max-w-full truncate">{file.name}</span>
              <span className="text-xs text-[var(--color-muted-fg)]">
                {file.summary}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden className="text-lg leading-none">
                ⇡
              </span>
              导入
            </>
          )}
        </label>
      </div>

      {file ? (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className={`h-8 px-3 rounded-md text-sm cursor-pointer disabled:opacity-50 ${
              replace
                ? "bg-red-600 text-white"
                : "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
            }`}
          >
            {busy ? "导入中…" : replace ? "清空并导入" : "合并导入"}
          </button>
          {/* The consequence is carried by the button, which renders 合并导入
              or 清空并导入 depending on this box. */}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            先清空本站数据
          </label>
          <button
            type="button"
            onClick={clear}
            className="ml-auto h-8 px-2 rounded-md text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-muted)] cursor-pointer"
          >
            取消
          </button>
        </div>
      ) : null}

      {msg ? (
        <div
          className={`text-xs ${msg.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {msg.text}
        </div>
      ) : null}

      {/* Same shape as the tiles above: counts first, then only what didn't
          land. The lines that used to explain what to do about each case are
          gone — "本站没有的卡" is already the instruction. */}
      {report ? (
        <div className="text-xs text-[var(--color-muted-fg)] space-y-1">
          <div>
            卡组 +{report.decks.created}
            {report.decks.updated
              ? ` · 更新 ${report.decks.updated}`
              : ""} · {report.cards} 条卡片记录
            {report.groups ? ` · ${report.groups} 个卡池` : ""}
            {report.collection ? ` · ${report.collection} 条收藏` : ""}
            {report.prices ? ` · ${report.prices} 条价格` : ""}
          </div>
          {report.missingCards.length ? (
            <div className="text-amber-600 dark:text-amber-400">
              本站没有的卡 {report.missingCards.length}:{" "}
              <span className="font-mono">
                {report.missingCards.slice(0, 8).join(" ")}
                {report.missingCards.length > 8 ? " …" : ""}
              </span>
            </div>
          ) : null}
          {report.conflicts.length ? (
            <div className="text-amber-600 dark:text-amber-400">
              属于别的账号,已跳过:{report.conflicts.join("、")}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
