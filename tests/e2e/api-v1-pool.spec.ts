/**
 * 共享卡池 through the native API, against a pool made on the website.
 *
 * The pool is the one rule in this app that cannot be re-derived on the
 * client: held counts belong to the POOL, not to the deck being looked at,
 * and each member deck sees them capped at what it runs. Two decks sharing
 * three copies of a card — one running two, one running four — is the case
 * that catches every wrong implementation, because the small deck's own
 * number (2) is not the number a ± should count from.
 *
 * Both surfaces are exercised on purpose: the pool is created in the
 * browser, the edits are made over HTTP, and the results are read back both
 * ways. That is the actual arrangement — the phone respects a pool set up on
 * the website — and it is also what proves the two share one implementation
 * rather than two that agree today.
 */

import { expect, test, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe.configure({ mode: "serial" });

/** The browser's own session, reused as a Bearer token for the same account. */
function sessionToken(): string {
  const state = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "tests/e2e/.storageState.json"),
      "utf8",
    ),
  ) as { cookies: { name: string; value: string }[] };
  return state.cookies.find((c) => c.name === "cdb_session")!.value;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Detail = {
  deck: { id: string; locked: boolean };
  revision: string;
  cards: {
    card: { id: string; code: string };
    quantity: number;
    purchased: number;
    missing: number;
    owned_control_value: number;
    shared: boolean;
  }[];
  adjustments: { code: string; requested: number; actual: number }[];
};

async function get(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<Detail> {
  const res = await request.get(`/api/v1/decks/${id}`, {
    headers: auth(token),
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

function card(deck: Detail, code: string) {
  const hit = deck.cards.find((c) => c.card.code === code);
  if (!hit) throw new Error(`${code} not in deck`);
  return hit;
}

test("held counts are the pool's, and a ± counts from the pool", async ({
  page,
  request,
}) => {
  const token = sessionToken();
  const stamp = Date.now().toString().slice(-5);

  // Two decks of the same account, made over the API.
  const make = async (name: string, quantity: number) => {
    const created = await request.post("/api/v1/decks", {
      headers: auth(token),
      data: { client_request_id: crypto.randomUUID(), name },
    });
    expect(created.status()).toBe(201);
    const deck = (await created.json()) as Detail;
    const filled = await request.put(
      `/api/v1/decks/${deck.deck.id}/cards/BT1-084`,
      {
        headers: auth(token),
        data: { expected_revision: deck.revision, quantity },
      },
    );
    expect(filled.status(), await filled.text()).toBe(200);
    return deck.deck.id;
  };
  const small = await make(`池小 ${stamp}`, 2);
  const large = await make(`池大 ${stamp}`, 4);

  // Before pooling, each deck's held is its own.
  expect(card(await get(request, token, small), "BT1-084").shared).toBe(false);

  // The pool is made in the browser — the phone does not manage pools in
  // this version, it respects the ones already set up.
  await page.goto("/digimon/decks");
  await page.getByRole("button", { name: /新建卡池/ }).click();
  await page.waitForURL(/\/digimon\/groups\/[a-z0-9-]+/i);
  for (const id of [small, large]) {
    await page.goto(`/digimon/decks/${id}`);
    await page.getByLabel("共享卡池").selectOption({ index: 1 });
    await expect(page.getByLabel("打开卡池")).toBeVisible();
  }

  // The API sees it, and every member reports the same shared flag.
  let smallDeck = await get(request, token, small);
  let largeDeck = await get(request, token, large);
  expect(card(smallDeck, "BT1-084").shared).toBe(true);
  expect(card(largeDeck, "BT1-084").shared).toBe(true);

  // Buy three copies from the big deck. The pool holds three; the small deck
  // shows two, because two is all it runs.
  const bought = await request.put(`/api/v1/decks/${large}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: largeDeck.revision, purchased: 3 },
  });
  expect(bought.status(), await bought.text()).toBe(200);
  largeDeck = await bought.json();
  expect(card(largeDeck, "BT1-084").purchased).toBe(3);
  expect(card(largeDeck, "BT1-084").owned_control_value).toBe(3);

  smallDeck = await get(request, token, small);
  expect(card(smallDeck, "BT1-084").purchased).toBe(2);
  expect(card(smallDeck, "BT1-084").missing).toBe(0);
  // The control the purchase screen binds to is the POOL's three, not the
  // two this deck was capped at. Binding to the capped number is the bug
  // this assertion exists for.
  expect(card(smallDeck, "BT1-084").owned_control_value).toBe(3);

  // Pressing − in the SMALL deck takes the pool from 3 to 2 — not to 1.
  const down = await request.put(`/api/v1/decks/${small}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: smallDeck.revision, purchased_delta: -1 },
  });
  expect(down.status(), await down.text()).toBe(200);
  smallDeck = await down.json();
  expect(card(smallDeck, "BT1-084").owned_control_value).toBe(2);
  largeDeck = await get(request, token, large);
  expect(card(largeDeck, "BT1-084").purchased).toBe(2);

  // The pool never records more copies than the biggest member deck runs.
  const tooMany = await request.put(`/api/v1/decks/${small}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: smallDeck.revision, purchased: 9 },
  });
  expect(tooMany.status()).toBe(200);
  smallDeck = await tooMany.json();
  expect(smallDeck.adjustments[0].code).toBe("HELD_CAPPED");
  expect(smallDeck.adjustments[0].requested).toBe(9);
  expect(smallDeck.adjustments[0].actual).toBe(4);
  expect(card(smallDeck, "BT1-084").owned_control_value).toBe(4);

  // A locked member is skipped by the levelling rather than blocking it.
  largeDeck = await get(request, token, large);
  const locked = await request.patch(`/api/v1/decks/${large}`, {
    headers: auth(token),
    data: { expected_revision: largeDeck.revision, locked: true },
  });
  expect(locked.status()).toBe(200);
  const lockedHeld = card(
    await get(request, token, large),
    "BT1-084",
  ).purchased;

  smallDeck = await get(request, token, small);
  const afterLock = await request.put(`/api/v1/decks/${small}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: smallDeck.revision, purchased_delta: -1 },
  });
  expect(afterLock.status(), await afterLock.text()).toBe(200);
  expect(card(await afterLock.json(), "BT1-084").purchased).toBe(2);
  // The locked deck kept its own number: a closed deck is not rewritten.
  expect(card(await get(request, token, large), "BT1-084").purchased).toBe(
    lockedHeld,
  );

  // Put the fixture back. The decks list files a locked, incomplete deck
  // under 封存, and decks-legacy.spec asserts that section is absent — a
  // deck left locked here is a failure over there, several specs later.
  largeDeck = await get(request, token, large);
  const unlocked = await request.patch(`/api/v1/decks/${large}`, {
    headers: auth(token),
    data: { expected_revision: largeDeck.revision, locked: false },
  });
  expect(unlocked.status()).toBe(200);
});

test("a change made on the website invalidates the app's revision", async ({
  page,
  request,
}) => {
  const token = sessionToken();
  const created = await request.post("/api/v1/decks", {
    headers: auth(token),
    data: {
      client_request_id: crypto.randomUUID(),
      name: `网页改动 ${Date.now().toString().slice(-5)}`,
    },
  });
  const deck = (await created.json()) as Detail;

  // The phone read the deck; now the browser edits it. This is the case the
  // whole version mechanism exists for, and it only works because the
  // revision is derived from the rows rather than counted by the API.
  await page.goto(`/digimon/decks/${deck.deck.id}`);
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  await page.getByPlaceholder("搜卡加入卡组…").fill("Omnimon");
  const add = page.getByLabel("加入卡组 Omnimon");
  await add.waitFor();
  await add.click();
  await expect(
    page.locator(".card-grid > div").filter({ hasText: "BT1-084" }),
  ).toBeVisible();

  const stale = await request.patch(`/api/v1/decks/${deck.deck.id}`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, name: "手机改名" },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.code).toBe("REVISION_CONFLICT");

  // Re-reading gives a revision that works.
  const fresh = await get(request, token, deck.deck.id);
  const ok = await request.patch(`/api/v1/decks/${deck.deck.id}`, {
    headers: auth(token),
    data: { expected_revision: fresh.revision, name: "手机改名" },
  });
  expect(ok.status()).toBe(200);
});
