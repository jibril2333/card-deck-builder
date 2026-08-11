import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavTracker } from "@/components/nav-tracker";

export const metadata: Metadata = {
  title: "DCG Deck Builder",
  description: "Search cards and build decks for the Digimon Card Game",
};

/**
 * Tell the browser what colour this site is, instead of letting it guess.
 *
 * macOS Safari tints its toolbar with `theme-color`. With nothing declared it
 * SAMPLES the page instead, and with a single tab — where the tab strip
 * collapses into the toolbar — that sampled tint becomes a band sitting
 * directly above the page in some other colour. A second tab gives the strip
 * its space back, which is why the band appeared to come and go with the tab
 * count.
 *
 * The value is `--color-bg` from globals.css converted to sRGB. Keep the two in
 * step by hand: a meta tag can't read a CSS variable.
 *
 * NOT setting `colorScheme: "dark"` here, even though this app has exactly one
 * theme and it is dark. It would be the honest declaration, and it also hands
 * the native form controls to the browser's dark rendering — the filter panel's
 * checkboxes go from white to a dull grey. That's a visible change to something
 * nobody complained about, so it belongs in its own decision.
 */
export const viewport: Viewport = {
  themeColor: "#02142e",
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
