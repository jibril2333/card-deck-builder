import type { Metadata } from "next";
import "./globals.css";
import { NavTracker } from "@/components/nav-tracker";

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
      <body className="min-h-full flex flex-col">
        {/* Counts client-side navigations so BackLink knows whether the entry
            behind us is ours. Renders nothing. */}
        <NavTracker />
        {children}
      </body>
    </html>
  );
}
