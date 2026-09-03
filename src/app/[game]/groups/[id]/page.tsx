import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { GroupEditor } from "@/components/group-editor";
import { PoolTable } from "@/components/pool-table";
import { PoolSwap } from "@/components/pool-swap";
import { requireUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

/**
 * Shared-pool view for a deck group: how many physical copies of each card to
 * own so you can reassemble whichever member deck you're playing. The key
 * number is `need` = the MAX any single member deck uses (you swap, you don't
 * stock them all at once), scoped to this group only.
 */
export default async function GroupPage({
  params,
}: {
  params: Promise<{ game: string; id: string }>;
}) {
  const me = await requireUser();
  const { game, id } = await params;
  if (!isGameId(game)) notFound();

  const group = digimon.getGroup(me.id, id);
  if (!group) notFound();

  const pool = digimon.getGroupPool(id);
  // Reads return every user's decks by design (see deck-shared.ts), but
  // `setGroupDecks` only ever inserts the caller's own — so an unfiltered list
  // offers checkboxes that silently do nothing. Harmless while this is a
  // single-account install; not once a friend has an account.
  const allDecks = digimon
    .listDecksWithCover(me.id)
    .filter((d) => d.user_id === me.id)
    .map((d) => ({
      id: d.id,
      name: d.name,
      accent_color: d.accent_color,
      accent_color2: d.accent_color2,
      // listDecks already resolves this against the deck's cover_variant.
      cover_image_url: d.cover_image_url,
    }));

  // Localize names per the language cookie.
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  const tMap = digimon.getDisplayTranslations(
    pool.map((c) => c.code),
    cardLang,
  );

  const memberDecks = group.decks;

  // Split egg vs main, sort: most-shared first, then biggest need, then code.
  const decorate = pool.map((c) => {
    const deckCount = Object.keys(c.perDeck).length;
    const missing = Math.max(0, c.need - c.owned);
    const t = tMap.get(c.code);
    return {
      ...c,
      name: t?.name ?? c.name,
      image_url: t?.image_url ?? c.image_url,
      deckCount,
      missing,
    };
  });
  decorate.sort(
    (a, b) =>
      b.deckCount - a.deckCount ||
      b.need - a.need ||
      a.code.localeCompare(b.code),
  );
  const eggs = decorate.filter((c) => c.card_type === "Digi-Egg");
  const mains = decorate.filter((c) => c.card_type !== "Digi-Egg");

  const needTotal = decorate.reduce((s, c) => s + c.need, 0);
  const separateTotal = decorate.reduce((s, c) => s + c.separate, 0);
  const saved = separateTotal - needTotal;
  const missingTotal = decorate.reduce((s, c) => s + c.missing, 0);

  return (
    <>
      <main className="w-full mx-auto max-w-[1500px] px-4 sm:px-6 py-6">
        <Link
          href={`/${game}/decks`}
          className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 mb-3"
        >
          ← 全部卡组
        </Link>

        <GroupEditor
          game={game}
          groupId={group.id}
          name={group.name}
          allDecks={allDecks}
          memberIds={memberDecks.map((d) => d.id)}
        />

        {memberDecks.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--color-muted-fg)]">
            暂无成员卡组,可在「管理成员」中选择。
          </p>
        ) : (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Metric label="需购张数" value={needTotal} hint="按最多那套算" />
              <Metric
                label="各买一份"
                value={separateTotal}
                hint="不共享的话"
                muted
              />
              <Metric label="省下" value={saved} hint="少买这么多张" accent />
              <Metric
                label="还缺"
                value={missingTotal}
                hint="需备 − 持有"
                danger={missingTotal > 0}
              />
            </div>

            {memberDecks.length >= 2 ? (
              <PoolSwap
                game={game}
                decks={memberDecks}
                cards={decorate.map((c) => ({
                  card_id: c.card_id,
                  code: c.code,
                  name: c.name,
                  image_url: c.image_url,
                  card_type: c.card_type,
                  perDeck: c.perDeck,
                  owned: c.owned,
                }))}
              />
            ) : null}

            <PoolTable
              game={game}
              groupId={id}
              memberDecks={memberDecks}
              eggs={eggs}
              mains={mains}
            />
          </>
        )}
      </main>
    </>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
  muted,
  danger,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md bg-[var(--color-muted)] px-2.5 py-1.5">
      <div className="text-[10px] text-[var(--color-muted-fg)] leading-tight">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-lg font-bold tabular-nums leading-tight ${
            accent
              ? "text-[var(--color-accent)]"
              : danger
                ? "text-red-500"
                : muted
                  ? "text-[var(--color-muted-fg)]"
                  : ""
          }`}
        >
          {value}
        </span>
        {hint ? (
          <span className="text-[10px] text-[var(--color-muted-fg)] truncate">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}
