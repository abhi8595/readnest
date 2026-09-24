/**
 * Premium entitlements via RevenueCat (react-native-purchases).
 * Single entitlement id `premium` covering lifetime + subscription.
 *
 * Purchases MUST go through real offering packages: RevenueCat's
 * purchasePackage() needs the native package object — a hand-built
 * {identifier} throws. The paywall resolves packages via getOfferings()
 * and passes the matching BillingPackage here.
 */
import { Platform } from 'react-native';
import { rcKeys } from './config';

export const ENTITLEMENT_ID = 'premium';
/** Public SDK keys from env (see .env.example). Empty = not configured. */
export const RC_KEYS = rcKeys();

export function rcApiKey(): string {
  return Platform.OS === 'ios' ? RC_KEYS.ios : RC_KEYS.android;
}

export async function initPurchases(userId?: string): Promise<void> {
  const apiKey = rcApiKey();
  if (!apiKey) throw new Error('RevenueCat not configured');
  const Purchases = (await import('react-native-purchases')).default;
  Purchases.configure({ apiKey, appUserID: userId });
}

export interface PremiumSnapshot {
  isPremium: boolean;
  /** ISO expiration of the active premium entitlement (null = lifetime/unknown). */
  activeUntil: string | null;
  savedAt: string;
}

const PREMIUM_CACHE_KEY = 'readnest_premium_cache';

async function secureStore(): Promise<typeof import('expo-secure-store') | null> {
  try {
    return await import('expo-secure-store');
  } catch {
    return null;
  }
}

/** Last-known-good entitlement for offline launches (expiry-anchored, not a grace period). */
export async function readPremiumCache(): Promise<PremiumSnapshot | null> {
  try {
    const store = await secureStore();
    if (!store) return null;
    const raw = await store.getItemAsync(PREMIUM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PremiumSnapshot;
    if (typeof parsed.isPremium !== 'boolean' || typeof parsed.savedAt !== 'string') return null;
    return parsed;
  } catch {
    return null; // corrupted cache → fall back to network judgment
  }
}

export async function savePremiumCache(snap: PremiumSnapshot): Promise<void> {
  try {
    const store = await secureStore();
    if (!store) return;
    await store.setItemAsync(PREMIUM_CACHE_KEY, JSON.stringify(snap));
  } catch { /* cache is best-effort */ }
}

export async function clearPremiumCache(): Promise<void> {
  try {
    const store = await secureStore();
    if (!store) return;
    await store.deleteItemAsync(PREMIUM_CACHE_KEY);
  } catch { /* ignore */ }
}

/**
 * Offline trust check: entitled only when now is within the real
 * RevenueCat expiration window. Guards against device clock rollback.
 */
export function isCacheEntitled(cached: PremiumSnapshot | null, nowMs = Date.now()): boolean {
  if (!cached?.isPremium) return false;
  if (!cached.activeUntil) return true; // lifetime / unknown expiry → trust until server says otherwise
  const until = new Date(cached.activeUntil).getTime();
  const savedAt = new Date(cached.savedAt).getTime();
  if (!Number.isFinite(until) || !Number.isFinite(savedAt)) return false;
  if (nowMs < savedAt - 60_000) return false; // suspected clock rollback
  return nowMs < until;
}

async function snapshotFromInfo(info: { entitlements: { active: Record<string, { expirationDate?: string | null }> } }): Promise<PremiumSnapshot> {
  const active = info.entitlements.active[ENTITLEMENT_ID] as { expirationDate?: string | null } | undefined;
  return {
    isPremium: active != null,
    activeUntil: active?.expirationDate ?? null,
    savedAt: new Date().toISOString(),
  };
}

export async function checkPremium(): Promise<boolean> {
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    const snap = await snapshotFromInfo(info as never);
    if (snap.isPremium) await savePremiumCache(snap);
    else await clearPremiumCache();
    return snap.isPremium;
  } catch {
    // Offline / unconfigured: fall back to expiry-anchored cache, never downgrade blindly.
    return isCacheEntitled(await readPremiumCache());
  }
}

/** Subscribe to entitlement changes (expiry/cancel/refund/cross-device). No-op in Expo Go. */
export async function addPremiumListener(cb: (isPremium: boolean) => void): Promise<() => void> {
  try {
    const Purchases = (await import('react-native-purchases')).default;
    if (typeof Purchases.addCustomerInfoUpdateListener !== 'function') return () => {};
    const listener = (info: { entitlements: { active: Record<string, unknown> } }) => {
      const active = (info.entitlements.active as Record<string, unknown>)[ENTITLEMENT_ID] != null;
      void (async () => {
        if (active) {
          try {
            const full = await Purchases.getCustomerInfo();
            await savePremiumCache(await snapshotFromInfo(full as never));
          } catch { /* keep last cache */ }
        } else {
          await clearPremiumCache();
        }
      })();
      cb(active);
    };
    Purchases.addCustomerInfoUpdateListener(listener as never);
    return () => {
      try { Purchases.removeCustomerInfoUpdateListener(listener as never); } catch { /* ignore */ }
    };
  } catch {
    return () => {};
  }
}

/** RevenueCat v8 surfaces cancellation as PurchasesError code — not `userCancelled`. */
export function isUserCancelled(e: unknown): boolean {
  const err = e as { userCancelled?: boolean; code?: string; message?: string } | null;
  if (!err || typeof err !== 'object') return false;
  if (err.userCancelled === true) return true;
  const code = String(err.code ?? '').toUpperCase();
  if (code === 'USER_CANCELLED' || code === '1' || code.includes('CANCEL')) return true;
  return /user\s*cancel|cancelled?\s*by\s*user/i.test(String(err.message ?? ''));
}

export interface BillingPackage {
  identifier: string;
  price: string;
  raw: unknown;
}

/** Real packages from the current RevenueCat offering (null-safe). */
export async function getOfferings(): Promise<{ lifetime?: BillingPackage; annual?: BillingPackage }> {
  const Purchases = (await import('react-native-purchases')).default;
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  const pick = (id: string): BillingPackage | undefined => {
    const p = pkgs.find((x) => x.identifier === id);
    return p ? { identifier: p.identifier, price: p.product.priceString, raw: p } : undefined;
  };
  return { lifetime: pick('$rc_lifetime'), annual: pick('$rc_annual') };
}

export async function purchasePackage(pkg: BillingPackage): Promise<boolean> {
  const Purchases = (await import('react-native-purchases')).default;
  const { customerInfo } = await Purchases.purchasePackage(pkg.raw as never);
  return customerInfo.entitlements.active[ENTITLEMENT_ID] != null;
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[ENTITLEMENT_ID] != null;
  } catch {
    return false;
  }
}
