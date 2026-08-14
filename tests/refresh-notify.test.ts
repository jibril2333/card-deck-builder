import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFailureNotification,
  buildRefreshNotification,
} from "@/lib/refresh-notify";

const ADMIN = "https://example.test/digimon/admin";
const opts = { adminUrl: ADMIN };

describe("buildRefreshNotification", () => {
  it("says nothing when nothing changed", () => {
    // The weekly no-op run. A notification here is how a channel gets muted.
    expect(buildRefreshNotification({ total: 0 }, opts)).toBeNull();
    expect(buildRefreshNotification({}, opts)).toBeNull();
  });

  it("summarises an ordinary run", () => {
    const note = buildRefreshNotification(
      { cardsAdded: 3, translationsAdded: 40, fieldsChanged: 2, total: 45 },
      { ...opts, cardsBefore: 4370, cardsAfter: 4373 },
    )!;
    expect(note.title).toBe("卡表更新");
    expect(note.body).toContain("新卡 3");
    expect(note.body).toContain("新译文 40");
    expect(note.body).toContain("卡片总数 4370 → 4373");
    expect(note.priority).toBe(3);
    expect(note.click).toBe(ADMIN);
  });

  it("leads with a banlist move and raises the priority", () => {
    const note = buildRefreshNotification(
      { restrictions: 2, pairs: 1, total: 3 },
      opts,
    )!;
    expect(note.title).toBe("卡表更新 · 禁限变动 3");
    expect(note.priority).toBe(4);
    expect(note.tags).toContain("rotating_light");
    // Spelled out, because "禁限 2" alone doesn't tell you a deck may now be
    // illegal.
    expect(note.body).toContain("受影响的卡组");
  });

  it("leaves out the counts that are zero", () => {
    const note = buildRefreshNotification({ cardsAdded: 1, total: 1 }, opts)!;
    expect(note.body).not.toContain("译文");
    expect(note.body).not.toContain("禁限");
  });

  it("doesn't print a card total that didn't move", () => {
    const note = buildRefreshNotification(
      { fieldsChanged: 1, total: 1 },
      { ...opts, cardsBefore: 4370, cardsAfter: 4370 },
    )!;
    expect(note.body).not.toContain("卡片总数");
  });

  it("counts new artwork per language", () => {
    const note = buildRefreshNotification(
      { artAdded: { ja: 12, en: 3 }, total: 15 },
      opts,
    )!;
    expect(note.body).toContain("新卡图 ja 12/en 3");
  });

  it("reports a failure at max priority, saying the data is untouched", () => {
    const note = buildFailureNotification("text-ja", 1, opts);
    expect(note.priority).toBe(5);
    expect(note.title).toBe("卡表更新失败");
    expect(note.body).toContain("text-ja");
    expect(note.body).toContain("没有被改动");
  });
});

/**
 * The sender, against a throwaway HTTP server standing in for ntfy.
 *
 * Worth a real process: the interesting parts are all outside the pure
 * function — that the Chinese title survives (it goes as a JSON body rather
 * than an HTTP header for exactly this reason), that the topic is split off
 * the configured URL, and above all that nothing here can fail a refresh.
 */
describe("notify-refresh.ts", () => {
  let dir: string | null = null;
  const ROOT = process.cwd();

  /**
   * Run the script and hand back its log output — which goes to stderr, so
   * stdout stays clean for anything that wants to pipe it.
   *
   * Async on purpose. `spawnSync` blocks this process's event loop, and the
   * stand-in ntfy server lives in this very process: the child's POST would
   * connect, sit in the listen backlog unanswered, and both sides would wait
   * for each other until the suite timed out.
   */
  async function notify(args: string[], env: Record<string, string>): Promise<string> {
    // The whole contract of this script: it can't fail the refresh. execFile
    // rejects on a non-zero exit, so simply not throwing is the assertion.
    const { stderr } = await promisify(execFile)(
      "npx",
      ["tsx", "scripts/notify-refresh.ts", ...args],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } },
    );
    return stderr;
  }

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  async function run(
    args: string[],
    env: Record<string, string>,
  ): Promise<{ body?: unknown; auth?: string; url?: string; stderr: string }> {
    const received: { body?: unknown; auth?: string; url?: string } = {};
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        received.url = req.url;
        received.auth = req.headers.authorization;
        try {
          received.body = JSON.parse(raw);
        } catch {
          received.body = raw;
        }
        res.writeHead(200).end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-ntfy-"));
    // Written the way the admin page writes it — the file IS the interface
    // between the container and this host script.
    fs.writeFileSync(
      path.join(dir, "ntfy.json"),
      JSON.stringify({
        enabled: true,
        url: `http://127.0.0.1:${port}`,
        topic: "dcg",
        token: "tk_test",
      }),
    );

    const stderr = await notify(args, { CDB_DATA_DIR: dir, ...env });
    // Node's fetch keeps the connection alive, and `close()` waits for open
    // sockets — without this the server never finishes closing and the test
    // sits there until the suite times out.
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    return { ...received, stderr };
  }

  it("posts the notification as JSON, with the topic split off the URL", async () => {
    const { body, auth, url } = await run(
      ["ok", JSON.stringify({ restrictions: 1, total: 1 }), "10", "12"],
      {},
    );
    expect(url).toBe("/");
    expect(auth).toBe("Bearer tk_test");
    expect(body).toMatchObject({
      topic: "dcg",
      title: "卡表更新 · 禁限变动 1",
      priority: 4,
    });
    // The point of the JSON form: this survives as UTF-8.
    expect((body as { message: string }).message).toContain("禁限");
  });

  it("sends nothing for a run that changed nothing", async () => {
    const r = await run(["ok", JSON.stringify({ total: 0 })], {});
    expect(r.body).toBeUndefined();
    expect(r.stderr).toContain("nothing changed");
  });

  it("survives a summary that isn't JSON", async () => {
    // diff-refresh failing is already non-fatal upstream; this must not undo
    // that by throwing here.
    const r = await run(["ok", "not json at all"], {});
    expect(r.body).toBeUndefined();
    expect(r.stderr).toContain("unreadable");
  });

  it("stays quiet, and exits 0, when no token is configured", async () => {
    const quiet = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-ntfy-none-"));
    const out = await notify(["ok", JSON.stringify({ total: 5, cardsAdded: 5 })], {
      CDB_DATA_DIR: quiet,
      CDB_NTFY_URL: "",
      CDB_NTFY_TOKEN: "",
    });
    expect(out).toContain("not configured");
    fs.rmSync(quiet, { recursive: true, force: true });
  });

  it("exits 0 even when the server is unreachable", async () => {
    // The refresh has already swapped a validated database in by the time this
    // runs. A dead ntfy must not turn that into a failed run.
    const quiet = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-ntfy-dead-"));
    fs.writeFileSync(
      path.join(quiet, "ntfy.json"),
      // Port 1 — nothing listens there.
      JSON.stringify({ enabled: true, url: "http://127.0.0.1:1", topic: "dcg", token: "tk_test" }),
    );
    // notify() asserts exit 0 itself, by not throwing.
    const out = await notify(["failed", "text-ja", "1"], { CDB_DATA_DIR: quiet });
    expect(out).toMatch(/ntfy/);
    fs.rmSync(quiet, { recursive: true, force: true });
  });
});
