/**
 * The first account on a database that has none.
 *
 * A fresh deployment used to have no way in: registration needs an invite
 * code, invite codes come from a script on the host, and the admin pages need
 * an entry in `CDB_ADMIN_EMAILS` that a new operator has no reason to know
 * about. The image is published for other people to run, so these fix what
 * "first start" does — including the part that must NOT happen, which is
 * shipping a fixed default password on a public URL.
 *
 * Driven in child processes: `getDB` caches per game inside a process, so one
 * test's connection would answer for the next one's.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const run = promisify(execFile);
let dir: string;

/** A data directory with schema and no accounts, as `npm run init-db` leaves it. */
async function freshDir(name: string): Promise<string> {
  const d = path.join(dir, name);
  fs.mkdirSync(d, { recursive: true });
  await run("npx", ["tsx", "scripts/init-db.ts"], {
    cwd: ROOT,
    env: { ...process.env, CDB_DATA_DIR: d },
  });
  return d;
}

/** Connect (which is what triggers the bootstrap) and report what is there. */
async function connect(
  dataDir: string,
  env: Record<string, string> = {},
): Promise<{
  stdout: string;
  users: Record<string, unknown>[];
  matches?: boolean;
}> {
  const script = path.join(dataDir, "probe.ts");
  fs.writeFileSync(
    script,
    // Everything is imported by absolute path: the script sits in a temp
    // directory, outside any node_modules, so a bare `import "bcryptjs"`
    // would not resolve. Checking the password through `verifyPassword` is
    // the better test anyway — it is the function the login form calls.
    `import { getDB } from "${ROOT}/src/lib/db/connection";
     import { verifyPassword } from "${ROOT}/src/lib/auth/repo";
     (async () => {
       const db = getDB("digimon");
       const rows = db.prepare(
         "SELECT email, display_name, is_admin FROM user.users",
       ).all();
       const probe = process.env.PROBE_PASSWORD;
       const matches = probe
         ? !!(await verifyPassword("admin@localhost", probe))
         : undefined;
       console.log("<<<" + JSON.stringify({ rows, matches }) + ">>>");
     })();`,
  );
  const { stdout } = await run("npx", ["tsx", script], {
    cwd: ROOT,
    env: { ...process.env, CDB_DATA_DIR: dataDir, ...env },
  });
  const m = stdout.match(/<<<([\s\S]*)>>>/);
  const parsed = JSON.parse(m![1]) as {
    rows: Record<string, unknown>[];
    matches?: boolean;
  };
  return { stdout, users: parsed.rows, matches: parsed.matches };
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-bootstrap-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("first start", () => {
  it("creates one administrator and prints its password once", async () => {
    const d = await freshDir("plain");
    const first = await connect(d);
    expect(first.users).toEqual([
      expect.objectContaining({
        email: "admin@localhost",
        display_name: "admin",
        is_admin: 1,
      }),
    ]);
    // The operator who just started the container is looking at this log; it
    // is the only place the password appears.
    expect(first.stdout).toContain("已创建管理员账号");
    expect(first.stdout).toMatch(/密码:\S+/);

    // Second start: no second account, and nothing printed again.
    const second = await connect(d);
    expect(second.users).toHaveLength(1);
    expect(second.stdout).not.toContain("已创建管理员账号");
  }, 120_000);

  it("does not ship a fixed default password", async () => {
    // The single most scanned-for weakness on a public URL. Two fresh
    // installs must not end up with the same credentials.
    const [a, b] = await Promise.all([
      freshDir("rand-a").then((d) => connect(d)),
      freshDir("rand-b").then((d) => connect(d)),
    ]);
    const pw = (s: string) => s.match(/密码:(\S+)/)![1];
    expect(pw(a.stdout)).not.toBe(pw(b.stdout));
    expect(pw(a.stdout).length).toBeGreaterThanOrEqual(12);
  }, 120_000);

  it("takes the password from CDB_ADMIN_PASSWORD, and keeps it out of the log", async () => {
    const d = await freshDir("configured");
    const r = await connect(d, {
      CDB_ADMIN_PASSWORD: "admin",
      PROBE_PASSWORD: "admin",
    });
    expect(r.users[0]).toMatchObject({ is_admin: 1 });
    expect(r.matches, "配置的密码应当能登录").toBe(true);
    expect(r.stdout).toContain("密码取自 CDB_ADMIN_PASSWORD");
    expect(r.stdout).not.toContain("密码:admin");
  }, 120_000);

  it("stays out of the way when the database already has accounts", async () => {
    const d = await freshDir("occupied");
    await connect(d, { CDB_ADMIN_PASSWORD: "admin" });
    // A second connection with an empty-looking configuration must not add
    // anything: the table is no longer empty.
    const again = await connect(d);
    expect(again.users).toHaveLength(1);
  }, 120_000);

  it("can be switched off entirely", async () => {
    const d = await freshDir("disabled");
    const r = await connect(d, { CDB_BOOTSTRAP_ADMIN: "off" });
    expect(r.users).toEqual([]);
  }, 120_000);
});
