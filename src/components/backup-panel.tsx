"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatTimestamp } from "@/lib/i18n/format";

type View = {
  r2: {
    enabled: boolean;
    endpoint: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretSet: boolean;
    secretHint: string;
    ready: boolean;
  };
};

type Status = {
  state: "off" | "running" | "starting" | "failed" | "missing-binary";
  message: string;
  since: string | null;
  restarts: number;
  r2: "off" | "on";
  target: string;
  replicaLatest: string | null;
  snapshotLatest: string | null;
  snapshotCount: number;
  lastError: { at: string; text: string } | null;
  lastDrill: { at: string; ok: boolean; message: string } | null;
  checkedAt: string;
} | null;

/**
 * Backup settings — the off-site replica, and whether any of it is working.
 *
 * The local copy takes no configuration (it is a directory the compose file
 * maps), so this panel is only the four things Cloudflare R2 needs plus the
 * one thing the page can't get anywhere else: proof. The status line is read
 * from what the daemon last wrote, because "I typed a bucket name in" and "my
 * data is leaving this machine" are different claims.
 *
 * The secret key is write-only, same as the ntfy token: shown masked with a
 * 更换 button rather than as an empty box that could mean "cleared".
 */
export function BackupPanel() {
  const { m, locale } = useI18n();
  const [cfg, setCfg] = useState<View | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [endpoint, setEndpoint] = useState("");
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [editingSecret, setEditingSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await fetch("/api/admin/backup");
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    apply(j.config as View);
    setStatus(j.status as Status);
  }

  useEffect(() => {
    let alive = true;
    // The panel's data comes from an API call; there is nothing to render
    // until it lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => alive && setMsg({ ok: false, text: m.admin.readConfigFailed }));
    // The daemon writes its status once a minute; follow it while the page is
    // open so "启用" and "正在复制" don't disagree for ten minutes.
    const t = setInterval(() => {
      if (!alive) return;
      fetch("/api/admin/backup")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && alive && setStatus(j.status as Status))
        .catch(() => {});
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(v: View) {
    setCfg(v);
    setEndpoint(v.r2.endpoint);
    setBucket(v.r2.bucket);
    setPrefix(v.r2.prefix);
    setKeyId(v.r2.accessKeyId);
    setEnabled(v.r2.enabled);
    setSecret("");
    setEditingSecret(false);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/backup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          r2: {
            enabled,
            endpoint,
            bucket,
            prefix,
            accessKeyId: keyId,
            secretAccessKey: secret,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? m.admin.saveFailed);
      apply(j.config as View);
      setMsg({ ok: true, text: m.admin.saved });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm";
  const btn =
    "h-8 px-3 rounded-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const label = "text-xs text-[var(--color-muted-fg)]";

  const dot =
    status?.state === "running"
      ? "bg-green-500"
      : status?.state === "failed" || status?.state === "missing-binary"
        ? "bg-red-500"
        : "bg-[var(--color-muted-fg)]";

  const when = (iso: string | null | undefined) => formatTimestamp(locale, iso);

  return (
    <section
      aria-label={m.admin.backup}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">{m.admin.backup}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          {status ? status.message : m.admin.loading}
        </span>
      </div>

      {/* What the daemon has actually seen. Nothing here is typed by anyone. */}
      {status ? (
        <div className="text-xs text-[var(--color-muted-fg)] space-y-0.5">
          <div>
            {status.target || m.admin.replicaCopy} · {when(status.replicaLatest)}
          </div>
          <div>
            {m.admin.localSnapshots(status.snapshotCount)} · {when(status.snapshotLatest)}
          </div>
          {status.lastError ? (
            <div className="text-amber-600 dark:text-amber-400">
              {when(status.lastError.at)} · {status.lastError.text}
            </div>
          ) : null}
          {status.lastDrill ? (
            <div
              className={
                status.lastDrill.ok
                  ? ""
                  : "text-red-600 dark:text-red-400 font-medium"
              }
            >
              {m.admin.drill} {when(status.lastDrill.at)} · {status.lastDrill.message}
            </div>
          ) : null}
        </div>
      ) : null}

      {cfg ? (
        <>
          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {m.admin.offsiteR2}
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <div className={label}>{m.admin.endpoint}</div>
              <input
                className={field}
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={m.admin.endpointPlaceholder}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="space-y-1">
              <div className={label}>{m.admin.bucket}</div>
              <input
                className={field}
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="cdb-backup"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="space-y-1">
              <div className={label}>{m.admin.path}</div>
              <input
                className={field}
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="digimon-user"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="space-y-1">
              <div className={label}>Access Key ID</div>
              <input
                className={field}
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {/* A div, not a <label>: wrapping a label around the masked
                state would rename the 更换 button to "Secret Access Key" —
                the input carries its own aria-label instead. */}
            <div className="space-y-1">
              <div className={label}>Secret Access Key</div>
              {cfg.r2.secretSet && !editingSecret ? (
                <div className="flex items-center gap-2">
                  <div
                    className={`${field} flex items-center font-mono text-[var(--color-muted-fg)] bg-[var(--color-muted)]/40`}
                  >
                    {cfg.r2.secretHint}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSecret(true);
                      setSecret("");
                    }}
                    className={`${btn} shrink-0 border border-[var(--color-border)] hover:bg-[var(--color-muted)]`}
                  >
                    {m.admin.replace}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    className={field}
                    aria-label="Secret Access Key"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus={editingSecret}
                  />
                  {cfg.r2.secretSet ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSecret(false);
                        setSecret("");
                      }}
                      className={`${btn} shrink-0 border border-[var(--color-border)] hover:bg-[var(--color-muted)]`}
                    >
                      {m.admin.cancel}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={`${btn} bg-[var(--color-accent)] text-[var(--color-accent-fg)]`}
            >
              {m.admin.save}
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
      ) : null}
    </section>
  );
}
