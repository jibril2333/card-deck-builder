"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isStaleBuildError } from "@/lib/stale-build";
import { useI18n } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/messages";

const STALE_RELOAD_KEY = "cdb:stale-build-reload";
const STALE_RELOAD_COOLDOWN_MS = 30_000;

/** Has it been long enough since the last self-heal to try another one? */
function staleReloadDue(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(STALE_RELOAD_KEY) ?? 0);
    return Date.now() - last >= STALE_RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

/**
 * The panel every error boundary renders: what broke, a retry, a way out, and
 * — for the handful of failures with a known one-line fix — the fix.
 *
 * One case never reaches the panel. A deploy that lands while the app is open
 * leaves the tab a build behind, and its next Server Action call fails with an
 * ID this server has never seen. That is not an error anyone can act on: the
 * page reloads itself and the click can be repeated. See lib/stale-build.
 */
export function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { m } = useI18n();
  const params = useParams<{ game: string }>();
  const game = params?.game;
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const stale = isStaleBuildError(error);

  // Log to the dev console so it's easy to inspect, and report it so the
  // failure leaves something behind: an error thrown in the browser never
  // reaches the server's log, and "it showed an error page a few times today"
  // is not something anyone can act on. Fire and forget — a diagnostic must
  // not add a second failure to the one on screen.
  useEffect(() => {
    console.error("[error boundary]", error);
    try {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          url: window.location.href,
          name: error.name,
          message: error.message,
          digest: error.digest,
          stack: error.stack,
          stale,
        }),
      }).catch(() => {});
    } catch {
      /* offline, blocked, or no fetch — the console line is still there */
    }
  }, [error, stale]);

  // A tab left open across a deploy: reload it and the new build answers.
  // Once, though — the stamp is what stops a reload loop when the reload does
  // not fix it, and then the panel below gets to say what happened.
  //
  // The decision only READS the stamp, and the effect is what writes it. The
  // boundary is mounted more than once here (the failed action's own
  // router.refresh remounts it), and a decision that wrote the stamp as it
  // was made talked the second mount out of the reload the first one never
  // lived long enough to run.
  const reloading = stale && staleReloadDue();
  useEffect(() => {
    if (!reloading) return;
    try {
      sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
    } catch {
      // Private mode, or storage disabled. One reload is still the right move.
    }
    window.location.reload();
  }, [reloading]);

  if (reloading) {
    return (
      <main className="w-full mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-[var(--color-muted-fg)] text-center">
          {m.common.reloadingNewVersion}
        </p>
      </main>
    );
  }

  const hint = diagnoseError(error, m);

  const detail = [
    error.name ? `name: ${error.name}` : "",
    error.message ? `message: ${error.message}` : "",
    error.digest ? `digest: ${error.digest}` : "",
    error.stack ? `\n${error.stack}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  function copyDetail() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(detail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main className="w-full mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-6">
        <div className="flex items-start gap-3">
          <div className="text-3xl shrink-0" aria-hidden>
            ⚠️
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">{m.common.errorTitle}</h1>
            <p className="text-sm text-[var(--color-muted-fg)] mt-1">
              {m.common.errorBody}
            </p>
            <p className="mt-2 text-xs font-mono text-red-600 dark:text-red-300 break-words">
              {error.message || error.name || m.common.unknownError}
            </p>

            {hint ? (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="font-medium mb-1">{m.common.possibleFix}</div>
                <div className="text-[var(--color-muted-fg)] whitespace-pre-line">
                  {hint.message}
                </div>
                {hint.command ? (
                  <code className="mt-2 inline-block px-2 py-1 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono text-xs select-all">
                    {hint.command}
                  </code>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={reset}>
                {m.common.retry}
              </Button>
              {game ? (
                <Link href={`/${game}`}>
                  <Button size="sm" variant="outline">
                    {m.common.backToSearch}
                  </Button>
                </Link>
              ) : null}
              <Link href="/">
                <Button size="sm" variant="outline">
                  {m.common.backHome}
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setShowDetail((s) => !s)}
                className="ml-auto text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] cursor-pointer"
              >
                {showDetail ? m.common.hideDetail : m.common.showDetail}
              </button>
            </div>

            {showDetail ? (
              <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                    {m.common.errorDetail}
                  </span>
                  <button
                    type="button"
                    onClick={copyDetail}
                    className="text-[11px] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] cursor-pointer"
                  >
                    {copied ? m.common.copied : m.common.copy}
                  </button>
                </div>
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-words text-[var(--color-muted-fg)] leading-snug max-h-64 overflow-auto">
                  {detail}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Known-error diagnostics
//
// When something throws here, the user usually sees a useless message like
// "Error: The module 'X.node' was compiled against a different Node.js
// version". Most of those errors have a one-line fix — we just have to
// recognize them and tell the user what to type.
// ────────────────────────────────────────────────────────────────────────

type ErrorHint = {
  message: string;
  /** Optional shell command to copy-paste. */
  command?: string;
};

function diagnoseError(err: Error, t: Messages): ErrorHint | null {
  const m = err.message || "";

  // Node was upgraded since the last npm install; better-sqlite3's native
  // binary was compiled for the old NODE_MODULE_VERSION. Very common after
  // brew/nvm upgrades.
  if (
    /NODE_MODULE_VERSION/i.test(m) ||
    /ERR_DLOPEN_FAILED/i.test(m) ||
    /was compiled against a different Node\.js version/i.test(m) ||
    /Module did not self-register/i.test(m)
  ) {
    return {
      message:
        t.common.hintNativeBinding,
      command: "npm rebuild better-sqlite3",
    };
  }

  // Our own connection.ts throws this when CDB_*_DB env points somewhere
  // that doesn't exist. Make sure that error has the same level of guidance.
  if (/数据库文件不存在|database file does not exist/i.test(m)) {
    return {
      message:
        t.common.hintDbPath,
    };
  }

  // SQLite can't open the DB (often a permissions or stale lock issue).
  if (/SQLITE_CANTOPEN|unable to open database file/i.test(m)) {
    return {
      message:
        t.common.hintCantOpen,
    };
  }

  // SQLite says the schema doesn't match — usually means a migration is
  // pending or the DB is from a different app version.
  if (/no such table|no such column/i.test(m)) {
    return {
      message:
        t.common.hintSchema,
    };
  }

  return null;
}
