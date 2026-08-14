/**
 * Where the refresh notification gets sent, and by what right.
 *
 * Three fields because that's what an ntfy setup actually is: the server, the
 * topic you subscribe your phone to, and a token that's allowed to publish to
 * it. Kept apart rather than as one pasted URL so the panel can show the topic
 * on its own — that's the string you type into the ntfy app, and burying it in
 * a URL is how people end up subscribed to the wrong thing.
 *
 * Written by the admin page into `data.nosync/ntfy.json`, read by the HOST
 * (scripts/notify-refresh.ts) at the end of a refresh — the same
 * app-writes-a-file, host-reads-it arrangement the schedule uses, and for the
 * same reason: this container is internet-facing and has no business running
 * anything on the machine.
 */

export type NtfyConfig = {
  enabled: boolean;
  /** Server base, e.g. `https://ntfy.raynefall.dev`. No trailing path. */
  url: string;
  /** Topic name, e.g. `dcg`. */
  topic: string;
  /** Publish token (`tk_…`). Stored as given; never sent back to the browser. */
  token: string;
};

export const EMPTY_NTFY: NtfyConfig = {
  enabled: false,
  url: "",
  topic: "",
  token: "",
};

/** True once there's enough here to actually send something. */
export function ntfyReady(c: NtfyConfig): boolean {
  return c.enabled && c.url !== "" && c.topic !== "" && c.token !== "";
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Coerce whatever's in the file (or the request body) into a config.
 *
 * Lenient on purpose about the URL: people paste `ntfy.example.com`, or the
 * full topic URL `https://ntfy.example.com/dcg`. Both are understood — the
 * second one moves its last segment into `topic` when the topic field is
 * empty, which is exactly what someone pasting a URL meant.
 */
export function parseNtfyConfig(raw: unknown): NtfyConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  let url = str(o.url);
  let topic = str(o.topic).replace(/^\/+|\/+$/g, "");

  if (url !== "") {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/+|\/+$/g, "");
      // A pasted topic URL: take the topic off it rather than posting to a
      // path the server doesn't have.
      if (path && topic === "") topic = path;
      url = u.origin;
    } catch {
      // Leave it as typed; `ntfyReady` still lets it through and the send
      // reports the real error, which beats silently blanking what they wrote.
    }
  }

  return {
    enabled: o.enabled === undefined ? url !== "" : Boolean(o.enabled),
    url,
    topic,
    token: str(o.token),
  };
}

/**
 * What the browser is allowed to see. The token never leaves the server — the
 * page only needs to know whether one is set, and enough of it to recognise
 * which one.
 */
export function maskToken(token: string): string {
  if (token === "") return "";
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 5)}…${token.slice(-4)}`;
}
