import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId, colorHex } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { RestrictionBadge } from "@/components/restriction-badge";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

/**
 * Public banlist / restricted-list page. Read-only — pulls straight from the
 * `card_restrictions` table that's maintained by the periodic scraper
 * (`src/lib/scraper/restrictions.ts`). Groups entries by status so that the
 * "what can't I play" question is answered above the fold.
 *
 * Card identity = the base print's code. Parallel printings share the
 * restriction (clamping is enforced server-side in `clampQuantityToRestriction`,
 * so the page just shows the base print's thumbnail as a representative). For
 * A `includes_parallel = 0` row gets a small "不含异画" note so users know
 * the alt-arts AREN'T capped by this entry.
 */
export default async function RestrictionsPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();

  const lib = digimon;
  let rows = lib.listRestrictions();
  let pairEdges = lib.listBannedPairs();

  // Localize the displayed cards per the user's language pick — the artwork as
  // well as the name. The name alone left a Japanese title over English art,
  // which is the one combination that isn't a language.
  //
  // Each field falls back on its own: a card can have a translated name and no
  // localized scan (or the reverse), and `?? ` per field keeps the half that
  // exists instead of dropping both.
  {
    const cardLang = parseCardLang(
      (await cookies()).get(CARD_LANG_COOKIE)?.value,
    );
    const codes = [
      ...rows.map((r) => r.card_code).filter((c): c is string => !!c),
      ...pairEdges.flatMap((e) => [e.trigger_code, e.banned_code]),
    ].filter((c): c is string => !!c);
    const tMap = digimon.getDisplayTranslations(codes, cardLang);
    if (tMap.size > 0) {
      rows = rows.map((r) => {
        const t = r.card_code ? tMap.get(r.card_code) : undefined;
        if (!t) return r;
        return {
          ...r,
          card_name: t.name ?? r.card_name,
          card_image_url: t.image_url ?? r.card_image_url,
        };
      });
      pairEdges = pairEdges.map((e) => {
        const a = e.trigger_code ? tMap.get(e.trigger_code) : undefined;
        const b = e.banned_code ? tMap.get(e.banned_code) : undefined;
        return {
          ...e,
          trigger_name: a?.name ?? e.trigger_name,
          trigger_image_url: a?.image_url ?? e.trigger_image_url,
          banned_name: b?.name ?? e.banned_name,
          banned_image_url: b?.image_url ?? e.banned_image_url,
        };
      });
    }
  }

  const banned = rows.filter((r) => r.status === "banned");
  const limited1 = rows.filter((r) => r.status === "limited_1");
  const limited2 = rows.filter((r) => r.status === "limited_2");

  // Group banned-pair edges by trigger so the UI can render "A ⇒ B1, B2, …"
  // groups rather than a long flat list of edges.
  const pairGroups = (() => {
    const m = new Map<string, typeof pairEdges>();
    for (const edge of pairEdges) {
      const arr = m.get(edge.trigger_identity) ?? [];
      arr.push(edge);
      m.set(edge.trigger_identity, arr);
    }
    return [...m.entries()].map(([trigger, edges]) => ({
      trigger,
      // The trigger metadata is on every edge — grab from the first one.
      trigger_code: edges[0].trigger_code,
      trigger_name: edges[0].trigger_name,
      trigger_image_url: edges[0].trigger_image_url,
      trigger_color: edges[0].trigger_color,
      banned: edges.map((e) => ({
        identity: e.banned_identity,
        code: e.banned_code,
        name: e.banned_name,
        image_url: e.banned_image_url,
        color: e.banned_color,
      })),
    }));
  })();

  // Latest fetched_at across rows = "last sync" stamp for the source.
  const lastSync = (() => {
    const allTimes = [...rows, ...pairEdges].map((x) => x.fetched_at);
    return allTimes.reduce<string | null>(
      (acc, t) => (acc === null || t > acc ? t : acc),
      null,
    );
  })();

  return (
    <>
      {/* A wall of card tiles — extra width becomes another column, not longer
          lines, so the cap is only here to stop the tiles growing past the size
          they are everywhere else in the app. */}
      <main className="w-full mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
        <header className="mb-5">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <span aria-hidden>🚫</span>
            禁卡 / 制限卡
            <span className="text-[var(--color-muted-fg)] font-normal text-sm tabular-nums">
              ({rows.length}
              {pairGroups.length > 0 ? ` · ${pairGroups.length} 组合` : ""})
            </span>
          </h1>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">
            按身份计算:本体 + 异画合计
            {lastSync ? (
              <>
                {" "}
                最后同步:{" "}
                <span className="tabular-nums">{lastSync.slice(0, 10)}</span>
              </>
            ) : null}
          </p>
        </header>

        {rows.length === 0 && pairGroups.length === 0 ? (
          <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            暂无禁制限卡数据,将在下次同步后显示。
          </div>
        ) : (
          <div className="space-y-8">
            <Section
              kind="banned"
              title="禁卡"
              caption="不能放入卡组"
              rows={banned}
              game={game}
            />
            <Section
              kind="limited_1"
              title="制限 1"
              caption="卡组中最多 1 张(含异画)"
              rows={limited1}
              game={game}
            />
            <Section
              kind="limited_2"
              title="制限 2"
              caption="卡组中最多 2 张(含异画)"
              rows={limited2}
              game={game}
            />
            <PairsSection groups={pairGroups} game={game} />
          </div>
        )}
      </main>
    </>
  );
}

type Row = {
  identity: string;
  status: "banned" | "limited_1" | "limited_2";
  max_count: number;
  since_date: string | null;
  includes_parallel: number;
  fetched_at: string;
  card_id: string | null;
  card_code: string | null;
  card_name: string | null;
  card_image_url: string | null;
  card_color: string | null;
  card_type: string | null;
};

function Section({
  kind,
  title,
  caption,
  rows,
  game,
}: {
  kind: Row["status"];
  title: string;
  caption: string;
  rows: Row[];
  game: string;
}) {
  if (rows.length === 0) return null;
  const accentClass =
    kind === "banned" ? "border-red-500/40" : "border-amber-500/40";

  return (
    <section
      className={`rounded-lg border ${accentClass} bg-[var(--color-card)]`}
    >
      <header className="flex items-baseline gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        <RestrictionBadge
          restriction={{
            status: kind,
            max_count: kind === "banned" ? 0 : kind === "limited_1" ? 1 : 2,
          }}
        />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-[var(--color-muted-fg)]">·</span>
        <span className="text-xs text-[var(--color-muted-fg)]">{caption}</span>
        <span className="ml-auto text-xs text-[var(--color-muted-fg)] tabular-nums">
          {rows.length} 种
        </span>
      </header>
      {/* Four to a row on a phone, like every other card grid in the app — a
          50-card 制限 section was 25 rows of scrolling at two across. The
          `sm`/`md` steps that used to hold 3 and 4 are gone rather than kept:
          going 4 → 3 as the screen gets WIDER is the one thing worse than two
          across. Desktop (lg/xl) is untouched. */}
      <div className="p-2 sm:p-3 grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1.5 sm:gap-3">
        {rows.map((r) => (
          <RestrictionCard key={r.identity} row={r} game={game} />
        ))}
      </div>
    </section>
  );
}

function RestrictionCard({ row, game }: { row: Row; game: string }) {
  const href = row.card_code
    ? `/${game}/card/${row.card_code
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    : null;
  const inner = (
    <>
      <div className="relative aspect-[5/7] bg-[var(--color-muted)] overflow-hidden rounded-t-md">
        {row.card_image_url ? (
          <img
            src={row.card_image_url}
            alt={row.card_name ?? row.identity}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-[var(--color-muted-fg)] p-2 text-center">
            缺图
          </div>
        )}
        {row.includes_parallel === 0 ? (
          <span
            className="absolute top-0.5 left-0.5 sm:top-1.5 sm:left-1.5 px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium bg-black/70 text-white"
            title="本条限制不包括异画卡 — 异画各自按标准 4 张上限"
          >
            不含异画
          </span>
        ) : null}
      </div>
      {/* Caption sizes match the phone sizes in globals.css's `.card-grid`
          rules, so a tile here reads the same as one in search results. */}
      <div className="px-1 sm:px-2 py-1 sm:py-1.5 space-y-0.5">
        <div className="flex items-center gap-1 sm:gap-1.5">
          {row.card_color ? (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: colorHex(row.card_color) }}
            />
          ) : null}
          <div className="text-[9px] sm:text-[10px] font-mono text-[var(--color-muted-fg)] truncate flex-1">
            {row.identity}
          </div>
        </div>
        <div className="text-[10.5px] leading-tight sm:text-xs sm:leading-normal font-medium truncate group-hover:text-[var(--color-accent)]">
          {row.card_name ?? (
            <span className="text-[var(--color-muted-fg)]">未在卡库中</span>
          )}
        </div>
      </div>
    </>
  );

  const tileClass =
    "group block rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden hover:border-[var(--color-fg)] transition-colors";

  return href ? (
    <Link href={href} className={tileClass}>
      {inner}
    </Link>
  ) : (
    <div className={tileClass}>{inner}</div>
  );
}

type PairGroup = {
  trigger: string;
  trigger_code: string | null;
  trigger_name: string | null;
  trigger_image_url: string | null;
  trigger_color: string | null;
  banned: {
    identity: string;
    code: string | null;
    name: string | null;
    image_url: string | null;
    color: string | null;
  }[];
};

/**
 * "Banned Pair" section — one row per trigger card with a horizontal list of
 * the cards it outlaws. Visually distinct from the single-card sections
 * above (purple accent) because the semantics are different: you CAN play
 * the trigger card alone; you CAN play the banned cards alone; the rule is
 * about co-occurrence.
 */
function PairsSection({ groups, game }: { groups: PairGroup[]; game: string }) {
  if (groups.length === 0) return null;
  return (
    <section className="rounded-lg border border-purple-500/40 bg-[var(--color-card)]">
      <header className="flex items-baseline gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] rounded-md font-bold text-white bg-purple-600 shadow">
          组合
        </span>
        <h2 className="text-sm font-semibold">禁卡组合</h2>
        <span className="text-xs text-[var(--color-muted-fg)]">·</span>
        <span className="text-xs text-[var(--color-muted-fg)]">
          A 出现在卡组里 ⇒ B 不能与 A 同卡组
        </span>
        <span className="ml-auto text-xs text-[var(--color-muted-fg)] tabular-nums">
          {groups.length} 组
        </span>
      </header>
      <div className="divide-y divide-[var(--color-border)]">
        {groups.map((g) => (
          <PairRow key={g.trigger} group={g} game={game} />
        ))}
      </div>
    </section>
  );
}

function PairRow({ group, game }: { group: PairGroup; game: string }) {
  return (
    // ONE grid, with the same column ladder as the sections above (4 / 5 / 6 /
    // 8 across). Every card on this page is then exactly the same width at
    // every width, which no amount of sizing the pair row's own columns can
    // achieve: those columns are fractions of the ROW, so the same card came
    // out 356px here and 178px there.
    //
    // The trigger card is the first tile, ringed and carrying the ⇒; the rest
    // of the row is what it outlaws. The two column captions ("A · 触发卡" /
    // "B · 不能与 A 同卡组") are gone with the columns — the section header
    // states the rule once, and a purple tile followed by plain ones is the
    // same statement without the words.
    <div className="p-2 sm:p-3 grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1.5 sm:gap-3">
      <div className="relative">
        <div className="rounded-md ring-2 ring-purple-500/70">
          <PairCard
            identity={group.trigger}
            code={group.trigger_code}
            name={group.trigger_name}
            image_url={group.trigger_image_url}
            color={group.trigger_color}
            game={game}
          />
        </div>
        <span
          title={`卡组里有这张卡时,右边 ${group.banned.length} 张都不能同组`}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shadow"
        >
          ⇒
        </span>
      </div>
      {group.banned.map((b) => (
        <PairCard
          key={b.identity}
          identity={b.identity}
          code={b.code}
          name={b.name}
          image_url={b.image_url}
          color={b.color}
          game={game}
        />
      ))}
    </div>
  );
}

function PairCard({
  identity,
  code,
  name,
  image_url,
  color,
  game,
}: {
  identity: string;
  code: string | null;
  name: string | null;
  image_url: string | null;
  color: string | null;
  game: string;
}) {
  const href = code
    ? `/${game}/card/${code.split("/").map(encodeURIComponent).join("/")}`
    : null;
  const inner = (
    <>
      <div className="relative aspect-[5/7] bg-[var(--color-muted)] overflow-hidden rounded-t-md">
        {image_url ? (
          <img
            src={image_url}
            alt={name ?? identity}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-[var(--color-muted-fg)] p-2 text-center">
            缺图
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 space-y-0.5">
        <div className="flex items-center gap-1.5">
          {color ? (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: colorHex(color) }}
            />
          ) : null}
          <div className="text-[10px] font-mono text-[var(--color-muted-fg)] truncate flex-1">
            {identity}
          </div>
        </div>
        <div className="text-xs font-medium truncate group-hover:text-[var(--color-accent)]">
          {name ?? (
            <span className="text-[var(--color-muted-fg)]">未在卡库中</span>
          )}
        </div>
      </div>
    </>
  );
  const tileClass =
    "group block rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden hover:border-[var(--color-fg)] transition-colors";
  return href ? (
    <Link href={href} className={tileClass}>
      {inner}
    </Link>
  ) : (
    <div className={tileClass}>{inner}</div>
  );
}
