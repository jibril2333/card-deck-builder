/**
 * 错误边界会把它捕获到的东西报回来。
 *
 * The panel is what the user sees; this is what makes the next occurrence
 * diagnosable. The endpoint is public and writes to disk, so the bounds are
 * asserted too.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const DIR = fs.readFileSync("tests/e2e/.datadir", "utf8").trim();
const log = path.join(DIR, "client-errors.log");

test.afterEach(() => fs.rmSync(log, { force: true }));

test("records what the browser reports, and refuses what it should", async ({
  request,
}) => {
  const res = await request.post("/api/client-error", {
    data: {
      url: "https://deck.example/digimon/decks",
      name: "TypeError",
      message: "x is not a function",
      stack: "at Component",
    },
  });
  expect(res.status()).toBe(204);

  const written = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  expect(written).toHaveLength(1);
  expect(written[0]).toMatchObject({
    name: "TypeError",
    message: "x is not a function",
    url: "https://deck.example/digimon/decks",
  });
  expect(written[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // Not JSON, and a body far larger than a panel would ever send.
  expect((await request.post("/api/client-error", { data: "nonsense" })).status())
    .toBe(400);
  const big = await request.post("/api/client-error", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ stack: "x".repeat(20_000) }),
  });
  expect(big.status()).toBe(413);
});
