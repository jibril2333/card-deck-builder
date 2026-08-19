"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeckVersionAction } from "@/app/[game]/actions";

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

  const label = (o: VersionOption) =>
    `${o.code}${o.name_en ? ` · ${o.name_en}` : ""}`;

  if (!editable) {
    if (!version) return null;
    return (
      <span
        className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-muted)] text-[var(--color-muted-fg)] border border-[var(--color-border)]"
        title="这份卡表是按这个卡包的环境组的"
      >
        版本 {version}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label="卡组版本"
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        title="这份卡表是按哪个卡包的环境组的"
        className="h-6 max-w-[13rem] rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 text-xs cursor-pointer disabled:opacity-60"
      >
        <option value="">版本 未设置</option>
        {/* Same as picking the newest pack in the list, but says WHY that's
            the answer — it's what the cards themselves imply. */}
        {auto && auto !== value ? (
          <option value={auto}>按最新的卡 → {auto}</option>
        ) : null}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            版本 {label(o)}
          </option>
        ))}
      </select>
      {newer > 0 ? (
        <span
          className="text-[11px] text-amber-600 dark:text-amber-400"
          title={`有 ${newer} 张卡来自比 ${value} 更新的卡包`}
        >
          +{newer} 张更新的卡
        </span>
      ) : null}
    </span>
  );
}
