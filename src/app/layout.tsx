import type { Metadata } from "next";
import "./globals.css";
import { NavTracker } from "@/components/nav-tracker";

export const metadata: Metadata = {
  title: "DCG Deck Builder",
  description: "Search cards and build decks for the Digimon Card Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      {/* `relative z-10`: the backdrop in globals.css is a fixed ::before /
          ::after on the body, so the app has to sit above it. */}
      <body className="min-h-full flex flex-col relative z-10">
        {/* Counts client-side navigations so BackLink knows whether the entry
            behind us is ours. Renders nothing. */}
        <NavTracker />
        {children}
      </body>
    </html>
  );
}
