/**
 * The passkey ceremonies, end to end, against a virtual authenticator.
 *
 * Chrome's WebAuthn devtools domain gives us a fake Touch ID: it answers
 * `navigator.credentials.create/get` without a human, so both round-trips —
 * begin, browser, finish — run exactly as they do on a real device.
 *
 * The pages have to be reached over `localhost`, not the suite's usual
 * 127.0.0.1: an IP address is not a valid RP ID and Chrome refuses the
 * ceremony outright.
 */
import { expect, test, type BrowserContextOptions } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3100";

type StoredState = Exclude<BrowserContextOptions["storageState"], string | undefined>;

function stateOnLocalhost(): StoredState {
  const raw = JSON.parse(
    fs.readFileSync("tests/e2e/.storageState.json", "utf8"),
  ) as StoredState;
  return {
    ...raw,
    cookies: raw.cookies.map((c) => ({ ...c, domain: "localhost" })),
  };
}

test("registers a passkey, then signs in with it", async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: stateOnLocalhost(),
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/digimon/settings`);
  await expect(page.getByText("暂无 Passkey。")).toBeVisible();

  await page.getByPlaceholder("如:Mac Touch ID / iPhone").fill("虚拟钥匙");
  await page.getByRole("button", { name: /添加 Passkey/ }).click();

  // The list replaces the empty state once the server has stored it.
  await expect(page.getByText("虚拟钥匙")).toBeVisible({ timeout: 15_000 });
  expect(errors, errors.join("\n")).toHaveLength(0);

  // Now sign in with it, from a session that has no cookie at all.
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /使用 Passkey 登录/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await page.goto(`${BASE}/digimon/settings`);
  await expect(page.getByText("虚拟钥匙")).toBeVisible();
  await ctx.close();
});
