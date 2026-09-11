/**
 * `GET /api/v1/meta` — the only anonymous endpoint.
 *
 * The client calls it before the login form does anything, which is what
 * lets it tell three failures apart that otherwise look identical from a
 * phone: a server too old to have this API (404), a network or tunnel
 * problem (no JSON at all), and a wrong password (401 from the login itself).
 *
 * It carries no configuration. Version and capability names only — nothing
 * about paths, data directories, or which options the deployment set.
 */

import { API_VERSION, CAPABILITIES } from "@/lib/api/capabilities";
import { api, json } from "@/lib/api/handler";

export const dynamic = "force-dynamic";

export const GET = api(async () =>
  json({ api_version: API_VERSION, capabilities: CAPABILITIES }),
);
