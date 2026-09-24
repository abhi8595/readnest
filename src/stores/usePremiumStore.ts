import { create } from 'zustand';

interface PremiumState {
  isPremium: boolean;
  /** 'free' | 'trial' | 'lifetime' | 'subscription' */
  plan: string;
  /** RevenueCat customer info updated at */
  syncedAt: number | null;
  /** Paywall entry context for analytics/copy */
  lastPaywallSource: string | null;
  /**
   * Tri-state so UI never flashes the paywall while resolving:
   * loading → entitled | not_entitled. `isPremium` mirrors entitled.
   */
  status: 'loading' | 'entitled' | 'not_entitled';
  setPremium: (v: boolean, plan?: string) => void;
  setStatus: (s: PremiumState['status']) => void;
  setPaywallSource: (s: string | null) => void;
}

export const usePremiumStore = create<PremiumState>((set) => ({
  isPremium: false,
  plan: 'free',
  syncedAt: null,
  lastPaywallSource: null,
  status: 'loading',
  setPremium: (isPremium, plan = 'lifetime') => set({
    isPremium,
    plan: isPremium ? plan : 'free',
    syncedAt: Date.now(),
    status: isPremium ? 'entitled' : 'not_entitled',
  }),
  setStatus: (status) => set((s) => ({
    status,
    isPremium: status === 'entitled' ? true : status === 'not_entitled' ? false : s.isPremium,
  })),
  setPaywallSource: (lastPaywallSource) => set({ lastPaywallSource }),
}));

export const PREMIUM_FEATURES = [
  { id: 'no-ads', title: 'Ad-free reading', desc: 'No banners, no interstitials. Ever.' },
  { id: 'drive-sync', title: 'Google Drive sync', desc: 'Books, progress, bookmarks & notes across devices.' },
  { id: 'bg-tts', title: 'Background read-aloud', desc: 'Listen with the screen locked + sleep timer.' },
  { id: 'fonts', title: 'Custom fonts', desc: 'Upload your own TTF/OTF reading fonts.' },
  { id: 'colors', title: '8 highlight colors', desc: 'Double the palette for notes & quotes.' },
  { id: 'thumbs', title: 'Page thumbnails', desc: 'Visual scrub strip for fast navigation.' },
] as const;
