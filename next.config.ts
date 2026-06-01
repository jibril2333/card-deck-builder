import type { NextConfig } from "next";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

const baseConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  typedRoutes: false,
};

// Use a phase-function so dev and prod write to fully separate dirs:
//   next dev          → .next/dev         (Next 16 default; left untouched)
//   next build        → .next/prod
//   next start        → reads .next/prod
//   e2e (CDB_E2E=1)   → .next/e2e-prod    (so the long-running prod server
//                                          on 3001 can keep using .next/prod
//                                          while Playwright builds to its own)
// This avoids the previous bug where prod artifacts shared `.next/` root with
// dev and the rebuild script had to use exclusion-pattern cleanup.
export default function nextConfig(phase: string): NextConfig {
  const isProd =
    phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER;
  if (!isProd) return baseConfig;
  const distDir = process.env.CDB_E2E === "1" ? ".next/e2e-prod" : ".next/prod";
  return { ...baseConfig, distDir };
}
