/**
 * Where the push-notification settings live: `<data dir>/ntfy.json`.
 *
 * Read by two route handlers — the settings endpoint and its "send a test"
 * sibling — which is why this is a module of its own. It used to be exported
 * from the settings route itself, and a route file may export only route
 * handlers and segment config: Next's type check rejects anything else.
 * backup-store.ts is the same arrangement for the backup settings.
 */

import fs from "node:fs";
import path from "node:path";
import { EMPTY_NTFY, parseNtfyConfig, type NtfyConfig } from "./ntfy-config";
import { readJsonFile } from "./json-file";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const FILE = path.join(DATA_DIR, "ntfy.json");

export function readNtfyConfig(): NtfyConfig {
  const raw = readJsonFile(FILE);
  return raw === undefined ? EMPTY_NTFY : parseNtfyConfig(raw);
}

/** Throws when the file cannot be written; the caller reports it. */
export function writeNtfyConfig(next: NtfyConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  // 0600 from the moment it exists: this file holds a credential, and it
  // lives in the same directory the databases are backed up out of.
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
  fs.chmodSync(FILE, 0o600);
}
