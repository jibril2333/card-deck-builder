import { RestoreScrollLink } from "@/components/scroll-memory";
import Link from "next/link";
import { type GameId, colorHex, GAMES } from "@/lib/games";
import { DeckCardSearch } from "@/components/deck-card-search";
import { DeckHeader } from "@/components/deck-header";
import { DeckDeleteButton } from "@/components/deck-delete-button";
import { DeckLockButton } from "@/components/deck-lock-button";
import { DeckPoolSelect } from "@/components/deck-pool-select";
import { DeckExportMenu } from "@/components/deck-export-menu";
import { DeckComparePicker } from "@/components/deck-compare-picker";
import { DeckDiffPanel } from "@/components/deck-diff";
import { DeckStats } from "@/components/deck-stats";
import { DeckAdjustments } from "@/components/deck-adjustments";
import { MULTI_COLOR } from "@/lib/deck-tally";
import { DeckInfoBar } from "@/components/deck-info-bar";
import { parseImportReport } from "@/lib/import-report";
import { DeckVersionPicker } from "@/components/deck-version-picker";
import { getCurrentUser } from "@/lib/auth/session";
import { DeckCardsSection } from "@/components/deck-cards-section";
import { DeckPurchaseSummary } from "@/components/deck-purchase-summary";
import { formatPrice } from "@/lib/price-format";
import { loadDeckView } from "./load";

export const dynamic = "force-dynamic";

export default async function DeckEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string; id: string }>;
  searchParams: Promise<{ mode?: string; missing?: string; compare?: string }>;
}) {
  const me = await getCurrentUser();
  const { game, id } = await params;
  const sp = await searchParams;
  const {
    cardLangForPage,
    loaded,
    mine,
    canEdit,
    mode,
    pools,
    missingOnly,
    otherDecks,
    compareDeck,
    compareCards,
    compareClearHref,
    compareHrefPrefix,
    restrictionIssues,
    issueByCardId,
    eggs,
    main,
    colorBreakdown,
    target,
    mainOk,
    eggOk,
    exportText,
    exportUrl,
    totalWanted,
    totalOwned,
    totalMissing,
    completedCards,
    purchaseProgress,
    totalPrice,
    remainingPrice,
    themeCss,
  } = await loadDeckView({ game, id, sp, me });

  return (
    <>
      {themeCss ? (
        // The value is a clamped `hsl(…)` built from a validated hex — see
        // lib/deck-theme, which is where the "it came out of the database"
        // part is handled.
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      ) : null}
      <main className="w-full px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <section className="min-w-0">
          {/* A link, not a back button: it names where it goes. Going "back"
              lands on the deck list only when that is where you came from,
              and arriving here from an import — card page, deck list, import,
              deck — it landed on the card page instead. The list's scroll
              position is remembered separately; see scroll-memory. */}
          <RestoreScrollLink
            id={`${game}-decks`}
            href={`/${game}/decks`}
            className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 mb-3"
          >
            ← 全部卡组
          </RestoreScrollLink>
          <DeckHeader
            game={game}
            deck={loaded.deck}
            cover={loaded.cover}
            mine={mine}
            editable={canEdit}
          />

          {/* mode switcher — only show build/purchase tabs if this deck is mine */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1 p-0.5 border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] w-fit">
              <Link
                href={`/${game}/decks/${loaded.deck.id}`}
                replace
                scroll={false}
                className={`px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                  mode === "browse"
                    ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                    : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                }`}
              >
                👁 浏览
              </Link>
              {canEdit ? (
                <>
                  <Link
                    href={`/${game}/decks/${loaded.deck.id}?mode=build`}
                    replace
                    scroll={false}
                    className={`px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                      mode === "build"
                        ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                        : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    🛠 组建
                  </Link>
                  <Link
                    href={`/${game}/decks/${loaded.deck.id}?mode=purchase`}
                    replace
                    scroll={false}
                    className={`px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                      mode === "purchase"
                        ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                        : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    🛒 购买
                  </Link>
                </>
              ) : null}
            </div>

            <Link
              href={`/${game}/decks/${loaded.deck.id}/playtest`}
              className="px-3 h-8 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)] flex items-center gap-1.5"
              title="起手模拟 + 抽到概率计算"
            >
              🎲 试玩
            </Link>
            {/* Next to 试玩: both are ways of looking at the deck you have,
              not edits to it. */}
            {otherDecks.length > 0 ? (
              <DeckComparePicker
                decks={otherDecks.map((d) => ({
                  id: d.id,
                  name: d.name,
                  accent_color: d.accent_color,
                  mine: me !== null && d.user_id === me.id,
                  owner_name: d.owner_name,
                }))}
                current={
                  compareDeck
                    ? { id: compareDeck.id, name: compareDeck.name }
                    : null
                }
                hrefPrefix={compareHrefPrefix}
                clearHref={compareClearHref}
              />
            ) : null}
            <DeckExportMenu
              text={exportText}
              url={exportUrl}
              deckName={loaded.deck.name}
              accent={loaded.deck.accent_color}
              accent2={loaded.deck.accent_color2}
              gameLabel={GAMES[game as GameId].label}
              subtitle={
                loaded.isDigimon
                  ? `主卡组 ${main} 张 · 蛋卡 ${eggs} 张`
                  : `共 ${main} 张`
              }
              cards={loaded.cards.map((c) => ({
                code: c.code,
                name: c.name,
                image_url: c.image_url ?? null,
                quantity: c.quantity,
              }))}
            />
            {/* Filing the deck into a shared pool: next to 导出 because it's the
              same kind of act — something you do TO the whole deck, not to a
              card in it. */}
            {mine ? (
              <DeckPoolSelect
                game={game}
                deckId={loaded.deck.id}
                pools={pools.map((p) => ({ id: p.id, name: p.name }))}
                current={
                  pools.find((p) =>
                    p.decks.some((d) => d.id === loaded.deck.id),
                  )?.id ?? null
                }
              />
            ) : null}
            {/* Build mode: find and add cards without leaving the deck. Shares
              the toolbar row, pushed to the right edge by ml-auto — it wraps
              onto its own line on narrow screens like the rest of the row. */}
            {mode === "build" ? (
              <DeckCardSearch
                game={game}
                deckId={loaded.deck.id}
                lang={cardLangForPage}
              />
            ) : null}
          </div>

          {mode !== "purchase" ? (
            <>
              {/* Counts and colour split share one line: both answer "what is
                  in this deck right now", and on their own rows they pushed
                  the cards a whole line further down for no added meaning. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
                <div className="text-xs text-[var(--color-muted-fg)]">
                  {/* The numbers say it themselves — a red 48 against a 50 is
                      the whole message, and the sentence that used to sit
                      here ("主卡组数量不达标") repeated it in words. The info
                      bar above 卡组分布 carries the same fact for anyone
                      scanning the sidebar. */}
                  主卡组{" "}
                  <span className={mainOk ? "" : "text-red-500 font-medium"}>
                    {main}
                  </span>{" "}
                  / {target.main}
                  {loaded.isDigimon ? (
                    <>
                      {" · 蛋卡 "}
                      <span className={eggOk ? "" : "text-red-500 font-medium"}>
                        {eggs}
                      </span>
                      {` / ${target.egg}`}
                    </>
                  ) : null}
                  {totalPrice > 0 ? (
                    <span className="ml-2">
                      · 预期总价{" "}
                      <b className="text-[var(--color-accent2)]">
                        {formatPrice(totalPrice)}
                      </b>
                    </span>
                  ) : null}
                </div>

                {/* Sits with the counts rather than up in the banner: the
                    version is a FACT about the list, the same kind as
                    "主卡组 50 / 50", and next to the deck's name it read as
                    part of its title. */}
                {loaded.versionOptions.length ? (
                  <DeckVersionPicker
                    game={game}
                    deckId={loaded.deck.id}
                    version={loaded.deck.version}
                    options={loaded.versionOptions}
                    auto={loaded.autoVersion}
                    newer={loaded.newerThanVersion}
                    editable={canEdit}
                  />
                ) : null}

                {colorBreakdown.length ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {colorBreakdown.map((b) => (
                      <span
                        key={b.label}
                        className="chip"
                        title={
                          b.label === MULTI_COLOR
                            ? "同时带两种颜色的卡,已分别计入各自颜色"
                            : undefined
                        }
                      >
                        {b.label === MULTI_COLOR ? null : (
                          <span
                            className="chip-dot"
                            style={{ background: colorHex(b.label) }}
                          />
                        )}
                        {b.label} · {b.value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <DeckPurchaseSummary
              game={game}
              deckId={loaded.deck.id}
              kinds={loaded.cards.length}
              totalOwned={totalOwned}
              totalWanted={totalWanted}
              totalMissing={totalMissing}
              completedCards={completedCards}
              purchaseProgress={purchaseProgress}
              totalPrice={totalPrice}
              remainingPrice={remainingPrice}
              missingOnly={missingOnly}
            />
          )}

          {compareDeck && compareCards ? (
            <DeckDiffPanel
              game={game}
              a={{
                name: loaded.deck.name,
                accent: loaded.deck.accent_color,
                cards: loaded.cards.map((c) => ({
                  code: c.code,
                  name: c.name,
                  image_url: c.image_url ?? null,
                  quantity: c.quantity,
                })),
              }}
              b={{
                name: compareDeck.name,
                accent: compareDeck.accent_color,
                ownerName:
                  me !== null && compareDeck.user_id === me.id
                    ? null
                    : compareDeck.owner_name,
                cards: compareCards.map((c) => ({
                  code: c.code,
                  name: c.name,
                  image_url: c.image_url ?? null,
                  quantity: c.quantity,
                })),
              }}
              closeHref={compareClearHref}
            />
          ) : null}

          <DeckCardsSection
            game={game}
            deckId={loaded.deck.id}
            cards={loaded.cards}
            coverCardId={loaded.deck.cover_card_id}
            mode={mode}
            canEdit={canEdit}
            missingOnly={missingOnly}
            violations={new Set(issueByCardId.keys())}
            searchTargets={loaded.searchTargets}
            jogress={loaded.jogress}
          />

          {/* Owner-only scratch list of swaps under consideration. Sits below
              the deck itself and feeds into nothing else. */}
          {canEdit ? (
            <DeckAdjustments
              game={game}
              deckId={loaded.deck.id}
              items={loaded.adjustments}
              lang={cardLangForPage}
            />
          ) : null}
        </section>

        <aside className="space-y-4">
          {/* Someone else's deck: say so once, here. Name and notes now live
              in the banner, so this panel would otherwise repeat them. */}
          {!mine ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-xs text-[var(--color-muted-fg)]">
              这是别人的卡组,你只能浏览。
            </div>
          ) : null}

          {/* Everything wrong with the deck, above the distribution panel:
              banlist, size, and whatever the import couldn't place. Absent
              when there is nothing to say. */}
          <DeckInfoBar
            game={game}
            deckId={loaded.deck.id}
            size={
              loaded.cards.length > 0
                ? {
                    main,
                    mainTarget: target.main,
                    eggs,
                    eggTarget: target.egg,
                  }
                : null
            }
            issues={restrictionIssues}
            report={mine ? parseImportReport(loaded.deck.import_report) : null}
            dismissable={canEdit}
          />

          {loaded.cards.length > 0 ? (
            <DeckStats panels={loaded.statsPanels} />
          ) : null}

          {/* Last thing in the column, deliberately: the banner above is full
              of click-to-edit fields, and this is the one action there is no
              undo for. */}
          {mine ? (
            <div className="flex items-center gap-2 flex-wrap">
              <DeckLockButton
                game={game}
                deckId={loaded.deck.id}
                locked={loaded.deck.locked}
              />
              {/* Deleting a locked deck means unlocking it first — the button
                  isn't here to be argued with. */}
              {canEdit ? (
                <DeckDeleteButton
                  game={game}
                  deckId={loaded.deck.id}
                  deckName={loaded.deck.name}
                />
              ) : null}
            </div>
          ) : null}
        </aside>
      </main>
    </>
  );
}
