import { ScrollMemory } from "@/components/scroll-memory";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, GAMES } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { DecksToolbar } from "@/components/decks-toolbar";
import { DecksGrid } from "@/components/decks-grid";
import { GroupsStrip } from "@/components/groups-strip";
import { getCurrentUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";
import { deckIsComplete } from "@/lib/deck-legality";

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
    ? digimon.getCompletedDeckIds(me.id)
    : new Set<string>();
  // Anon users still see ALL decks (they're public reads). Use a sentinel
  // user id so the "your decks first" sort just doesn't promote anything.
  const meId = me?.id ?? "";

  // Main/egg split for every deck in ONE query, rather than a count per deck.
  const rawDecks = digimon.listDecksWithCover(meId);
  const counts = digimon.deckMainEggCounts(rawDecks.map((d) => d.id));
  // Which decks the current banlist disagrees with. One query for the whole
  // list; the tile only needs the number.
  const issues = digimon.deckIssueCounts(rawDecks.map((d) => d.id));

  const decks = rawDecks.map((d) => ({
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
    pinned: d.pinned === 1,
    complete: completedDeckIds.has(d.id),
    counts: counts.get(d.id) ?? { main: 0, egg: 0 },
    issues: issues.get(d.id) ?? 0,
    locked: !!d.locked,
  }));

  // Card lists are read for 缺卡统计 only, so only the decks that tool shows
  // get loaded — starred decks of your own. 卡组对比 used to want every deck's
  // list here as well; it moved to the deck page, where it loads the one deck
  // you picked.
  const lib = digimon;
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  const deckCardLists = decks
    .filter((d) => d.mine && d.pinned)
    .map((d) => ({
      meta: d,
      cards: digimon.overlayDisplay(digimon.getDeckCards(d.id), cardLang),
    }));

  // Multi-deck missing-cards / shopping-list tool: YOUR decks, and only the
  // starred ones. "What should I buy next" is asked about the decks you mean
  // to play; every deck you ever made buries those, and the star is already
  // how you say which they are. None starred → the toolbar drops the button.
  const deckShortfalls = deckCardLists
    .map(({ meta, cards }) => ({
      id: meta.id,
      name: meta.name,
      accent_color: meta.accent_color,
      accent_color2: meta.accent_color2,
      cover_image_url: meta.cover_image_url,
      missing: cards
        .filter((c) => c.purchased < c.quantity)
        .map((c) => ({
          code: c.code,
          name: c.name,
          image_url: c.image_url,
          need: c.quantity - c.purchased,
        })),
    }));

  // Shared-pool groups (own decks that share one physical card set).
  const groups = me ? lib.listGroups(me.id) : [];

  return (
    <>
      {/* Remembers where you were in the list, so "← 全部卡组" on a deck can
          be an honest link to this page and still put you back. */}
      <ScrollMemory id={`${game}-decks`} />
      <main className="w-full px-4 sm:px-6 py-6">
        {/* Compact toolbar with create/import/diff/missing tools. For anon
            users we render just the title (no edit tools) — they can still
            scroll the deck grid below to browse. */}
        {me ? (
          <DecksToolbar
            game={game}
            accent={GAMES[game].accent}
            deckCount={decks.length}
            deckShortfalls={deckShortfalls}
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

        {me && (groups.length > 0 || decks.some((d) => d.mine)) ? (
          <GroupsStrip game={game} groups={groups} />
        ) : null}

        {decks.length === 0 ? (
          <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            暂无卡组
          </div>
        ) : (
          <>
            {(() => {
              // Split into my decks (top, draggable) and others' decks
              // (bottom, read-only). They get their own header + DecksGrid so
              // the visual boundary between "mine" and "borrowed" is obvious
              // even at a glance.
              // Locked AND no longer legal: a deck you finished with, that the
              // current rules have moved past. It can't be fixed without
              // unlocking it, and you closed it on purpose — so it sits at the
              // bottom instead of carrying a red badge through the main list
              // forever.
              const isLegacy = (d: (typeof decks)[number]) =>
                d.mine &&
                d.locked &&
                (d.issues > 0 || !deckIsComplete(d.counts));
              const mineDecks = decks.filter((d) => d.mine && !isLegacy(d));
              const legacyDecks = decks.filter(isLegacy);
              const otherDecks = decks.filter((d) => !d.mine);
              const toGridShape = (d: (typeof decks)[number]) => ({
                id: d.id,
                name: d.name,
                accent_color: d.accent_color,
                accent_color2: d.accent_color2,
                cover_image_url: d.cover_image_url,
                counts: d.counts,
                issues: d.issues,
                locked: d.locked,
                updated_at: d.updated_at,
                owner_name: d.owner_name,
                mine: d.mine,
                pinned: d.pinned,
                complete: d.complete,
              });
              return (
                <>
                  {/* Decks you actually play float to the top under their own
                      heading; everything else still shows in full below. The
                      split only appears once something is starred, so a user
                      who never uses it sees the original single list. */}
                  {mineDecks.some((d) => d.pinned) ? (
                    <>
                      <section className="mb-6">
                        <header className="flex items-baseline justify-between mb-2">
                          <h2 className="text-sm font-semibold text-[var(--color-accent)] uppercase tracking-wide">
                            ★ 主力卡组{" "}
                            <span className="text-[var(--color-muted-fg)] font-normal normal-case">
                              ({mineDecks.filter((d) => d.pinned).length})
                            </span>
                          </h2>
                          <span className="text-[11px] text-[var(--color-muted-fg)]">
                            提示：拖动封面可调整顺序 · 点 ★ 取消
                          </span>
                        </header>
                        <DecksGrid
                          game={game}
                          decks={mineDecks
                            .filter((d) => d.pinned)
                            .map(toGridShape)}
                        />
                      </section>
                      {mineDecks.some((d) => !d.pinned) ? (
                        <section className="mb-6">
                          <header className="mb-2">
                            <h2 className="text-sm font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide">
                              其他卡组{" "}
                              <span className="text-[var(--color-muted-fg)] font-normal normal-case">
                                ({mineDecks.filter((d) => !d.pinned).length})
                              </span>
                            </h2>
                          </header>
                          <DecksGrid
                            game={game}
                            decks={mineDecks
                              .filter((d) => !d.pinned)
                              .map(toGridShape)}
                          />
                        </section>
                      ) : null}
                    </>
                  ) : mineDecks.length > 0 ? (
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
                            提示：拖动封面可调整顺序 · 点 ★ 标为主力
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

                  {legacyDecks.length > 0 ? (
                    <section className="mb-6 pt-6 border-t border-[var(--color-border)]">
                      <header className="mb-2">
                        <h2 className="text-sm font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide">
                          封存{" "}
                          <span className="font-normal normal-case">
                            ({legacyDecks.length})
                          </span>
                        </h2>
                      </header>
                      <DecksGrid
                        game={game}
                        decks={legacyDecks.map(toGridShape)}
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
