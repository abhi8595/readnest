import { create } from 'zustand';
import type { BookRow } from '@/db/schema';
import type { FocusMode, IrlenTintId, ReaderFontId, ReaderThemeId } from '@/theme/tokens';

export interface TocItem {
  id: string;
  label: string;
  href: string;
  level: number;
}

interface ReaderState {
  book: BookRow | null;
  /** 0..1 progress + opaque location (CFI / page / offset) */
  progress: number;
  location: string | null;
  toc: TocItem[];
  chapterLabel: string | null;
  page: number;
  pageCount: number | null;
  chromeVisible: boolean;
  // live overrides (persisted to reading_settings on change, debounced by caller)
  theme: ReaderThemeId;
  font: ReaderFontId;
  customFontUri: string | null;
  fontSize: number;
  fontWeight: number;
  lineSpacing: number;
  margin: 'S' | 'M' | 'L' | 'XL';
  hyphenation: boolean;
  pageMode: 'paginated' | 'scroll';
  orientation: 'system' | 'portrait' | 'landscape';
  // ── Phase 4 (newfeaturePlan.md D1/D2): per-book focus aids ──
  focusMode: FocusMode;
  bionic: boolean;
  irlenTint: IrlenTintId;
  openBook: (b: BookRow, saved?: Partial<ReaderState>) => void;
  closeBook: () => void;
  setPosition: (p: { progress: number; location?: string; page?: number; pageCount?: number; chapterLabel?: string | null }) => void;
  setToc: (t: TocItem[]) => void;
  toggleChrome: () => void;
  setChrome: (v: boolean) => void;
  applySettings: (p: Partial<ReaderState>) => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  book: null,
  progress: 0,
  location: null,
  toc: [],
  chapterLabel: null,
  page: 1,
  pageCount: null,
  chromeVisible: false,
  theme: 'day',
  font: 'crimson',
  customFontUri: null,
  fontSize: 18,
  fontWeight: 400,
  lineSpacing: 1.6,
  margin: 'M',
  hyphenation: true,
  pageMode: 'paginated',
  orientation: 'system',
  focusMode: 'off',
  bionic: false,
  irlenTint: 'none',
  openBook: (book, saved) =>
    set({
      book,
      progress: book.reading_progress ?? 0,
      location: book.last_location ?? null,
      toc: [],
      chapterLabel: null,
      page: 1,
      pageCount: book.page_count ?? null,
      chromeVisible: false,
      ...(saved ?? {}),
    }),
  closeBook: () => set({ book: null, toc: [], chapterLabel: null }),
  setPosition: (p) =>
    set((s) => ({
      progress: p.progress,
      location: p.location ?? s.location,
      page: p.page ?? s.page,
      pageCount: p.pageCount ?? s.pageCount,
      chapterLabel: p.chapterLabel !== undefined ? p.chapterLabel : s.chapterLabel,
    })),
  setToc: (toc) => set({ toc }),
  toggleChrome: () => set((s) => ({ chromeVisible: !s.chromeVisible })),
  setChrome: (chromeVisible) => set({ chromeVisible }),
  applySettings: (p) => set(p),
}));
