"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeExport, isUserExport, type ImportReport } from "@/lib/user-data";

/**
 * Carry this account's work to another install of the app, or keep a copy.
 *
 * Two deployments share nothing: the same person on the NAS and on the Mac is
 * two accounts with two ids. This is the bridge — and it deliberately moves
 * only what is yours to move (see lib/user-data.ts: no password, no sessions,
 * no passkeys).
 *
 * The file is read and summarised in the browser BEFORE anything is sent, so
 * the confirm step can say "55 副卡组 · 1081 条卡片记录" rather than asking
 * you to trust a filename.
 */
export function DataSection() {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string; summary: string } | null>(null);
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
      setReport(j.report as ImportReport);
      setMsg({ ok: true, text: "导入完成" });
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="数据搬运"
      className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4"
    >
      <div>
        <h2 className="text-sm font-semibold">数据搬运</h2>
        <p className="text-xs text-[var(--color-muted-fg)] mt-1">
          把你的卡组、卡池、收藏和价格带到另一个站点,或者留一份自己的备份。
          文件里<b>不含密码、登录状态和 passkey</b> —— 导入时所有数据都会挂到
          当前登录的账号名下。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/account/export"
          download
          className="h-8 px-3 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)] flex items-center"
        >
          ⇣ 导出我的数据
        </a>
      </div>

      <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
        <label className="block text-xs text-[var(--color-muted-fg)]">
          导入
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs file:mr-3 file:h-8 file:px-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-transparent file:text-[var(--color-fg)] file:cursor-pointer"
          />
        </label>

        {file ? (
          <div className="rounded-md border border-[var(--color-border)] p-3 space-y-2">
            <div className="text-xs">
              <b>{file.name}</b>
              <div className="text-[var(--color-muted-fg)] mt-0.5">{file.summary}</div>
            </div>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                先清空我在这个站点上的数据
                <span className="text-[var(--color-muted-fg)]">
                  {" "}
                  —— 不勾就是合并:同一副卡组会被文件里的版本覆盖,文件里没有的保持不动
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="h-8 px-3 rounded-md text-sm cursor-pointer bg-[var(--color-accent)] text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              {busy ? "导入中…" : replace ? "清空并导入" : "合并导入"}
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

        {report ? (
          <div className="text-xs text-[var(--color-muted-fg)] space-y-1">
            <div>
              卡组 新建 {report.decks.created} · 更新 {report.decks.updated} ·
              卡片 {report.cards} 条 · 卡池 {report.groups} · 收藏{" "}
              {report.collection} · 价格 {report.prices}
            </div>
            {report.missingCards.length ? (
              <div className="text-amber-600 dark:text-amber-400">
                这个站点还没有的卡,已跳过({report.missingCards.length}):{" "}
                {report.missingCards.slice(0, 8).join(", ")}
                {report.missingCards.length > 8 ? " …" : ""}
                <div>更新一次卡表后重新导入即可补上。</div>
              </div>
            ) : null}
            {report.conflicts.length ? (
              <div className="text-amber-600 dark:text-amber-400">
                这些卡组的 id 在本站属于别的账号,已跳过:{" "}
                {report.conflicts.join("、")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
