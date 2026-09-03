"use client";

import { useRef, useState } from "react";

/**
 * A text control whose value lives in the URL: type freely, navigate once you
 * stop, and follow the URL when it changes for some other reason.
 *
 * The subtle half is that last part. The value handed back to the control is
 * `searchParams.get(key)`, so a few hundred milliseconds after the debounced
 * navigation the control's own commit comes back as an incoming "change".
 * Adopting THAT overwrites everything typed while the request was in flight:
 * you pause after 暴龙, the search fires, you keep typing, and the box snaps
 * back to 暴龙. With an IME it is worse — reassigning a controlled input's
 * value mid-composition makes the browser throw the composing text away, so
 * the characters vanish as they are typed.
 *
 * So the rule is: acknowledge every incoming value, adopt only the ones we
 * did not send ourselves, and never touch the control mid-composition — a
 * genuinely external change (Back button, 清空全部) still lands, it is just
 * deferred until the composition ends, which re-renders us right back here.
 *
 * That rule used to live in the search box only. The range inputs had their
 * own copy of the pattern without it, which is the same echo bug waiting for
 * a slow enough round trip: type 3, the commit fires, type 0, and the echo of
 * "3" resets the box under your finger.
 */

/** What to do with an incoming value. Pure — see tests/debounced-field.test.ts. */
export function planSync(o: {
  /** What the URL says now. */
  incoming: string;
  /** The incoming value we last reacted to. */
  lastSeen: string;
  /** The last value WE sent to the URL. */
  committed: string;
  /** True while an IME is mid-composition. */
  composing: boolean;
}): { ack: boolean; adopt: boolean } {
  if (o.incoming === o.lastSeen) return { ack: false, adopt: false };
  // Mid-composition: don't even acknowledge it. Ending the composition
  // re-renders, and the change is picked up then.
  if (o.composing) return { ack: false, adopt: false };
  // Our own echo: acknowledged so it stops being "new", never written into
  // the control.
  return { ack: true, adopt: o.incoming !== o.committed };
}

export type DebouncedField<T extends Record<string, string>> = {
  /** What the control shows right now. */
  local: T;
  /** Type into one or more fields; commits `delay` ms after the last call. */
  set: (patch: Partial<T>) => void;
  /** Commit immediately — Enter, a clear button, an IME finishing a word. */
  flush: (patch?: Partial<T>) => void;
};

export function useDebouncedField<T extends Record<string, string>>(opts: {
  /** The committed values, as the URL currently reads them. */
  value: T;
  delay: number;
  onCommit: (v: T) => void;
  /** Read synchronously inside timeouts, where a state snapshot is stale. */
  composing?: () => boolean;
  /** Applied on the way out — the search box trims. */
  clean?: (v: string) => string;
}): DebouncedField<T> {
  const { value, delay, onCommit } = opts;
  const [local, setLocal] = useState<T>(value);
  const [lastSeen, setLastSeen] = useState<T>(value);
  // State, not a ref: the sync below reads it while rendering, and a ref read
  // during render is exactly what the compiler tells you not to do. It is only
  // ever written from a commit, which happens in a timeout or a handler.
  const [committed, setCommitted] = useState<T>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = opts.composing?.() ?? false;

  // Render-phase sync rather than an effect: this is derived state, and doing
  // it in an effect costs a second render and trips the cascading-render lint.
  const keys = Object.keys(value) as (keyof T)[];
  const acks: Partial<T> = {};
  const adopts: Partial<T> = {};
  for (const k of keys) {
    const plan = planSync({
      incoming: value[k],
      lastSeen: lastSeen[k],
      committed: committed[k],
      composing,
    });
    if (plan.ack) acks[k] = value[k];
    if (plan.adopt) adopts[k] = value[k];
  }
  if (Object.keys(acks).length) setLastSeen({ ...lastSeen, ...acks });
  if (Object.keys(adopts).length) setLocal({ ...local, ...adopts });

  function commit(next: T) {
    const cleaned = opts.clean
      ? (Object.fromEntries(
          Object.entries(next).map(([k, v]) => [k, opts.clean!(v)]),
        ) as T)
      : next;
    setCommitted(cleaned);
    onCommit(cleaned);
  }

  function set(patch: Partial<T>) {
    const next = { ...local, ...patch };
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    // Don't navigate on romaji: the IME's own keystrokes are not a query.
    if (opts.composing?.()) return;
    timer.current = setTimeout(() => commit(next), delay);
  }

  function flush(patch?: Partial<T>) {
    const next = { ...local, ...patch };
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    commit(next);
  }

  return { local, set, flush };
}
