import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Deck Builder",
  description: "Search cards and build decks for Digimon & Union Arena",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
