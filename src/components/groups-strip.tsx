import Link from "next/link";
import { createGroupAction } from "@/app/[game]/actions";

type GroupLite = {
  id: string;
  name: string;
  decks: { id: string; accent_color: string; accent_color2: string | null }[];
};

/**
 * Compact strip on the decks page listing the user's shared-pool groups (decks
 * that share one physical card set) plus a button to create a new one. Each
 * chip links to that group's pooled buy-list view.
 */
export function GroupsStrip({
  game,
  groups,
}: {
  game: string;
  groups: GroupLite[];
}) {
  return (
    <div className="mb-5 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--color-muted-fg)] inline-flex items-center gap-1">
        🎴 共享卡池
      </span>
      {groups.map((g) => (
        <Link
          key={g.id}
          href={`/${game}/groups/${g.id}`}
          className="inline-flex items-center gap-2 px-2.5 h-8 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-fg)] text-sm transition-colors"
        >
          <span className="flex -space-x-1">
            {g.decks.slice(0, 4).map((d) => (
              <span
                key={d.id}
                className="w-2.5 h-2.5 rounded-full ring-1 ring-[var(--color-card)]"
                style={{
                  background: d.accent_color2
                    ? `linear-gradient(135deg, ${d.accent_color}, ${d.accent_color2})`
                    : d.accent_color,
                }}
              />
            ))}
          </span>
          <span>{g.name}</span>
          <span className="text-[var(--color-muted-fg)] text-xs">
            {g.decks.length}
          </span>
        </Link>
      ))}
      <form action={createGroupAction}>
        <input type="hidden" name="game" value={game} />
        <button
          type="submit"
          className="px-2.5 h-8 rounded-full border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)] cursor-pointer transition-colors"
        >
          ＋ 新建卡池
        </button>
      </form>
    </div>
  );
}
