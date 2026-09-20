"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeckVersionAction } from "@/app/[game]/actions";
import { useI18n } from "@/lib/i18n/client";

export type VersionOption = {
  code: string;
  name_ja: string;
  name_en: string | null;
};

/**
 * Which pack this deck list is built for.
 *
 * A label, not a rule: nothing stops a BT-25 deck from holding a BT-26 card,
 * because that's exactly what a deck looks like the week you start updating
 * it. When the contents have moved past the label we say so — the count of
 * cards from newer packs, next to the version — and leave the fixing to the
 * owner, same as the banlist notice does.
 *
 * Non-owners get the chip without the select. Someone reading a friend's list
 * needs to know it's a BT-24 deck more than the owner does.
 */
export function DeckVersionPicker({
  game,
  deckId,
  version,
  options,
  auto,
  newer,
  editable,
}: {
  game: string;
  deckId: string;
  version: string | null;
  options: VersionOption[];
  /** The version the deck's own cards imply — what 自动 sets it to. */
  auto: string | null;
  /** How many cards need a pack newer than `version`. */
  newer: number;
  editable: boolean;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(version ?? "");

  function save(next: string) {
    setValue(next);
    start(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("id", deckId);
      fd.set("version", next);
      await setDeckVersionAction(fd);
      router.refresh();
    });
  }

  // A <select> is as wide as its widest option, so the closed control was
  // paying for "Extra Booster DIGITAL WORLD SHAMBALA" while displaying
  // "EX-12". The product-type prefix is the same handful of words on every
  // pack and identifies nothing.
  const label = (o: VersionOption) => {
    const name = (o.name_en ?? "").replace(
      /^(Advanced |Extra |Theme )?(Booster|Starter Deck|Limited Card Pack|Limited Pack|Card Set)\s*/i,
      "",
    );
    return `${o.code}${name ? ` · ${name}` : ""}`;
  };
  const newest = options[0]?.code;

  // Read-only view: non-owners, and your own decks while locked. A deck with
  // no version says nothing rather than showing an empty control.
  if (!editable) {
    if (!version) return null;
    return (
      <span
        className="chip"
        title={m.deck.versionTitle}
      >
        {m.deck.versionChip(version)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-[var(--color-muted-fg)]">{m.deck.version}</span>
      <select
        aria-label={m.deck.deckVersion}
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        title={m.deck.versionSelectTitle(newest ?? "—", auto)}
        className="h-6 max-w-[14rem] rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-xs cursor-pointer disabled:opacity-60 hover:bg-[var(--color-muted)]"
      >
        <option value="">{m.deck.notSet}</option>
        {/* Not "the newest pack" — the newest pack THIS DECK needs. Spelled
            out because the old wording ("按最新的卡") read as a claim about
            the game rather than about the deck in front of you. */}
        {auto && auto !== value ? (
          <option value={auto}>{m.deck.followList(auto)}</option>
        ) : null}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {label(o)}
          </option>
        ))}
      </select>
      {newer > 0 ? (
        <span
          className="text-[11px] text-amber-600 dark:text-amber-400"
          title={m.deck.newerTitle(newer, value)}
        >
          {m.deck.newerCards(newer)}
        </span>
      ) : null}
    </span>
  );
}
