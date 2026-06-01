import { notFound } from "next/navigation";
import { isGameId, GAMES, type GameId } from "@/lib/games";
import { TopNav } from "@/components/top-nav";
import { DecksToolbar } from "@/components/decks-toolbar";
import { DecksGrid } from "@/components/decks-grid";
import { getCurrentUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";
import * as ua from "@/lib/db/unionarena";

export const dynamic = "force-dynamic";

export default async function DecksPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  // Anon users see the page in read-only mode. `me === null` cascades into:
  //   - empty `completedDeckIds` (no ✓ tick anywhere)
  //   - every `mine` flag false (no draggable reorder, no edit tools)
  //   - the toolbar hides its create/import/diff/missing controls
  const me = await getCurrentUser();
  const { game } = await params;
  if (!isGameId(game)) notFound();

  // Decks the current user has fully collected (every card_qty satisfied by
  // their per-deck purchased counter). Used to render the ✓ next to the deck
  // name. Anon → never a tick.
  const completedDeckIds = me
    ? game === "digimon"
      ? digimon.getCompletedDeckIds(me.id)
      : ua.getCompletedDeckIds(me.id)
    : new Set<string>();
  // Anon users still see ALL decks (they're public reads). Use a sentinel
  // user id so the "your decks first" sort just doesn't promote anything.
  const meId = me?.id ?? "";

  const decks =
    game === "digimon"
      ? digimon.listDecksWithCover(meId).map((d) => ({
          id: d.id,
          name: d.name,
          notes: d.notes,
          accent_color: d.accent_color,
          accent_color2: d.accent_color2,
          updated_at: d.updated_at,
          cover_image_url: d.cover_image_url,
          owner_id: d.owner_id,
          owner_name: d.owner_name,
          mine: me !== null && d.user_id === me.id,
          complete: completedDeckIds.has(d.id),
          count: digimon.deckCardCount(d.id),
        }))
      : ua.listDecksWithCover(meId).map((d) => ({
          id: d.id,
          name: d.name,
          notes: d.notes,
          accent_color: d.accent_color,
          accent_color2: d.accent_color2,
          updated_at: d.updated_at,
          cover_image_url: d.cover_image_url,
          owner_id: d.owner_id,
          owner_name: d.owner_name,
          mine: me !== null && d.user_id === me.id,
          complete: completedDeckIds.has(d.id),
          count: ua.deckCardCount(d.id),
        }));

  // Fetch every deck's card list once and derive both auxiliary tool inputs
  // from the same payload. Two consumers share this:
  //   - 缺卡统计 (mine only, missing cards): purchased<quantity rows
  //   - 卡组对比 (any pair of decks): full card list per deck
  // Loading both eagerly is cheap — typical user has <20 decks × ~50 cards.
  const lib = game === "digimon" ? digimon : ua;
  const deckCardLists = decks.map((d) => ({
    meta: d,
    cards: lib.getDeckCards(d.id),
  }));

  // Multi-deck missing-cards / shopping-list tool: limited to YOUR own decks,
  // since the use case is "what should I buy next" and that's personal.
  const deckShortfalls = deckCardLists
    .filter((d) => d.meta.mine)
    .map(({ meta, cards }) => ({
      id: meta.id,
      name: meta.name,
      accent_color: meta.accent_color,
      missing: cards
        .filter((c) => c.purchased < c.quantity)
        .map((c) => ({
          code: c.code,
          name: c.name,
          image_url: c.image_url,
          need: c.quantity - c.purchased,
        })),
    }));

  // Deck-diff tool: every deck the user can see (mine + friends'), with the
  // bare minimum per-card payload needed to compute the three diff buckets.
  const decksForDiff = deckCardLists.map(({ meta, cards }) => ({
    id: meta.id,
    name: meta.name,
    accent_color: meta.accent_color,
    mine: meta.mine,
    owner_name: meta.owner_name,
    cards: cards.map((c) => ({
      code: c.code,
      name: c.name,
      image_url: c.image_url,
      quantity: c.quantity,
    })),
  }));

  return (
    <>
      <TopNav game={game as GameId} active="decks" />
      <main className="w-full mx-auto max-w-5xl px-4 py-6">
        {/* Compact toolbar with create/import/diff/missing tools. For anon
            users we render just the title (no edit tools) — they can still
            scroll the deck grid below to browse. */}
        {me ? (
          <DecksToolbar
            game={game}
            accent={GAMES[game].accent}
            deckCount={decks.length}
            deckShortfalls={deckShortfalls}
            decksForDiff={decksForDiff}
          />
        ) : (
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">
              卡组浏览{" "}
              <span className="text-[var(--color-muted-fg)] font-normal text-sm">
                ({decks.length})
              </span>
            </h1>
            <a
              href={`/login?next=/${game}/decks`}
              className="text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] underline"
            >
              登录后可创建 / 编辑
            </a>
          </div>
        )}

        {decks.length === 0 ? (
          <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            还没有卡组。先在上面创建一个，或从卡牌检索里点 + 把卡加进来。
          </div>
        ) : (
          <>
            {(() => {
              // Split into my decks (top, draggable) and others' decks
              // (bottom, read-only). They get their own header + DecksGrid so
              // the visual boundary between "mine" and "borrowed" is obvious
              // even at a glance.
              const mineDecks = decks.filter((d) => d.mine);
              const otherDecks = decks.filter((d) => !d.mine);
              const toGridShape = (
                d: (typeof decks)[number],
              ) => ({
                id: d.id,
                name: d.name,
                accent_color: d.accent_color,
                accent_color2: d.accent_color2,
                cover_image_url: d.cover_image_url,
                count: d.count,
                updated_at: d.updated_at,
                owner_name: d.owner_name,
                mine: d.mine,
                complete: d.complete,
              });
              return (
                <>
                  {mineDecks.length > 0 ? (
                    <section className="mb-6">
                      <header className="flex items-baseline justify-between mb-2">
                        <h2 className="text-sm font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide">
                          我的卡组{" "}
                          <span className="text-[var(--color-muted-fg)] font-normal normal-case">
                            ({mineDecks.length})
                          </span>
                        </h2>
                        {mineDecks.length > 1 ? (
                          <span className="text-[11px] text-[var(--color-muted-fg)]">
                            提示：拖动封面可调整顺序
                          </span>
                        ) : null}
                      </header>
                      <DecksGrid
                        game={game}
                        decks={mineDecks.map(toGridShape)}
                      />
                    </section>
                  ) : null}

                  {otherDecks.length > 0 ? (
                    <section
                      className={
                        mineDecks.length > 0
                          ? "pt-6 border-t border-[var(--color-border)]"
                          : ""
                      }
                    >
                      <header className="mb-2">
                        <h2 className="text-sm font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide">
                          朋友的卡组{" "}
                          <span className="text-[var(--color-muted-fg)] font-normal normal-case">
                            ({otherDecks.length}) · 只能浏览
                          </span>
                        </h2>
                      </header>
                      <DecksGrid
                        game={game}
                        decks={otherDecks.map(toGridShape)}
                      />
                    </section>
                  ) : null}
                </>
              );
            })()}
          </>
        )}
      </main>
    </>
  );
}
