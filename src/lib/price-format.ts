/** A yen amount as the UI writes it: `¥1,234`, two decimals at most. */
export function formatPrice(n: number): string {
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
