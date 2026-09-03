/**
 * 购买模式顶部那块进度面板。
 *
 * Its own component because it is the one part of the deck page that answers a
 * different question from everything around it: not "what is in this deck" but
 * "how much of it do I still have to buy". Everything it needs is a number the
 * page already counted.
 */
import Link from "next/link";
import { CartScriptButton } from "@/components/cart-script-button";
import { formatPrice } from "@/lib/price-format";

export function DeckPurchaseSummary({
  game,
  deckId,
  kinds,
  totalOwned,
  totalWanted,
  totalMissing,
  completedCards,
  purchaseProgress,
  totalPrice,
  remainingPrice,
  missingOnly,
}: {
  game: string;
  deckId: string;
  /** How many distinct cards the deck lists. */
  kinds: number;
  totalOwned: number;
  totalWanted: number;
  totalMissing: number;
  completedCards: number;
  purchaseProgress: number;
  totalPrice: number;
  remainingPrice: number;
  missingOnly: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs flex items-baseline gap-1.5 flex-wrap">
          <span className="font-semibold text-sm tabular-nums">
            {totalOwned}
          </span>
          <span className="text-[var(--color-muted-fg)]">
            / {totalWanted} 已购
          </span>
          {totalMissing > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">
              · 还差 <b>{totalMissing}</b>
              {remainingPrice > 0 ? (
                <span> · 约 {formatPrice(remainingPrice)}</span>
              ) : null}
            </span>
          ) : totalWanted > 0 ? (
            <span className="text-green-600 dark:text-green-400">
              · ✓ 已备齐
            </span>
          ) : null}
        </div>
        <div className="text-[10px] text-[var(--color-muted-fg)] tabular-nums whitespace-nowrap">
          {completedCards} / {kinds} 卡位齐全
          {totalPrice > 0 ? ` · 总价 ${formatPrice(totalPrice)}` : ""}
        </div>
      </div>
      <div className="h-1 rounded-full bg-[var(--color-muted)] overflow-hidden mt-1.5">
        <div
          className={`h-full transition-all ${
            purchaseProgress === 100 ? "bg-green-500" : "bg-amber-500"
          }`}
          style={{ width: `${purchaseProgress}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 mt-2">
        <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
          <Link
            href={`/${game}/decks/${deckId}?mode=purchase&missing=0`}
            replace
            scroll={false}
            className={`px-2.5 h-6 rounded text-[11px] flex items-center transition-colors ${
              !missingOnly
                ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
            }`}
          >
            全部
          </Link>
          <Link
            href={`/${game}/decks/${deckId}?mode=purchase`}
            replace
            scroll={false}
            className={`px-2.5 h-6 rounded text-[11px] flex items-center gap-1 transition-colors ${
              missingOnly
                ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
            }`}
          >
            仅缺货
            {totalMissing > 0 ? (
              <span className="inline-flex items-center justify-center min-w-[1rem] h-3.5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold tabular-nums">
                {totalMissing}
              </span>
            ) : null}
          </Link>
        </div>
        <span className="text-[10px] text-[var(--color-muted-fg)] whitespace-nowrap">
          绿=已备齐 · 橙=缺 · 灰=未买
        </span>
      </div>
      {/* What is still missing, ready to drop into the shop's cart.
        Only PAO for now — it is the shop whose cart API takes a
        product id, which is the id the price scrape already sees. */}
      <div className="mt-2">
        <CartScriptButton game={game} deckId={deckId} />
      </div>
    </div>
  );
}
