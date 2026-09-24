import { create } from 'zustand';
import type { FocusMode, IrlenTintId, ReaderFontId, ReaderThemeId } from '@/theme/tokens';

export type AppTheme = 'system' | 'light' | 'dark';
export type SortKey = 'last_read' | 'added' | 'title' | 'author' | 'size' | 'modified';
export type ViewMode = 'grid' | 'list';

interface SettingsState {
  onboarded: boolean;
  appTheme: AppTheme;
  sortKey: SortKey;
  viewMode: ViewMode;
  libraryTab: 'all' | 'authors' | 'series' | 'collections' | 'downloads';
  // global reader defaults (per-book overrides in sqlite)
  defaultTheme: ReaderThemeId;
  defaultFont: ReaderFontId;
  defaultFontSize: number;
  defaultLineSpacing: number;
  defaultMargin: 'S' | 'M' | 'L' | 'XL';
  hyphenation: boolean;
  brightnessOverride: number | null;
  pageMode: 'paginated' | 'scroll';
  keepScreenOn: boolean;
  showAdBanner: boolean;
  lastScanAt: number | null;
  /** Daily reading goal in minutes (Settings stats card). */
  dailyGoalMinutes: number;
  // ── Phase 4 (newfeaturePlan.md): focus / bionic / tint / manga ──
  /** D1 global default; per-book override lives in reading_settings. */
  focusMode: FocusMode;
  /** D2 global default; per-book override lives in reading_settings. */
  bionic: boolean;
  /** D2 global default; per-book override lives in reading_settings. */
  irlenTint: IrlenTintId;
  /** F3 manga/comic defaults (global; comics have no text reflow). */
  mangaSpread: boolean;
  mangaRtl: boolean;
  // ── Phase 5 (newfeaturePlan.md B1): PDF article-mode defaults ──
  /** Reflow extracted PDF text instead of native pages (needs text layer). */
  pdfArticleMode: boolean;
  /** Margin-crop preset; applied in Article text view (native pages can't crop). */
  pdfCrop: 'none' | 'narrow' | 'wide';
  // ── Phase 7 (newfeaturePlan.md E1/E2): translate defaults (BYOK) ──
  translateProvider: 'deepl' | 'google';
  /** BCP-47 target language for translate + bilingual view. */
  translateTarget: string;
  /** E2 bilingual paragraph view (per-book accordion in the reader). */
  bilingual: boolean;
  /** True once kv-backed settings have been loaded (Gate waits on this). */
  hasHydrated: boolean;
  set: (p: Partial<SettingsState>) => void;
  hydrate: () => Promise<void>;
}

const SETTINGS_KV_KEY = 'app-settings-v1';

const PERSISTED_KEYS = [
  'onboarded', 'appTheme', 'sortKey', 'viewMode', 'libraryTab',
  'defaultTheme', 'defaultFont', 'defaultFontSize', 'defaultLineSpacing',
  'defaultMargin', 'hyphenation', 'brightnessOverride', 'pageMode',
  'keepScreenOn', 'showAdBanner', 'lastScanAt', 'dailyGoalMinutes',
  'focusMode', 'bionic', 'irlenTint', 'mangaSpread', 'mangaRtl',
  'pdfArticleMode', 'pdfCrop',
  'translateProvider', 'translateTarget', 'bilingual',
] as const;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function persistSoon(state: SettingsState): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void (async () => {
      try {
        const { kvSet } = await import('@/db/repositories');
        const snapshot: Record<string, unknown> = {};
        for (const k of PERSISTED_KEYS) snapshot[k] = state[k];
        await kvSet(SETTINGS_KV_KEY, JSON.stringify(snapshot));
      } catch { /* offline / db not ready — keep in-memory */ }
    })();
  }, 250);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  onboarded: false,
  appTheme: 'system',
  sortKey: 'last_read',
  viewMode: 'grid',
  libraryTab: 'all',
  defaultTheme: 'day',
  defaultFont: 'crimson',
  defaultFontSize: 18,
  defaultLineSpacing: 1.6,
  defaultMargin: 'M',
  hyphenation: true,
  brightnessOverride: null,
  pageMode: 'paginated',
  keepScreenOn: true,
  showAdBanner: true,
  lastScanAt: null,
  dailyGoalMinutes: 20,
  focusMode: 'off',
  bionic: false,
  irlenTint: 'none',
  mangaSpread: false,
  mangaRtl: false,
  pdfArticleMode: false,
  pdfCrop: 'none',
  translateProvider: 'deepl',
  translateTarget: 'es',
  bilingual: false,
  hasHydrated: false,
  set: (p) => {
    set(p);
    void persistSoon(get());
  },
  hydrate: async () => {
    if (get().hasHydrated) return;
    try {
      const { kvGet } = await import('@/db/repositories');
      const raw = await kvGet(SETTINGS_KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsState>;
        const clean: Partial<SettingsState> = {};
        for (const k of PERSISTED_KEYS) {
          if (parsed[k] !== undefined) (clean as Record<string, unknown>)[k] = parsed[k];
        }
        set({ ...clean, hasHydrated: true });
        return;
      }
    } catch { /* corrupted / missing — fall through to defaults */ }
    set({ hasHydrated: true });
  },
}));
