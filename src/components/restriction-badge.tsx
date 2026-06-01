/**
 * Small red/orange chip rendered over a card thumbnail when the card has an
 * official-rule restriction. Display is purely cosmetic — actual enforcement
 * lives in `deck-shared.ts::clampQuantityToRestriction`, so even if this
 * badge is hidden somewhere, the server will still clamp deck additions.
 *
 * Positioning: callers wrap in a parent with `relative` and stack the badge
 * absolutely. We keep the visual identical between game pages and tile types,
 * so it's easy to spot at a glance.
 */

export type Restriction = {
  status: "banned" | "limited_1" | "limited_2";
  max_count: number;
};

export function RestrictionBadge({
  restriction,
  className = "",
}: {
  restriction: Restriction | null | undefined;
  className?: string;
}) {
  if (!restriction) return null;
  const isBanned = restriction.status === "banned";
  const label = isBanned ? "禁" : `限${restriction.max_count}`;
  const title = isBanned
    ? "官方禁卡:不能放入卡组"
    : `官方制限:卡组中最多 ${restriction.max_count} 张(含异画)`;
  return (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] rounded-md font-bold text-white shadow ${
        isBanned ? "bg-red-600" : "bg-amber-600"
      } ${className}`}
      title={title}
    >
      {label}
    </span>
  );
}
