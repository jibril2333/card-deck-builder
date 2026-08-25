/**
 * Reading and writing `data.nosync/backup.json`.
 *
 * Kept out of the route file because a Next route module may only export route
 * handlers — and because the daemon-facing half of this feature has no
 * business importing from `app/api`.
 */
import fs from "node:fs";
import path from "node:path";
import {
  EMPTY_BACKUP,
  parseBackupConfig,
  type BackupConfig,
} from "@/lib/backup-config";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
export const BACKUP_CONFIG_FILE = path.join(DATA_DIR, "backup.json");
export const BACKUP_STATUS_FILE = path.join(DATA_DIR, "backup-status.json");

export function readBackupConfig(): BackupConfig {
  try {
    return parseBackupConfig(
      JSON.parse(fs.readFileSync(BACKUP_CONFIG_FILE, "utf8")),
    );
  } catch {
    return EMPTY_BACKUP;
  }
}

/** Whatever the daemon last said about itself. Absent until it has run once. */
export function readBackupStatus(): unknown {
  try {
    return JSON.parse(fs.readFileSync(BACKUP_STATUS_FILE, "utf8"));
  } catch {
    return null;
  }
}

/** Atomic, 0600 — the file holds the R2 secret. */
export function writeBackupConfig(next: BackupConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${BACKUP_CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, BACKUP_CONFIG_FILE);
  fs.chmodSync(BACKUP_CONFIG_FILE, 0o600);
}
