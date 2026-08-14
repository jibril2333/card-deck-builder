/**
 * What a refresh should push to the phone.
 *
 * The refresh already writes a changelog (scripts/diff-refresh.ts) and a status
 * file, but both of them only exist if you go and look. The two things worth
 * interrupting someone for are a banlist move — it can invalidate a deck you
 * already built — and a refresh that FAILED, because a silent failure means
 * the data quietly stops being current and nothing says so.
 *
 * A run that changed nothing sends nothing. That's most weeks, and a weekly
 * "no news" notification is how people learn to swipe the channel away.
 */

import { ntfyReady, type NtfyConfig } from "./ntfy-config";

/** The JSON summary `diff-refresh.ts` prints on its last stdout line. */
export type RefreshSummary = {
  runAt?: string;
  cardsAdded?: number;
  cardsRemoved?: number;
  fieldsChanged?: number;
  translationsAdded?: number;
  translationsChanged?: number;
  restrictions?: number;
  pairs?: number;
  artAdded?: Record<string, number>;
  total?: number;
};

export type Notification = {
  title: string;
  body: string;
  /** ntfy priority: 1 min … 5 max. */
  priority: number;
  tags: string[];
  click: string;
};

const n = (v: number | undefined) => v ?? 0;

/**
 * The notification for a successful run, or `null` when there's nothing to
 * say. Banlist moves lead — they're the only change here that can make a legal
 * deck illegal — and they raise the priority so the phone actually rings.
 */
export function buildRefreshNotification(
  summary: RefreshSummary,
  opts: { cardsBefore?: number; cardsAfter?: number; adminUrl: string },
): Notification | null {
  const banlist = n(summary.restrictions) + n(summary.pairs);
  const total = n(summary.total);
  if (total === 0) return null;

  const bits: string[] = [];
  const add = (label: string, v: number | undefined) => {
    if (n(v) > 0) bits.push(`${label} ${v}`);
  };
  add("新卡", summary.cardsAdded);
  add("卡片消失", summary.cardsRemoved);
  add("字段改动", summary.fieldsChanged);
  add("新译文", summary.translationsAdded);
  add("译文改动", summary.translationsChanged);
  add("禁限", summary.restrictions);
  add("禁卡组合", summary.pairs);

  const art = Object.entries(summary.artAdded ?? {})
    .filter(([, v]) => v > 0)
    .map(([lang, v]) => `${lang} ${v}`);
  if (art.length) bits.push(`新卡图 ${art.join("/")}`);

  const lines = [bits.join(" · ")];
  if (
    opts.cardsBefore !== undefined &&
    opts.cardsAfter !== undefined &&
    opts.cardsAfter !== opts.cardsBefore
  ) {
    lines.push(`卡片总数 ${opts.cardsBefore} → ${opts.cardsAfter}`);
  }
  if (banlist > 0) {
    // Said in words, because the number alone doesn't tell you it's the one
    // that can cost you a deck.
    lines.push("禁限表有变动 —— 受影响的卡组会在卡组页上标出来");
  }

  return {
    title: banlist > 0 ? `卡表更新 · 禁限变动 ${banlist}` : "卡表更新",
    body: lines.join("\n"),
    priority: banlist > 0 ? 4 : 3,
    tags: banlist > 0 ? ["rotating_light", "card_index"] : ["card_index"],
    click: opts.adminUrl,
  };
}

/**
 * The notification for a failed run. Always sent — this is the case where
 * silence is the actual problem.
 */
export function buildFailureNotification(
  stage: string,
  exitCode: number,
  opts: { adminUrl: string },
): Notification {
  return {
    title: "卡表更新失败",
    body: `${stage} 失败(exit ${exitCode})。线上库没有被改动,数据还是上一次的。`,
    priority: 5,
    tags: ["warning"],
    click: opts.adminUrl,
  };
}

/**
 * Publish one notification.
 *
 * Posted as JSON to the server root rather than as headers on the topic URL:
 * the titles are Chinese, HTTP header values are latin-1, and the header form
 * would arrive on the phone percent-encoded.
 *
 * Returns a reason instead of throwing — every caller (the refresh script, the
 * admin page's test button) wants to report the failure, not be derailed by it.
 */
export async function sendNtfy(
  cfg: NtfyConfig,
  note: Notification,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ntfyReady(cfg)) return { ok: false, error: "ntfy 还没配置好" };
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: cfg.topic,
        title: note.title,
        message: note.body,
        priority: note.priority,
        tags: note.tags,
        click: note.click,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    // 401/403 is the common one and means the token can't publish to this
    // topic — say which topic, since that's usually the actual mistake.
    return {
      ok: false,
      error: `${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
    };
  }
  return { ok: true };
}

/** The "does this work" push behind the admin panel's test button. */
export function buildTestNotification(adminUrl: string): Notification {
  return {
    title: "测试通知",
    body: "看到这条就说明 ntfy 配好了 —— 卡表有更新或者更新失败时会走同一条路。",
    priority: 3,
    tags: ["white_check_mark"],
    click: adminUrl,
  };
}
