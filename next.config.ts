import type { NextConfig } from "next";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

const baseConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  typedRoutes: false,
};

// Build output lives under `.next.nosync/`. The project sits in an
// iCloud-synced folder (~/Desktop), and iCloud kept creating conflict copies
// of the build output — e.g. `.next/prod/server 2/` — which broke
// `next start` (it looks for the manifest in `server/`, not `server 2/`).
// macOS iCloud completely ignores any path containing `.nosync`, so putting
// every phase's output under `.next.nosync/` keeps the build artifacts local
// and untouched while staying inside the project. Separate subdirs keep dev /
// prod / e2e from clobbering each other.
//   dev               → .next.nosync/dev
//   build / start     → .next.nosync/prod
//   e2e (CDB_E2E=1)   → .next.nosync/e2e-prod
export default function nextConfig(phase: string): NextConfig {
  const isProd =
    phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER;
  const sub = isProd
    ? process.env.CDB_E2E === "1"
      ? "e2e-prod"
      : "prod"
    : "dev";
  return { ...baseConfig, distDir: `.next.nosync/${sub}` };
}
