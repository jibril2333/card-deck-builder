/**
 * `/api/v1` over real HTTP, against the real server and a real database.
 *
 * This is the native app's whole view of the product, so it is tested the
 * way the app will meet it: status codes, error codes, headers and JSON
 * bodies — never by calling the functions underneath. A handler that throws
 * the right exception and a handler that returns the right response are not
 * the same thing, and only one of them is the contract.
 *
 * The account is `API_USER`, seeded with a real bcrypt hash because this is
 * the only surface that exercises the login. The browser specs' own session
 * token doubles as a SECOND account here, which is what makes the friend
 * cases ("may read, may not write") testable.
 */

import { expect, test, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { API_USER } from "./fixtures/seed";

test.describe.configure({ mode: "serial" });

/** The browser specs' pre-authenticated session — a different account. */
function friendToken(): string {
  const state = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "tests/e2e/.storageState.json"),
      "utf8",
    ),
  ) as { cookies: { name: string; value: string }[] };
  const cookie = state.cookies.find((c) => c.name === "cdb_session");
  if (!cookie) throw new Error("no e2e session cookie to borrow");
  return cookie.value;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/v1/session", {
    data: { email: API_USER.email, password: API_USER.password },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).token as string;
}

/** A deck of this account's, with a known revision. */
async function makeDeck(
  request: APIRequestContext,
  token: string,
  name: string,
) {
  const res = await request.post("/api/v1/decks", {
    headers: auth(token),
    data: { client_request_id: crypto.randomUUID(), name },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as DeckJson;
}

/** One card row out of a deck response, or a failure naming the card. */
function card(deck: DeckJson, code: string) {
  const hit = deck.cards.find((c) => c.card.code === code);
  if (!hit) throw new Error(`${code} not in deck`);
  return hit;
}

/** The half of the deck response these specs assert against. */
type DeckJson = {
  deck: {
    id: string;
    name: string;
    locked: boolean;
    owner: { display_name: string; is_me: boolean };
    issues: unknown[];
  };
  notes: string;
  revision: string;
  can_edit: boolean;
  cards: {
    card: { id: string; code: string };
    quantity: number;
    purchased: number;
    missing: number;
    owned_control_value: number;
    shared: boolean;
    price_yen: number | null;
  }[];
  totals: Record<string, number>;
  adjustments: {
    code: string;
    message: string;
    requested: number;
    actual: number;
  }[];
};

test("meta answers without a token and names its capabilities", async ({
  request,
}) => {
  const res = await request.get("/api/v1/meta");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.api_version).toBe("1");
  expect(body.capabilities).toContain("decks");
  expect(body.capabilities).toContain("pool_shared_held");
  // Nothing about the deployment leaks through the anonymous endpoint.
  expect(JSON.stringify(body)).not.toMatch(/\/(app|Users|data)\b/);
});

test("every unauthenticated shape is distinguishable", async ({ request }) => {
  // No header at all.
  const anon = await request.get("/api/v1/decks");
  expect(anon.status()).toBe(401);
  const body = await anon.json();
  expect(body.error.code).toBe("UNAUTHENTICATED");
  // The id is what a reader can quote off the screen; it must be in the body.
  expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/);

  // A token that was never issued reads the same as an expired one: the
  // client's next move is the same either way.
  const junk = await request.get("/api/v1/decks", {
    headers: auth("not-a-real-token"),
  });
  expect(junk.status()).toBe(401);
  expect((await junk.json()).error.code).toBe("UNAUTHENTICATED");

  // A wrong password is a DIFFERENT code at the same status, because the
  // reader stays on the login form rather than being sent back to it.
  const wrong = await request.post("/api/v1/session", {
    data: { email: API_USER.email, password: "not-the-password" },
  });
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).error.code).toBe("INVALID_CREDENTIALS");
});

test("login, read the session, log out — and the other session survives", async ({
  request,
}) => {
  const token = await login(request);
  const friend = friendToken();

  const session = await request.get("/api/v1/session", {
    headers: auth(token),
  });
  expect(session.status()).toBe(200);
  const body = await session.json();
  expect(body.account.email).toBe(API_USER.email);
  expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());
  // The password is never echoed anywhere in the session shape.
  expect(JSON.stringify(body)).not.toContain(API_USER.password);

  const out = await request.delete("/api/v1/session", {
    headers: auth(token),
  });
  expect(out.status()).toBe(204);
  expect(
    (await request.get("/api/v1/session", { headers: auth(token) })).status(),
  ).toBe(401);
  // Signing out on one device leaves the other signed in.
  expect(
    (await request.get("/api/v1/session", { headers: auth(friend) })).status(),
  ).toBe(200);
});

test("cards: search, filter, and one card's ordered fields", async ({
  request,
}) => {
  const token = await login(request);

  const page1 = await request.get(
    "/api/v1/cards?q=BT1-086&q_mode=name&page_size=5",
    { headers: auth(token) },
  );
  expect(page1.status()).toBe(200);
  const list = await page1.json();
  expect(list.page).toBe(1);
  expect(list.page_size).toBe(5);
  const card = list.items.find((c: { code: string }) => c.code === "BT1-086");
  expect(card).toBeTruthy();
  // Default languages: Chinese text over Japanese art, each reporting what
  // it actually managed to use.
  expect(card.name).toBe("石田大和");
  expect(card.effective_text_lang).toBe("zh");
  expect(card.effective_art_lang).toBe("ja");
  expect(card.canonical_type).toBe("Tamer");

  // A language the card has no row for falls back and SAYS it fell back.
  const en = await request.get("/api/v1/cards?q=BT1-084&lang=zh", {
    headers: auth(token),
  });
  const omni = (await en.json()).items[0];
  expect(omni.code).toBe("BT1-084");
  expect(omni.effective_text_lang).toBe("en");

  // Junk is refused rather than coerced.
  const bad = await request.get("/api/v1/cards?page=0", {
    headers: auth(token),
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe("INVALID_INPUT");
  const tooManyColours = await request.get(
    "/api/v1/cards?color=Red&color=Blue&color=Green",
    { headers: auth(token) },
  );
  expect(tooManyColours.status()).toBe(400);

  const detail = await request.get(`/api/v1/cards/${card.id}`, {
    headers: auth(token),
  });
  expect(detail.status()).toBe(200);
  const d = await detail.json();
  expect(d.card.code).toBe("BT1-086");
  expect(d.fields.length).toBeGreaterThan(0);
  // Every field arrives named and non-empty — an unlabelled row is what the
  // client would have to invent a word for.
  for (const f of d.fields) {
    expect(f.label, f.key).toBeTruthy();
    expect(f.value, f.key).not.toBe("");
  }
  // A Tamer prints no level and no DP; the model must not send empty ones.
  expect(d.fields.map((f: { key: string }) => f.key)).not.toContain("dp");

  expect(
    (
      await request.get("/api/v1/cards/no-such-card", { headers: auth(token) })
    ).status(),
  ).toBe(404);
});

test("creating a deck twice with one id creates one deck", async ({
  request,
}) => {
  const token = await login(request);
  const id = crypto.randomUUID();
  const body = { client_request_id: id, name: `幂等 ${Date.now()}` };

  const first = await request.post("/api/v1/decks", {
    headers: auth(token),
    data: body,
  });
  expect(first.status()).toBe(201);
  expect((await first.json()).deck.id).toBe(id);

  // The retry after a lost response. Same id, same deck, no second row.
  const retry = await request.post("/api/v1/decks", {
    headers: auth(token),
    data: body,
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).deck.id).toBe(id);

  const list = await request.get("/api/v1/decks", { headers: auth(token) });
  const mine = (await list.json()).items.filter(
    (d: { id: string }) => d.id === id,
  );
  expect(mine).toHaveLength(1);

  // Somebody else's id is a collision, not a permission problem: the remedy
  // is a new id rather than a different account.
  const theirs = await request.post("/api/v1/decks", {
    headers: auth(friendToken()),
    data: { client_request_id: id, name: "撞号" },
  });
  expect(theirs.status()).toBe(409);
  expect((await theirs.json()).error.code).toBe("ID_CONFLICT");

  // A name that is only whitespace is not a name.
  const blank = await request.post("/api/v1/decks", {
    headers: auth(token),
    data: { client_request_id: crypto.randomUUID(), name: "   " },
  });
  expect(blank.status()).toBe(400);
});

test("a write needs the current revision, and one write invalidates it", async ({
  request,
}) => {
  const token = await login(request);
  const deck = await makeDeck(request, token, `版本 ${Date.now()}`);
  const url = `/api/v1/decks/${deck.deck.id}`;

  // No version at all is a client protocol error, not a conflict: the app
  // skipped the read it was supposed to do.
  const naked = await request.patch(url, {
    headers: auth(token),
    data: { name: "改名" },
  });
  expect(naked.status()).toBe(428);
  expect((await naked.json()).error.code).toBe("REVISION_REQUIRED");

  const renamed = await request.patch(url, {
    headers: auth(token),
    data: { expected_revision: deck.revision, name: "改过的名字" },
  });
  expect(renamed.status()).toBe(200);
  const after = await renamed.json();
  expect(after.deck.name).toBe("改过的名字");
  expect(after.revision).not.toBe(deck.revision);

  // The version the client had is now stale, and the second write is
  // refused rather than applied on top of a state that has moved.
  const stale = await request.patch(url, {
    headers: auth(token),
    data: { expected_revision: deck.revision, name: "再改一次" },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.code).toBe("REVISION_CONFLICT");
  // And the refusal changed nothing.
  const read = await request.get(url, { headers: auth(token) });
  expect((await read.json()).deck.name).toBe("改过的名字");
});

test("a locked deck refuses edits and can still be unlocked", async ({
  request,
}) => {
  const token = await login(request);
  let deck = await makeDeck(request, token, `锁 ${Date.now()}`);
  const url = `/api/v1/decks/${deck.deck.id}`;

  const locked = await request.patch(url, {
    headers: auth(token),
    data: { expected_revision: deck.revision, locked: true },
  });
  expect(locked.status()).toBe(200);
  const lockedBody = await locked.json();
  expect(lockedBody.deck.locked).toBe(true);
  // Your deck, but closed — which is a different answer from "not yours".
  expect(lockedBody.can_edit).toBe(false);

  const rename = await request.patch(url, {
    headers: auth(token),
    data: { expected_revision: lockedBody.revision, name: "锁着还想改" },
  });
  expect(rename.status()).toBe(423);
  expect((await rename.json()).error.code).toBe("DECK_LOCKED");

  const addCard = await request.put(`${url}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: lockedBody.revision, quantity: 1 },
  });
  expect(addCard.status()).toBe(423);

  // Unlocking is the one write a locked deck accepts.
  const unlocked = await request.patch(url, {
    headers: auth(token),
    data: { expected_revision: lockedBody.revision, locked: false },
  });
  expect(unlocked.status()).toBe(200);
  deck = await unlocked.json();
  expect(deck.can_edit).toBe(true);
});

test("a friend may read the deck and may not write it", async ({ request }) => {
  const token = await login(request);
  const deck = await makeDeck(request, token, `朋友 ${Date.now()}`);
  const friend = friendToken();
  const url = `/api/v1/decks/${deck.deck.id}`;

  const read = await request.get(url, { headers: auth(friend) });
  expect(read.status()).toBe(200);
  const body = await read.json();
  expect(body.can_edit).toBe(false);
  expect(body.deck.owner.is_me).toBe(false);
  expect(body.deck.owner.display_name).toBe("API Tester");

  const write = await request.patch(url, {
    headers: auth(friend),
    data: { expected_revision: body.revision, name: "不是你的" },
  });
  expect(write.status()).toBe(403);
  expect((await write.json()).error.code).toBe("FORBIDDEN");

  const card = await request.put(`${url}/cards/BT1-084`, {
    headers: auth(friend),
    data: { expected_revision: body.revision, quantity: 4 },
  });
  expect(card.status()).toBe(403);
});

test("cards in and out of a deck, with the clamp explained", async ({
  request,
}) => {
  const token = await login(request);
  let deck = await makeDeck(request, token, `编辑 ${Date.now()}`);
  const url = `/api/v1/decks/${deck.deck.id}`;

  const three = await request.put(`${url}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, quantity: 3 },
  });
  expect(three.status()).toBe(200);
  deck = await three.json();
  expect(deck.cards).toHaveLength(1);
  expect(deck.cards[0].quantity).toBe(3);
  expect(deck.totals.main_count).toBe(3);
  // 0 eggs is a legal deck, not an unfinished one — no issue is raised.
  expect(deck.totals.egg_count).toBe(0);
  expect(deck.deck.issues).toEqual([]);
  expect(deck.adjustments).toEqual([]);
  // The fixture prices BT1-084 at PAO's 180, and nothing is bought yet.
  expect(deck.cards[0].price_yen).toBe(180);
  expect(deck.totals.known_missing_price_yen).toBe(540);
  expect(deck.totals.unpriced_missing_count).toBe(0);

  // BT1-086 is limited to 1 by the fixture's banlist. Asking for 4 does not
  // fail and does not silently write 1 — it writes 1 and says why.
  const limited = await request.put(`${url}/cards/BT1-086`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, quantity: 4 },
  });
  expect(limited.status()).toBe(200);
  deck = await limited.json();
  const clamp = deck.adjustments[0];
  expect(clamp.code).toBe("COPY_LIMIT");
  expect(clamp.requested).toBe(4);
  expect(clamp.actual).toBe(1);
  expect(clamp.message).toContain("限 1 张");
  expect(card(deck, "BT1-086").quantity).toBe(1);

  // Held counts, and the missing total that follows from them.
  const bought = await request.put(`${url}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, purchased_delta: 1 },
  });
  expect(bought.status()).toBe(200);
  deck = await bought.json();
  const omni = card(deck, "BT1-084");
  expect(omni.purchased).toBe(1);
  expect(omni.missing).toBe(2);
  expect(omni.owned_control_value).toBe(1);
  expect(omni.shared).toBe(false);

  // Held on a card the deck does not run is not a silent no-op.
  const absent = await request.put(`${url}/cards/BT1-001`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, purchased: 2 },
  });
  expect(absent.status()).toBe(404);

  // Two commands in one body is refused rather than ordered.
  const both = await request.put(`${url}/cards/BT1-084`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, quantity: 2, purchased: 1 },
  });
  expect(both.status()).toBe(400);

  // Quantity 0 takes the card out.
  const removed = await request.put(`${url}/cards/BT1-086`, {
    headers: auth(token),
    data: { expected_revision: deck.revision, quantity: 0 },
  });
  expect(removed.status()).toBe(200);
  deck = await removed.json();
  expect(deck.cards.map((c) => c.card.code)).toEqual(["BT1-084"]);

  // The text export is the website's own, and it is text.
  const text = await request.get(`${url}/export`, { headers: auth(token) });
  expect(text.status()).toBe(200);
  expect(text.headers()["content-type"]).toContain("text/plain");
  expect(await text.text()).toContain("BT1-084");
});

/**
 * The login throttle, driven through HTTP.
 *
 * Both of the throttle's keys are made unique to this test — a fresh email
 * and a `cf-connecting-ip` nobody else sends — because the counters are
 * process-wide and a shared key would lock the rest of the suite out of the
 * login for fifteen minutes. That header is also the real thing: everything
 * arrives through the tunnel, so the socket's peer is useless and this is
 * what carries the caller.
 */
test("repeated wrong passwords are throttled, with the wait in a header", async ({
  request,
}) => {
  const headers = { "cf-connecting-ip": "203.0.113.7" };
  const email = `throttle-${Date.now()}@test.local`;
  const attempt = () =>
    request.post("/api/v1/session", {
      headers,
      data: { email, password: "wrong" },
    });

  // MAX_FAILURES is 5: the first five are answered, the sixth is refused
  // before the password is even compared.
  for (let i = 0; i < 5; i++) {
    expect((await attempt()).status()).toBe(401);
  }
  const blocked = await attempt();
  expect(blocked.status()).toBe(429);
  const body = await blocked.json();
  expect(body.error.code).toBe("RATE_LIMITED");
  // Retry-After is what lets the client disable its own button instead of
  // hammering. Without it the app can only guess.
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
});

test("a deck that is gone is 404, not an empty deck", async ({ request }) => {
  const token = await login(request);
  const missing = await request.get("/api/v1/decks/no-such-deck", {
    headers: auth(token),
  });
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe("NOT_FOUND");
});

/**
 * The published contract and the running server, checked against each other.
 *
 * `docs/api-v1.openapi.json` is what the iOS repository builds against, and
 * a document that drifts from the server is worse than no document: it is
 * wrong in a way nobody notices until a client is already shipping. Every
 * schema there declares `required` and `additionalProperties: false`, so the
 * check is exact — the response's keys must be the declared keys, no more
 * and no fewer.
 */
test("responses match the published OpenAPI schemas exactly", async ({
  request,
}) => {
  const spec = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "docs/api-v1.openapi.json"),
      "utf8",
    ),
  ) as {
    components: {
      schemas: Record<
        string,
        { required?: string[]; additionalProperties?: boolean }
      >;
    };
  };

  /** Exactly the declared keys — a missing one and a stray one both fail. */
  const check = (name: string, value: unknown) => {
    const schema = spec.components.schemas[name];
    expect(schema, `${name} is in the contract`).toBeTruthy();
    expect(schema.additionalProperties, name).toBe(false);
    expect(Object.keys(value as object).sort(), name).toEqual(
      [...schema.required!].sort(),
    );
  };

  const token = await login(request);
  check("Meta", await (await request.get("/api/v1/meta")).json());

  const loginRes = await request.post("/api/v1/session", {
    data: { email: API_USER.email, password: API_USER.password },
  });
  check("LoginResult", await loginRes.json());
  check(
    "Session",
    await (
      await request.get("/api/v1/session", { headers: auth(token) })
    ).json(),
  );
  check(
    "Account",
    (
      await (
        await request.get("/api/v1/session", { headers: auth(token) })
      ).json()
    ).account,
  );

  const cards = await (
    await request.get("/api/v1/cards?q=BT1-086", { headers: auth(token) })
  ).json();
  check("CardPage", cards);
  check("CardSummary", cards.items[0]);

  const detail = await (
    await request.get(`/api/v1/cards/${cards.items[0].id}`, {
      headers: auth(token),
    })
  ).json();
  check("CardDetail", detail);

  const deck = await makeDeck(request, token, `契约 ${Date.now()}`);
  const withCard = await request.put(
    `/api/v1/decks/${deck.deck.id}/cards/BT1-086`,
    {
      headers: auth(token),
      data: { expected_revision: deck.revision, quantity: 4 },
    },
  );
  const body = await withCard.json();
  check("DeckDetail", body);
  check("DeckSummary", body.deck);
  check("Owner", body.deck.owner);
  check("DeckCard", body.cards[0]);
  check("Adjustment", body.adjustments[0]);
  check(
    "DeckList",
    await (await request.get("/api/v1/decks", { headers: auth(token) })).json(),
  );

  const err = await (
    await request.get("/api/v1/decks/nope", { headers: auth(token) })
  ).json();
  check("Error", err);
  expect(Object.keys(err.error).sort()).toEqual([
    "code",
    "message",
    "request_id",
  ]);
});
