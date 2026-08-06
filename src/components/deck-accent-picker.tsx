"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDeckMetaAction } from "@/app/[game]/actions";

/** Same debounce the deck's other inline edits use. */
const SAVE_DEBOUNCE_MS = 500;

/**
 * The deck's accent colours, as three dots in the corner of the banner.
 *
 * The first two are the deck's own colours and open a colour picker. The third
 * is the cover card's, and is not editable — it's a shortcut, not a slot. A
 * ring marks which of the two is in effect, and "in effect" is DERIVED, not
 * stored: the deck has no "colour mode" column, so the cover dot is ringed
 * exactly when the deck's colours already equal the cover's. Setting a custom
 * colour that happens to match the cover therefore reads as "following the
 * cover", which is indistinguishable in the data and identical in effect.
 *
 * Always two custom colours: multicolour cards are ordinary in this game, and
 * a deck that wants one colour just sets both dots to the same value. That
 * removes the old "＋ 加副色 / 移除副色" pair, which existed only to model a
 * single-colour state the gradient renders identically anyway.
 */
export function DeckAccentPicker({
  game,
  deckId,
  accent,
  accent2,
  coverAccent,
  coverAccent2,
}: {
  game: string;
  deckId: string;
  accent: string;
  accent2: string | null;
  coverAccent: string | null;
  coverAccent2: string | null;
}) {
  const router = useRouter();
  const [a, setA] = useState(accent);
  const [b, setB] = useState(accent2 ?? accent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function save(next1: string, next2: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("id", deckId);
      fd.set("accent_color", next1);
      fd.set("accent_color2", next2);
      await updateDeckMetaAction(fd);
      router.refresh();
    }, SAVE_DEBOUNCE_MS);
  }

  function setCustom(next1: string, next2: string) {
    setA(next1);
    setB(next2);
    save(next1, next2);
  }

  const coverB = coverAccent2 ?? coverAccent;
  const onCover =
    !!coverAccent &&
    a.toLowerCase() === coverAccent.toLowerCase() &&
    b.toLowerCase() === (coverB ?? coverAccent).toLowerCase();

  return (
    <div className="flex items-center gap-2">
      {/* Ringing the PAIR, not each dot: the two custom colours are one
          choice, and two separate rings would read as two options. */}
      <span
        className={`flex items-center gap-1.5 rounded-full p-1 transition-shadow ${
          onCover ? "" : "ring-2 ring-[var(--color-fg)]/70"
        }`}
        title="自选颜色"
      >
        <Dot value={a} onChange={(v) => setCustom(v, b)} label="主色" />
        <Dot value={b} onChange={(v) => setCustom(a, v)} label="副色" />
      </span>

      {coverAccent ? (
        <button
          type="button"
          onClick={() => setCustom(coverAccent, coverB ?? coverAccent)}
          aria-pressed={onCover}
          title="使用封面卡的颜色"
          className={`w-6 h-6 rounded-full border border-black/20 shadow-sm cursor-pointer transition-shadow ${
            onCover
              ? "ring-2 ring-offset-2 ring-offset-[var(--color-bg)] ring-[var(--color-fg)]/70"
              : ""
          }`}
          style={{
            background: coverAccent2
              ? `linear-gradient(135deg, ${coverAccent}, ${coverAccent2})`
              : coverAccent,
          }}
        />
      ) : null}
    </div>
  );
}

/** A colour swatch that is really an `<input type=color>` wearing a circle. */
function Dot({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="color"
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // appearance-none + the ::-webkit swatch rules in globals.css are what
      // turn the native control into a plain filled circle.
      className="deck-dot w-6 h-6 rounded-full cursor-pointer border border-black/20 shadow-sm p-0 bg-transparent"
    />
  );
}
