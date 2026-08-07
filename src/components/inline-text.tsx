"use client";

import { useEffect, useRef, useState } from "react";
import { useComposition } from "@/lib/use-composition";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Text that is edited exactly where it is displayed — no click-to-swap, no box
 * appearing under the cursor, no shift in where the characters sit. The
 * rendered text IS the input, which is the only way to guarantee the second
 * part: any swap between a `<p>` and an `<input>` moves the baseline by
 * whatever the input's border and padding come to.
 *
 * UNCONTROLLED on purpose. React re-rendering a contentEditable while an IME
 * is open cancels the composition — you type 卡组 and get 卡 — so the initial
 * text is written to the DOM once on mount and never again. The value is only
 * ever read out, on input, and the parent's `router.refresh()` cannot clobber
 * what is being typed.
 *
 * `plaintext-only` keeps pasted rich text from arriving as markup; the paste
 * handler is the fallback for engines that don't honour it.
 */
export function InlineText({
  as: Tag = "div",
  initial,
  placeholder,
  editable,
  onChange,
  onCommit,
  className = "",
  ariaLabel,
  title,
}: {
  as?: "h1" | "div" | "p";
  initial: string;
  placeholder?: string;
  editable: boolean;
  /** Fires on every keystroke — debounce upstream. */
  onChange: (value: string) => void;
  /** Fires on blur, with the final value. */
  onCommit?: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [empty, setEmpty] = useState(!initial);
  // `input` fires for every letter of the romaji, so without this the deck's
  // autosave writes half-typed pinyin into the name and then corrects it.
  const ime = useComposition((final) => onChange(final));

  // Seed the DOM once. Deliberately not in the dependency list: re-running
  // this on a prop change is the IME bug described above.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== initial) {
      ref.current.textContent = initial;
      setEmpty(!initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editable) {
    return (
      <Tag className={className} title={title}>
        {initial}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref as never}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      // NOT role="textbox" on a heading: an explicit role REPLACES the
      // implicit one, so the page would lose its only h1 and a screen reader
      // would stop announcing the deck's name as the title. contentEditable
      // already exposes the element as editable on its own.
      role={Tag === "h1" ? undefined : "textbox"}
      aria-label={ariaLabel}
      aria-multiline={Tag === "h1" ? undefined : true}
      title={title}
      data-placeholder={placeholder}
      {...ime.bind}
      onInput={(e: React.FormEvent<HTMLElement>) => {
        const v = e.currentTarget.textContent ?? "";
        // The placeholder still has to track what's on screen mid-composition;
        // only the save is held back.
        setEmpty(!v);
        if (ime.composingRef.current) return;
        onChange(v);
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) =>
        onCommit?.(e.currentTarget.textContent ?? "")
      }
      onPaste={(e: React.ClipboardEvent<HTMLElement>) => {
        // Only needed where contentEditable="plaintext-only" isn't honoured;
        // harmless where it is.
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, t);
      }}
      className={`${className} outline-none focus:outline-none ${
        empty ? "is-empty" : ""
      }`}
    />
  );
}
