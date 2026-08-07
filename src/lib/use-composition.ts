"use client";

import { useRef, useState } from "react";

/**
 * Suppress an input's debounced side effect while an IME is mid-composition.
 *
 * Typing 天女兽 with a pinyin IME fires `input` for every letter of "tiannv"
 * before a single character exists. Anything hanging off `onChange` therefore
 * runs on the romaji: the card search queried "tian" and showed "no matches"
 * under a box that visibly said 天, and the deck banner's autosave wrote the
 * half-typed pinyin into the deck's name. Same for kana input and for Chinese
 * handwriting/zhuyin.
 *
 * `composing` is state, not a ref, on purpose: components that debounce inside
 * a `useEffect` need the change of it to re-run the effect once the word is
 * committed, otherwise the final value never gets searched.
 *
 * Browsers disagree about whether the last `input` arrives before or after
 * `compositionend`, so `onCompositionEnd` hands back the element's value —
 * take it from there rather than from whatever state the last `onChange` set.
 */
export function useComposition(onCommit?: (value: string) => void) {
  const [composing, setComposing] = useState(false);
  // Mirrors `composing` for code that has to read it synchronously inside a
  // timeout callback, where the state snapshot may be stale.
  const composingRef = useRef(false);

  function onCompositionStart() {
    composingRef.current = true;
    setComposing(true);
  }

  function onCompositionEnd(
    e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement | HTMLElement>,
  ) {
    composingRef.current = false;
    setComposing(false);
    const el = e.currentTarget as HTMLInputElement | HTMLElement;
    const value =
      "value" in el ? (el as HTMLInputElement).value : (el.textContent ?? "");
    onCommit?.(value);
  }

  return {
    composing,
    composingRef,
    /** Spread onto the input / contentEditable element. */
    bind: { onCompositionStart, onCompositionEnd },
  };
}
