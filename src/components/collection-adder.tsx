"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adjustCardCollectionAction } from "@/app/[game]/actions";

/**
 * Quick-add row at the top of the collection page. Type a code (with optional
 * variant suffix like `_P1`) and a quantity, hit "添加" — the server resolves
 * the code to a card_id and bumps the collection.
 *
 * Resolution is server-side: we just submit the raw code; the action delegates
 * to `lib(game).getCardByCode(code)`. If the code's not found, the action
 * throws and error.tsx surfaces a clear hint.
 *
 * Why this isn't a fancy autocomplete: for the common case (you're holding a
 * physical card and just want to type the code), typing 8 chars + tab + a
 * number is faster than an interactive search.
 */
export function CollectionAdder({ game }: { game: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setError(null);
    const codeRaw = String(formData.get("code") ?? "").trim().toUpperCase();
    const qtyNum = Math.max(1, Number(formData.get("qty") ?? 1));
    if (!codeRaw) {
      setError("请输入卡牌编号");
      return;
    }

    // Split the parallel suffix off the code so we know what variant to record.
    // Both case variants work — the regex is case-insensitive.
    const match = codeRaw.match(/^(.+?)(_[Pp]\d+)?$/);
    if (!match) {
      setError("编号格式不对");
      return;
    }
    const baseCode = match[1];
    const variant = match[2] ?? "";

    // For Digimon the card_id equals the base code. For UA the card_id is
    // `jp-<set>-<suffix>` and the original code-with-/ should resolve via
    // `getCardByCode`. We let the server figure that out by passing the full
    // original code; on UA the variant suffix stays as part of the code (UA's
    // alt-arts are independent cards rows), so we pass variant="".
    let resolvedCode: string;
    let resolvedVariant: string;
    if (game === "digimon") {
      resolvedCode = baseCode;
      // Digimon uses uppercase parallel suffix in card_images.
      resolvedVariant = variant.toUpperCase();
    } else {
      // UA: the suffix is part of the cards.code, so pass the whole code and
      // leave variant empty. Lower-case the suffix for consistency.
      resolvedCode = baseCode + variant.toLowerCase();
      resolvedVariant = "";
    }

    const fd = new FormData();
    fd.set("game", game);
    fd.set("code", resolvedCode); // server uses this to resolve card_id
    fd.set("variant", resolvedVariant);
    fd.set("delta", String(qtyNum));
    startTransition(async () => {
      try {
        const res = await resolveAndAdjust(fd);
        if (res && !res.ok) {
          setError(res.error);
          return;
        }
        setCode("");
        setQty("1");
        router.refresh();
      } catch (e) {
        setError((e as Error).message ?? "添加失败");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 mb-5">
      <form
        action={onSubmit}
        className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
      >
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)] block mb-1">
            快速添加 — 卡牌编号
          </label>
          <Input
            name="code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={
              game === "digimon" ? "如 BT1-001 或 BT1-001_P1" : "如 EX01BT/HTR-1-030_p1"
            }
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="characters"
            className="font-mono w-full"
          />
        </div>
        <div className="w-full sm:w-24 shrink-0">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)] block mb-1">
            数量
          </label>
          <Input
            name="qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="text-center tabular-nums w-full"
          />
        </div>
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "添加中…" : "＋ 添加"}
        </Button>
      </form>
      {error ? (
        <div className="mt-2 text-xs text-red-700 dark:text-red-300 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/30">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Wrapper that calls the existing `adjustCardCollectionAction` but with a
 * code (not card_id). Resolution happens server-side; we encode the lookup
 * intent by stuffing `code` instead of `card_id` and letting a dedicated
 * action handle the lookup → adjust.
 *
 * Why a wrapper: the existing `adjustCardCollectionAction` takes a card_id,
 * which the client doesn't know yet. We need a server-side resolution step.
 */
async function resolveAndAdjust(
  fd: FormData,
): Promise<{ ok: true } | { ok: false; error: string } | void> {
  // Hand off to the dedicated server action defined below.
  const { adjustCollectionByCodeAction } = await import("@/app/[game]/actions");
  return adjustCollectionByCodeAction(fd);
}
