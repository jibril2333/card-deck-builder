"use client";

import { useState } from "react";

/**
 * "导出图片" button: renders the deck as a single shareable PNG on a canvas
 * (header with name/color stripe/counts + card grid with ×N quantity badges)
 * and triggers a download. Card art is fetched through /api/card-image so the
 * canvas stays un-tainted (the art CDNs don't send CORS headers).
 */
export type ExportCard = {
  code: string;
  name: string;
  image_url: string | null;
  quantity: number;
};

const CARD_W = 200;
const CARD_H = 280;
const GAP = 12;
const PAD = 40;
const HEADER_H = 130;

function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/api/card-image?url=${encodeURIComponent(url)}`;
  });
}

export function DeckImageExport({
  deckName,
  accent,
  accent2,
  gameLabel,
  subtitle,
  cards,
}: {
  deckName: string;
  accent: string;
  accent2: string | null;
  gameLabel: string;
  /** e.g. "主卡组 50 张 · 蛋卡 5 张" */
  subtitle: string;
  cards: ExportCard[];
}) {
  const [busy, setBusy] = useState(false);

  async function exportPng() {
    if (busy || cards.length === 0) return;
    setBusy(true);
    try {
      const cols = Math.min(10, Math.max(5, cards.length));
      const rows = Math.ceil(cards.length / cols);
      const W = PAD * 2 + cols * CARD_W + (cols - 1) * GAP;
      const H = PAD * 2 + HEADER_H + rows * CARD_H + (rows - 1) * GAP;

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Theme-independent dark backdrop — reads well in chat apps.
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, W, H);

      // Accent stripe.
      const grad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2 ?? accent);
      ctx.fillStyle = grad;
      roundedPath(ctx, PAD, PAD, W - PAD * 2, 10, 5);
      ctx.fill();

      // Title + meta.
      ctx.fillStyle = "#f5f6f8";
      ctx.font =
        'bold 44px -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      ctx.fillText(deckName, PAD, PAD + 64);
      ctx.fillStyle = "#9aa1ac";
      ctx.font =
        '22px -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
      const date = new Date().toISOString().slice(0, 10);
      ctx.fillText(`${gameLabel} · ${subtitle} · ${date}`, PAD, PAD + 100);

      // Card art, all in parallel through the proxy.
      const images = await Promise.all(
        cards.map((c) => (c.image_url ? loadImage(c.image_url) : null)),
      );

      cards.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = PAD + col * (CARD_W + GAP);
        const y = PAD + HEADER_H + row * (CARD_H + GAP);

        ctx.save();
        roundedPath(ctx, x, y, CARD_W, CARD_H, 10);
        ctx.clip();
        const img = images[i];
        if (img) {
          ctx.drawImage(img, x, y, CARD_W, CARD_H);
        } else {
          ctx.fillStyle = "#1d2129";
          ctx.fillRect(x, y, CARD_W, CARD_H);
          ctx.fillStyle = "#9aa1ac";
          ctx.font = "bold 20px monospace";
          ctx.fillText(c.code, x + 14, y + 40);
          ctx.font =
            '16px -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';
          ctx.fillText(c.name.slice(0, 12), x + 14, y + 70);
        }
        ctx.restore();

        // ×N badge.
        const label = `×${c.quantity}`;
        ctx.font = "bold 22px -apple-system, sans-serif";
        const tw = ctx.measureText(label).width;
        const bw = tw + 18;
        const bx = x + CARD_W - bw - 8;
        const by = y + CARD_H - 36;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        roundedPath(ctx, bx, by, bw, 30, 8);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(label, bx + 9, by + 23);
      });

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png"),
      );
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${deckName.replace(/[\\/:*?"<>|]/g, "_") || "deck"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={exportPng}
      disabled={busy || cards.length === 0}
      className="px-3 h-8 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
      title="把整个卡组排版成一张 PNG 图片下载,方便分享"
    >
      🖼️ {busy ? "生成中…" : "导出图片"}
    </button>
  );
}
