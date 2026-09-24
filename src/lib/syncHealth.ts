/**
 * A2 — Sync health dashboard data (per newfeaturePlan.md).
 *
 * One kv row (`sync-health-v1`) records last-sync timestamps, merged counts
 * and the last error per backend. Offline queue depth comes from the
 * `sync_log` table (rows with `synced_at IS NULL`). All reads are
 * best-effort — the dashboard shows "never" instead of crashing.
 */
import { kvGet, kvSet } from '@/db/repositories';
import { getDb } from '@/db/client';

const KEY = 'sync-health-v1';

export type SyncBackend = 'drive' | 'webdav';

export interface BackendHealth {
  lastSyncAt: number | null;
  lastMerged: number;
  lastError: string | null;
  /** A3 — remote-wins overwrites where this device had also changed. */
  lastConflicts: number;
}

export interface SyncHealth {
  drive: BackendHealth;
  webdav: BackendHealth;
  /** Rows in sync_log awaiting upload (offline queue visibility). */
  pendingOps: number;
}

const emptyBackend = (): BackendHealth => ({ lastSyncAt: null, lastMerged: 0, lastError: null, lastConflicts: 0 });

export async function getSyncHealth(): Promise<SyncHealth> {
  const fallback: SyncHealth = { drive: emptyBackend(), webdav: emptyBackend(), pendingOps: 0 };
  try {
    const raw = await kvGet(KEY);
    let parsed: Partial<SyncHealth> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Partial<SyncHealth>;
      } catch { /* corrupted — fall through to defaults */ }
    }
    let pending = 0;
    try {
      const db = await getDb();
      const r = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) as n FROM sync_log WHERE synced_at IS NULL',
      );
      pending = r?.n ?? 0;
    } catch { /* table missing on very old DBs */ }
    return {
      drive: { ...emptyBackend(), ...(parsed.drive ?? {}) },
      webdav: { ...emptyBackend(), ...(parsed.webdav ?? {}) },
      pendingOps: pending,
    };
  } catch {
    return fallback;
  }
}

export async function recordSyncSuccess(backend: SyncBackend, merged: number, conflicts = 0): Promise<void> {
  try {
    const cur = await getSyncHealth();
    cur[backend] = { lastSyncAt: Date.now(), lastMerged: merged, lastError: null, lastConflicts: conflicts };
    await kvSet(KEY, JSON.stringify({ drive: cur.drive, webdav: cur.webdav }));
  } catch { /* health must never break sync */ }
}

/** Newest timestamp across backends — the A3 conflict baseline. */
export function lastSyncBaseline(h: SyncHealth): number | undefined {
  const at = Math.max(h.drive.lastSyncAt ?? 0, h.webdav.lastSyncAt ?? 0);
  return at > 0 ? at : undefined;
}

export async function recordSyncError(backend: SyncBackend, message: string): Promise<void> {
  try {
    const cur = await getSyncHealth();
    cur[backend] = { ...cur[backend], lastError: message.slice(0, 300) };
    await kvSet(KEY, JSON.stringify({ drive: cur.drive, webdav: cur.webdav }));
  } catch { /* health must never break sync */ }
}
