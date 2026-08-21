"use client";

import { useEffect, useState } from "react";

type View = {
  enabled: boolean;
  url: string;
  topic: string;
  tokenSet: boolean;
  tokenHint: string;
  ready: boolean;
};

/**
 * Push-notification settings: server, topic, token.
 *
 * A saved token is shown masked, with a 更换 button, rather than as an empty
 * box that means "keep it". The server never hands the value back (see the
 * route), and an empty password field reads as "there is no token" as readily
 * as "unchanged" — so the field only appears when you ask to replace it.
 *
 * The test button deliberately sends with the SAVED config rather than the
 * form's contents: a green tick has to mean "what the refresh will use works",
 * not "what you typed would have worked".
 */
export function NtfyPanel() {
  const [cfg, setCfg] = useState<View | null>(null);
  const [url, setUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  /** True while replacing a saved token — see the token field below. */
  const [editingToken, setEditingToken] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/ntfy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!alive) return;
        apply(j.config);
      })
      .catch(() => alive && setMsg({ ok: false, text: "读取配置失败" }));
    return () => {
      alive = false;
    };
  }, []);

  function apply(v: View) {
    setCfg(v);
    setUrl(v.url);
    setTopic(v.topic);
    setEnabled(v.enabled);
    setToken("");
    setEditingToken(false);
    setDirty(false);
  }

  function edit<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setDirty(true);
      setMsg(null);
    };
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/ntfy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, url, topic, token }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "保存失败");
      apply(j.config);
      setMsg({ ok: true, text: "已保存" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/ntfy/test", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "发送失败");
      setMsg({ ok: true, text: "已发出 —— 手机上应该收到「测试通知」" });
    } catch (e) {
      setMsg({ ok: false, text: `发送失败:${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm";
  const btn =
    "h-8 px-3 rounded-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <section
      aria-label="更新通知"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">更新通知 (ntfy)</h2>
      </div>

      {!cfg ? (
        <div className="text-xs text-[var(--color-muted-fg)]">读取中…</div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => edit(setEnabled)(e.target.checked)}
            />
            启用
          </label>

          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <label className="space-y-1">
              <div className="text-xs text-[var(--color-muted-fg)]">
                服务器地址
              </div>
              <input
                className={field}
                value={url}
                onChange={(e) => edit(setUrl)(e.target.value)}
                placeholder="https://ntfy.example.com"
                inputMode="url"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-[var(--color-muted-fg)]">
                订阅主题 (topic)
              </div>
              <input
                className={field}
                value={topic}
                onChange={(e) => edit(setTopic)(e.target.value)}
                placeholder="dcg"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-[var(--color-muted-fg)]">令牌 (token)</div>
            {cfg.tokenSet && !editingToken ? (
              // A saved secret is SHOWN, masked, rather than replaced by an
              // empty box that silently means "keep the old one". An empty
              // password field is ambiguous — it reads as "no token" and as
              // "cleared" just as easily as "unchanged" — so there isn't one
              // until you ask to replace the token, and saving can't wipe it
              // by accident.
              <div className="flex items-center gap-2">
                <div
                  className={`${field} flex items-center font-mono text-[var(--color-muted-fg)] bg-[var(--color-muted)]/40`}
                >
                  {cfg.tokenHint}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingToken(true);
                    setToken("");
                  }}
                  className={`${btn} shrink-0 border border-[var(--color-border)] hover:bg-[var(--color-muted)]`}
                >
                  更换
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  className={field}
                  value={token}
                  onChange={(e) => edit(setToken)(e.target.value)}
                  placeholder="tk_…"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={editingToken}
                />
                {cfg.tokenSet ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingToken(false);
                      setToken("");
                      setDirty(false);
                    }}
                    className={`${btn} shrink-0 border border-[var(--color-border)] hover:bg-[var(--color-muted)]`}
                  >
                    取消
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={`${btn} bg-[var(--color-accent)] text-[var(--color-accent-fg)]`}
            >
              保存
            </button>
            <button
              type="button"
              onClick={test}
              // Testing unsaved edits would prove nothing about what the
              // refresh is going to use.
              disabled={busy || dirty || !cfg.ready}
              title={
                dirty
                  ? "先保存再测试"
                  : !cfg.ready
                    ? "地址、主题、令牌都填好并启用后才能测试"
                    : "发一条测试通知"
              }
              className={`${btn} border border-[var(--color-border)] hover:bg-[var(--color-muted)]`}
            >
              发送测试通知
            </button>
            {msg ? (
              <span
                className={`text-xs ${
                  msg.ok
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {msg.text}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
