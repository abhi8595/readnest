/**
 * A1 — WebDAV sync backend (KOReader/Nextcloud crowd + Mac/PC file access).
 *
 * Reuses the Drive snapshot + merge infra (`buildSnapshot` / `mergeSnapshot`
 * in drive.ts); only the transport differs. Auth is HTTP Basic (works with
 * Nextcloud/ownCloud app passwords and most WebDAV servers). Digest auth is
 * intentionally unsupported — the UI says so instead of failing obscurely.
 */

export interface WebdavConfig {
  /** e.g. https://cloud.example.com/remote.php/dav/files/user */
  baseUrl: string;
  username: string;
  /** app password / token (stored in SecureStore, never in sqlite/kv). */
  password: string;
  /** Subfolder for the backup file, e.g. "ReadNest". Empty = server root. */
  path: string;
}

export const WEBDAV_FILE = 'readnest-backup.json';

export class WebdavError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isWebdavAuthError(e: unknown): boolean {
  return e instanceof WebdavError && (e.status === 401 || e.status === 403);
}

/** Normalize user input: strip trailing slashes, require http(s). */
export function normalizeBaseUrl(input: string): string {
  const t = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(localhost(\.\w+)?|.+\..+)(:\d+)?(\/.*)?$/.test(t)) {
    throw new WebdavError('Server URL must start with http(s):// and include a host.', 0);
  }
  return t;
}

export function normalizePath(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

/** Full URL of the backup file for a config (pure — unit tested). */
export function webdavFileUrl(cfg: WebdavConfig): string {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const folder = normalizePath(cfg.path);
  return folder ? `${base}/${folder}/${WEBDAV_FILE}` : `${base}/${WEBDAV_FILE}`;
}

/** Parent collections that must exist for the file PUT to succeed. */
export function webdavParentUrls(cfg: WebdavConfig): string[] {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const folder = normalizePath(cfg.path);
  if (!folder) return [];
  const parts = folder.split('/');
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    out.push(`${base}/${parts.slice(0, i).join('/')}/`);
  }
  return out;
}

function authHeader(cfg: WebdavConfig): string {
  // TextEncoder-free base64 (RN Hermes compatible).
  const creds = `${cfg.username}:${cfg.password}`;
  const b64 = typeof btoa === 'function'
    // eslint-disable-next-line no-undef
    ? btoa(unescape(encodeURIComponent(creds)))
    : Buffer.from(creds, 'utf8').toString('base64');
  return `Basic ${b64}`;
}

async function checked(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new WebdavError(`${what} failed (${res.status})`, res.status);
  return res;
}

async function ensureParents(cfg: WebdavConfig, headers: Record<string, string>): Promise<void> {
  for (const url of webdavParentUrls(cfg)) {
    const res = await fetch(url, { method: 'MKCOL', headers });
    // 201 created · 405/409/423 already exists or locked-as-collection — all fine.
    if (![201, 405, 409, 423].includes(res.status)) {
      await checked(res, 'Create folder');
    }
  }
}

export async function pushToWebdav(cfg: WebdavConfig): Promise<void> {
  if (!cfg.username.trim() || !cfg.password) {
    throw new WebdavError('WebDAV username and password are required.', 0);
  }
  const { buildSnapshot } = await import('./drive');
  const snap = await buildSnapshot();
  const headers = {
    Authorization: authHeader(cfg),
    'Content-Type': 'application/json',
  };
  const url = webdavFileUrl(cfg);
  let res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(snap) });
  if (res.status === 409) {
    // Parent collection missing — create the folder chain and retry once.
    await ensureParents(cfg, { Authorization: headers.Authorization });
    res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(snap) });
  }
  await checked(res, 'WebDAV upload');
}

export async function pullFromWebdav(cfg: WebdavConfig): Promise<import('./drive').DriveSnapshot | null> {
  if (!cfg.username.trim() || !cfg.password) {
    throw new WebdavError('WebDAV username and password are required.', 0);
  }
  const res = await fetch(webdavFileUrl(cfg), {
    method: 'GET',
    headers: { Authorization: authHeader(cfg) },
  });
  if (res.status === 404) return null;
  await checked(res, 'WebDAV download');
  const snap = (await res.json()) as import('./drive').DriveSnapshot;
  if (!snap || snap.version !== 1 || !Array.isArray(snap.books)) {
    throw new WebdavError('Remote backup is unreadable (version mismatch).', 422);
  }
  return snap;
}

/** Lightweight connectivity check (PROPFIND on the base, GET-tolerant). */
export async function testWebdav(cfg: WebdavConfig): Promise<void> {
  const headers = { Authorization: authHeader(cfg), Depth: '0' };
  const res = await fetch(normalizeBaseUrl(cfg.baseUrl), { method: 'PROPFIND', headers });
  // Some servers reject PROPFIND at root but allow file GET — treat anything
  // other than auth errors as "reachable" and let push/pull report the rest.
  if (res.status === 401 || res.status === 403) {
    throw new WebdavError('Authentication rejected — check username and app password.', res.status);
  }
}
